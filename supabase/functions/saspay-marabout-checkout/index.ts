// Initie un paiement SasPay pour l'abonnement marabout (Standard 9900
// FCFA/an ou VIP 29000 FCFA/an — voir marabout_subscription_plan,
// migration 0038). Provider PRINCIPAL depuis son introduction (2026-10) —
// Chariow puis FedaPay restent en repli silencieux côté frontend (voir
// MaraboutPaymentButton.tsx). Voir saspay-webhook pour l'activation
// finale (activate_marabout_subscription_via_payment).
//
// Même modèle que saspay-initiate-checkout (packs de crédits) : pas de
// prénom/nom/téléphone à collecter, customer_email/customer_name résolus
// côté serveur depuis `profiles`. maraboutId résolu depuis SA PROPRE
// ligne `marabouts` (via user.id du JWT), jamais depuis un id fourni par
// le client — un utilisateur ne peut donc jamais payer l'abonnement d'un
// autre marabout.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface InitiateCheckoutBody {
  tier?: string;
  returnUrl?: string;
}

interface SaspaySessionResponse {
  success?: boolean;
  data?: {
    id?: string;
    checkout_url?: string;
    status?: string;
  };
  error?: { message?: string; code?: string } | Record<string, string[]>;
}

// Pays où SasPay a une lacune connue (ex. Orange Money Guinée —
// orange_gn marqué is_active=false dans leur catalogue, vérifié en
// direct le 2026-10-09) — refusé ICI, avant d'appeler SasPay, plutôt que
// de laisser le client arriver sur une page de paiement où son opérateur
// n'apparaît pas. Le frontend route alors automatiquement vers Chariow
// (voir MaraboutPaymentButton.tsx, qui traite
// 'country_not_supported_by_saspay' comme un code de repli).
const SASPAY_UNSUPPORTED_COUNTRIES = new Set(['GN']);

// Reconnaît la Guinée dans un champ texte libre non normalisé
// (marabouts.pays, saisi à la main à l'inscription) — couvre les
// graphies les plus courantes, pas une liste exhaustive.
const GUINEA_PROFILE_PATTERNS = [/guin[ée]e?/i, /\bguinea\b/i, /conakry/i, /^gn$/i];

// Retourne true/false quand le champ est renseigné (Guinée ou pas), null
// seulement quand le champ est VIDE — ne pas confondre les deux : un
// profil explicitement rempli avec un autre pays doit arrêter la
// résolution ici, jamais tomber sur le repli IP (voir resolveCountryCode).
function isGuineaProfileText(text: string | null | undefined): boolean | null {
  const normalized = text?.trim();
  if (!normalized) return null;
  return GUINEA_PROFILE_PATTERNS.some((re) => re.test(normalized));
}

// Repli IP → pays via ipwho.is (gratuit, HTTPS, aucune clé requise) —
// timeout court et échec silencieux : une géoloc ratée ne doit JAMAIS
// bloquer un paiement, juste faire perdre cette optimisation de routage.
async function countryFromIp(req: Request): Promise<string | null> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!ip) return null;
  try {
    const res = await fetch(`https://ipwho.is/${ip}?fields=country_code,success`, { signal: AbortSignal.timeout(2000) });
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) return null;
    return typeof json.country_code === 'string' ? json.country_code : null;
  } catch {
    return null;
  }
}

async function resolveCountryCode(req: Request, profileCountry: string | null | undefined): Promise<string | null> {
  const fromProfile = isGuineaProfileText(profileCountry);
  if (fromProfile === true) return 'GN';
  if (fromProfile === false) return null; // profil renseigné, explicitement pas la Guinée — pas de repli IP
  return await countryFromIp(req); // profil vide uniquement
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'missing_authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'not_authenticated' }, 401);
    }

    const body: InitiateCheckoutBody = await req.json();
    const { tier, returnUrl } = body;

    if (tier !== 'standard' && tier !== 'vip') {
      return jsonResponse({ error: 'invalid_tier' }, 400);
    }

    const apiKey = Deno.env.get('SASPAY_API_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: marabout, error: maraboutError } = await adminClient
      .from('marabouts')
      .select('id, pays')
      .eq('user_id', user.id)
      .maybeSingle();

    if (maraboutError || !marabout) {
      return jsonResponse({ error: 'no_marabout_profile' }, 400);
    }

    const countryCode = await resolveCountryCode(req, marabout.pays);
    if (countryCode && SASPAY_UNSUPPORTED_COUNTRIES.has(countryCode)) {
      return jsonResponse({ error: 'country_not_supported_by_saspay' }, 400);
    }

    const { data: plan, error: planError } = await adminClient
      .from('marabout_subscription_plan')
      .select('price, currency')
      .eq('id', tier)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'plan_not_configured' }, 500);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer.' }, 400);
    }

    const customerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email.split('@')[0];

    const saspayRequestBody: Record<string, unknown> = {
      amount: plan.price.toFixed(2),
      currency: plan.currency,
      description: `Abonnement marabout ${tier} — Secret Divin`,
      customer_email: profile.email,
      customer_name: customerName,
      metadata: { product: 'marabout_subscription', maraboutId: marabout.id, userId: user.id, tier },
    };
    if (returnUrl) {
      saspayRequestBody.return_url = returnUrl;
    }

    let saspayResponseJson: SaspaySessionResponse | null = null;
    let saspayHttpStatus = 0;
    try {
      const saspayResponse = await fetch('https://api.saspay.me/api/v1/checkout-sessions/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(saspayRequestBody),
      });
      saspayHttpStatus = saspayResponse.status;
      saspayResponseJson = await saspayResponse.json().catch(() => null);
    } catch (err) {
      console.error('saspay-marabout-checkout: call to SasPay failed', { maraboutId: marabout.id, tier, error: err });
      return jsonResponse({ error: 'saspay_unreachable' }, 502);
    }

    if (saspayHttpStatus !== 201 || !saspayResponseJson?.success || !saspayResponseJson.data?.id || !saspayResponseJson.data?.checkout_url) {
      console.error('saspay-marabout-checkout: unexpected SasPay response', {
        maraboutId: marabout.id,
        tier,
        httpStatus: saspayHttpStatus,
        response: saspayResponseJson,
      });
      return jsonResponse({ error: 'unexpected_response' }, 502);
    }

    const session = saspayResponseJson.data;

    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: session.id,
      client_reference_id: session.id,
      status: 'PENDING',
      amount: plan.price,
      currency: plan.currency,
      provider: 'saspay',
      environment: 'production',
      raw_payload: { request: saspayRequestBody, response: saspayResponseJson },
    });

    if (insertError) {
      console.error('saspay-marabout-checkout: insert failed', { sessionId: session.id, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ checkoutUrl: session.checkout_url, reference: session.id }, 200);
  } catch (err) {
    console.error('saspay-marabout-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
