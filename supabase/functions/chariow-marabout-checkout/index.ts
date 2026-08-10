// Initie un paiement Chariow pour l'abonnement marabout (5000 FCFA/mois,
// jusqu'ici 100% manuel via WhatsApp + validation admin — voir
// AdminPage.tsx/activate_marabout_subscription). Voir chariow-pulse-webhook
// pour la confirmation finale de la vente (custom_metadata.type ===
// 'marabout_subscription' route vers activate_marabout_subscription_via_payment,
// distincte de la fonction admin manuelle — voir migration 0032).
//
// Même modèle de sécurité que chariow-initiate-checkout (packs de
// crédits) :
// - JWT Supabase requis, jamais appelable anonymement.
// - l'email est résolu côté serveur depuis `profiles`, jamais accepté du
//   client.
// - prénom/nom/téléphone acceptés du corps de la requête (Chariow les
//   exige au checkout, voir chariow-initiate-checkout pour le contexte) —
//   ce sont de simples infos de contact, l'identité qui reçoit
//   l'activation reste déterminée par user.id (JWT) → maraboutId résolu
//   depuis SA PROPRE ligne `marabouts`, jamais depuis un id fourni par le
//   client (un utilisateur ne peut donc jamais payer l'abonnement d'un
//   autre marabout).
// - le prix/product_id viennent uniquement de `marabout_subscription_plan`
//   (table sans accès public, lue seulement ici en service_role) ; le
//   montant réellement payé est revérifié côté chariow-pulse-webhook
//   avant toute activation, même défense en profondeur que pour les
//   packs de crédits.
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
  redirectUrl?: string;
  firstName?: string;
  lastName?: string;
  phone?: { number?: string; countryCode?: string };
}

interface ChariowCheckoutResponse {
  message?: string;
  data?: {
    step?: 'payment' | 'completed' | 'already_purchased';
    payment?: { checkout_url?: string };
    purchase?: { id?: string; status?: string } | null;
    message?: string;
  };
  errors?: unknown[];
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
    const { redirectUrl, firstName, lastName, phone } = body;

    if (
      typeof firstName !== 'string' || !firstName.trim() ||
      typeof lastName !== 'string' || !lastName.trim() ||
      typeof phone?.number !== 'string' || !phone.number.trim() ||
      typeof phone?.countryCode !== 'string' || !phone.countryCode.trim()
    ) {
      return jsonResponse({ error: 'missing_contact_info' }, 400);
    }

    const apiKey = Deno.env.get('CHARIOW_API_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Le marabout ne peut payer QUE son propre profil — résolu depuis
    // user.id (JWT), jamais depuis un id fourni par le client.
    const { data: marabout, error: maraboutError } = await adminClient
      .from('marabouts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (maraboutError || !marabout) {
      return jsonResponse({ error: 'no_marabout_profile' }, 400);
    }

    const { data: plan, error: planError } = await adminClient
      .from('marabout_subscription_plan')
      .select('price, currency, chariow_product_id')
      .eq('id', 'standard')
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'plan_not_configured' }, 500);
    }
    if (!plan.chariow_product_id) {
      console.error('chariow-marabout-checkout: no chariow_product_id configured');
      return jsonResponse({ error: 'not_configured_for_chariow' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer avec Chariow.' }, 400);
    }

    const internalReference = crypto.randomUUID();

    const chariowRequestBody: Record<string, unknown> = {
      product_id: plan.chariow_product_id,
      email: profile.email,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      payment_currency: plan.currency,
      redirect_url: redirectUrl ?? undefined,
      custom_metadata: {
        type: 'marabout_subscription',
        internalReference,
        maraboutId: marabout.id,
        userId: user.id,
      },
      phone: { number: phone.number.trim(), country_code: phone.countryCode.trim() },
    };

    let chariowResponseJson: ChariowCheckoutResponse | null = null;
    try {
      const chariowResponse = await fetch('https://api.chariow.com/v1/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(chariowRequestBody),
      });
      chariowResponseJson = await chariowResponse.json().catch(() => null);
    } catch (err) {
      console.error('chariow-marabout-checkout: call to Chariow failed', { internalReference, error: err });
      return jsonResponse({ error: 'chariow_unreachable' }, 502);
    }

    const step = chariowResponseJson?.data?.step;
    const status = step === 'completed' || step === 'already_purchased' ? 'COMPLETED' : 'PENDING';

    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: internalReference,
      client_reference_id: internalReference,
      status,
      amount: plan.price,
      currency: plan.currency,
      provider: 'chariow',
      environment: apiKey.startsWith('sk_live_') ? 'production' : 'sandbox',
      raw_payload: { request: chariowRequestBody, response: chariowResponseJson },
    });

    if (insertError) {
      console.error('chariow-marabout-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    // Un succès n'a pas de "message":"success" au niveau racine (voir la
    // note dans chariow-initiate-checkout, confirmé en live le
    // 2026-08-10) — `step` présent suffit.
    if (!chariowResponseJson || !step) {
      console.error('chariow-marabout-checkout: unexpected Chariow response', {
        internalReference,
        response: chariowResponseJson,
      });
      return jsonResponse({ error: 'chariow_checkout_failed', reference: internalReference }, 502);
    }

    if (step === 'payment') {
      const checkoutUrl = chariowResponseJson.data?.payment?.checkout_url;
      if (!checkoutUrl) {
        return jsonResponse({ error: 'missing_checkout_url', reference: internalReference }, 502);
      }
      return jsonResponse({ step, checkoutUrl, reference: internalReference }, 200);
    }

    // 'completed' / 'already_purchased' : l'activation elle-même reste
    // uniquement du ressort de chariow-pulse-webhook (canal serveur-à-
    // serveur authentifié, montant reconfirmé).
    return jsonResponse(
      {
        step,
        message: chariowResponseJson.data?.message ?? null,
        reference: internalReference,
      },
      200
    );
  } catch (err) {
    console.error('chariow-marabout-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
