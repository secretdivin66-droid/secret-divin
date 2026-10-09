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
import countries from 'npm:i18n-iso-countries@7';
import frLocale from 'npm:i18n-iso-countries@7/langs/fr.json' with { type: 'json' };
import enLocale from 'npm:i18n-iso-countries@7/langs/en.json' with { type: 'json' };

countries.registerLocale(frLocale);
countries.registerLocale(enLocale);

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

// Normalise un texte libre (accents, casse, espaces/apostrophes/tirets)
// pour le comparer à un nom de pays — marabouts.pays est saisi à la main
// à l'inscription, jamais normalisé à la saisie.
function normalizeCountryText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

// Table nom-normalisé -> code ISO alpha-2, construite une fois au
// démarrage depuis i18n-iso-countries (fr puis en, mêmes locales que
// ChariowContactModal.tsx côté frontend) — couvre les ~245 pays/
// territoires au lieu d'une liste de regex à la main limitée à la
// Guinée comme avant.
const COUNTRY_NAME_TO_CODE = new Map<string, string>();
for (const [code, name] of Object.entries(countries.getNames('fr'))) {
  COUNTRY_NAME_TO_CODE.set(normalizeCountryText(name as string), code);
}
for (const [code, name] of Object.entries(countries.getNames('en'))) {
  const key = normalizeCountryText(name as string);
  if (!COUNTRY_NAME_TO_CODE.has(key)) COUNTRY_NAME_TO_CODE.set(key, code);
}

// Variantes informelles vues dans marabouts.pays (texte libre) que la
// table ci-dessus ne reconnaît pas comme nom de pays officiel.
const INFORMAL_COUNTRY_ALIASES: Record<string, string> = {
  conakry: 'GN',
  burkina: 'BF',
  rci: 'CI',
};

type ProfileCountryResolution = string | 'EMPTY' | 'UNRECOGNIZED';

function resolveProfileCountryCode(text: string | null | undefined): ProfileCountryResolution {
  const normalized = text?.trim();
  if (!normalized) return 'EMPTY';
  const key = normalizeCountryText(normalized);
  return COUNTRY_NAME_TO_CODE.get(key) ?? INFORMAL_COUNTRY_ALIASES[key] ?? 'UNRECOGNIZED';
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
  const fromProfile = resolveProfileCountryCode(profileCountry);
  if (fromProfile === 'EMPTY') return await countryFromIp(req); // profil vide uniquement
  if (fromProfile === 'UNRECOGNIZED') return null; // profil renseigné mais non reconnu — jamais de repli IP
  return fromProfile; // code ISO reconnu depuis le texte du profil
}

interface SaspayNetwork {
  country?: string;
  code?: string;
  is_active?: boolean;
}
interface SaspayCountryRow {
  id?: string;
  iso_code?: string;
}

// Pays forcés vers Chariow indépendamment du catalogue SasPay — décision
// produit, pas automatique. La Guinée reste ici même si mtn_gn est actif
// (vérifié le 2026-10-09) : Orange Money (orange_gn, inactif) y est jugé
// trop dominant pour laisser un client guinéen sur SasPay avec un seul
// opérateur restant. Les autres pays suivent la règle générale ci-dessous
// (au moins un réseau actif suffit), voir l'échange du 2026-10-09 où
// Sénégal/Bénin/Cameroun ont été explicitement exclus de ce traitement
// strict malgré chacun un réseau mineur inactif (e_money_sn/coris_bj/
// eu_mobile_cm).
const SASPAY_FORCED_UNSUPPORTED_COUNTRIES = new Set(['GN']);

// Vérifie en direct auprès de SasPay si AU MOINS UN réseau mobile money
// catalogué pour ce pays est actif — un pays n'est traité comme non
// couvert par SasPay (et basculé vers Chariow, voir
// MaraboutPaymentButton.tsx qui traite 'country_not_supported_by_saspay'
// comme un code de repli) que s'il a au moins un réseau catalogué et
// qu'AUCUN n'est actif. Un pays avec un réseau mineur inactif mais
// d'autres actifs (ex. Sénégal/Bénin/Cameroun) reste donc sur SasPay —
// seule la Guinée est traitée plus strictement, via
// SASPAY_FORCED_UNSUPPORTED_COUNTRIES ci-dessus. Aucun réseau catalogué
// pour ce pays, ou tout échec réseau/API -> true (ouvert par défaut) :
// ni l'absence de données ni un problème de ce contrôle ne doivent
// jamais bloquer un paiement SasPay qui aurait fonctionné — même
// principe que le repli IP ci-dessus.
async function isSaspayCountrySupported(countryCode: string, apiKey: string): Promise<boolean> {
  try {
    const [networksRes, countriesRes] = await Promise.all([
      fetch('https://api.saspay.me/api/v1/networks/?page_size=100', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      }),
      fetch('https://api.saspay.me/api/v1/countries/?page_size=100', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      }),
    ]);
    const [networksJson, countriesJson] = await Promise.all([
      networksRes.json().catch(() => null),
      countriesRes.json().catch(() => null),
    ]);

    const networks: SaspayNetwork[] | undefined = networksJson?.data?.results;
    const countryList: SaspayCountryRow[] | undefined = countriesJson?.data;
    if (!Array.isArray(networks) || !Array.isArray(countryList)) return true;

    const countryRow = countryList.find((c) => c.iso_code === countryCode);
    if (!countryRow) return true;

    // 'internal_adjustment' est un pseudo-réseau comptable interne à
    // SasPay (jamais proposé au client sur leur page de paiement) —
    // confirmé présent/inactif sur plusieurs pays sans rapport entre eux
    // le 2026-10-09, exclu pour ne pas fausser le diagnostic.
    const relevant = networks.filter((n) => n.country === countryRow.id && n.code !== 'internal_adjustment');
    if (relevant.length === 0) return true;

    return relevant.some((n) => n.is_active === true);
  } catch (err) {
    console.error('isSaspayCountrySupported: check failed, defaulting to supported', { countryCode, error: err });
    return true;
  }
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
    if (
      countryCode &&
      (SASPAY_FORCED_UNSUPPORTED_COUNTRIES.has(countryCode) || !(await isSaspayCountrySupported(countryCode, apiKey)))
    ) {
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
