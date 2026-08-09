// Initie un paiement Chariow (carte/mobile money via leur checkout hébergé)
// depuis le client (utilisateur connecté), en parallèle de PawaPay (voir
// pawapay-initiate-deposit). Voir chariow-pulse-webhook pour la
// confirmation finale de la vente.
//
// Sécurité (même principes que pawapay-initiate-deposit) :
// - exige un JWT Supabase valide (utilisateur réel connecté) — jamais
//   appelable anonymement, puisqu'elle appelle l'API Chariow avec une clé
//   secrète et crée une vraie transaction.
// - les infos client (email/prénom/nom/téléphone) envoyées à Chariow sont
//   TOUJOURS résolues côté serveur depuis `profiles` via le user_id du
//   JWT, jamais acceptées depuis le corps de la requête — un client ne
//   peut donc pas faire un achat au nom d'un autre utilisateur ni forger
//   un profil arbitraire.
// - contrairement à PawaPay, l'API checkout Chariow ne prend PAS de
//   montant en paramètre (POST /v1/checkout : product_id, email,
//   first_name, last_name, phone, redirect_url, payment_currency,
//   custom_metadata — voir la doc chariow.dev/fr/guides/checkout) : le
//   prix est entièrement déterminé côté Chariow par le produit
//   (plans.chariow_product_id), donc il n'existe pas de champ "amount"
//   qu'un client pourrait falsifier ici. La vérification "montant payé
//   == prix du plan" (défense en profondeur façon PawaPay) se fait quand
//   même, mais seulement côté chariow-pulse-webhook, sur le montant
//   RÉELLEMENT rapporté par Chariow après paiement — cette fonction-ci se
//   contente de vérifier que le planId existe et a un produit Chariow
//   configuré.
// - le token API Chariow (CHARIOW_API_KEY) ne quitte jamais ce runtime.
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
  planId: string;
  redirectUrl?: string;
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
    const { planId, redirectUrl } = body;

    if (typeof planId !== 'string' || !planId) {
      return jsonResponse({ error: 'invalid_plan_id' }, 400);
    }

    const apiKey = Deno.env.get('CHARIOW_API_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Seule source de vérité pour le prix (voir 0025) ET pour le
    // product_id Chariow (voir 0028) : jamais fait confiance à autre
    // chose que la table `plans` pour déterminer ce qui va être facturé.
    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('id, price, currency, chariow_product_id')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'unknown_plan' }, 400);
    }
    if (!plan.price || plan.price <= 0) {
      return jsonResponse({ error: 'plan_not_payable' }, 400);
    }
    if (!plan.chariow_product_id) {
      console.error('chariow-initiate-checkout: plan has no chariow_product_id configured', { planId });
      return jsonResponse({ error: 'plan_not_configured_for_chariow' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, first_name, last_name, phone')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer avec Chariow.' }, 400);
    }

    const internalReference = crypto.randomUUID();

    const chariowRequestBody: Record<string, unknown> = {
      product_id: plan.chariow_product_id,
      email: profile.email,
      first_name: profile.first_name ?? undefined,
      last_name: profile.last_name ?? undefined,
      payment_currency: plan.currency,
      redirect_url: redirectUrl ?? undefined,
      // Repris tel quel dans les Pulses (webhooks) selon la doc — c'est
      // le seul lien fiable entre une vente Chariow et notre
      // payment_transactions/utilisateur/plan. "userId" est TOUJOURS
      // résolu depuis le JWT ci-dessus, jamais depuis le corps de la
      // requête (même principe que "customerId" dans
      // pawapay-initiate-deposit).
      custom_metadata: {
        internalReference,
        planId: plan.id,
        userId: user.id,
      },
    };
    if (profile.phone) {
      // Format exact du sous-objet "phone" (number/country_code) non
      // confirmé indépendamment du texte brut stocké dans profiles.phone
      // — voir le TODO en tête de chariow-pulse-webhook pour le contexte
      // général sur les zones d'incertitude de cette intégration.
      chariowRequestBody.phone = { number: profile.phone };
    }

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
      console.error('chariow-initiate-checkout: call to Chariow failed', { internalReference, error: err });
      return jsonResponse({ error: 'chariow_unreachable' }, 502);
    }

    const step = chariowResponseJson?.data?.step;
    // PENDING/COMPLETED : vocabulaire déjà utilisé par payment_transactions
    // pour PawaPay (voir la CHECK constraint posée en 0024) — réutilisé
    // ici plutôt que d'élargir la contrainte, chariow-pulse-webhook fait
    // le même mapping.
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
      console.error('chariow-initiate-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    if (!chariowResponseJson || chariowResponseJson.message !== 'success' || !step) {
      console.error('chariow-initiate-checkout: unexpected Chariow response', {
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

    // 'completed' / 'already_purchased' : la vente est déjà finalisée côté
    // Chariow, mais on n'active PAS l'abonnement ici — seul
    // chariow-pulse-webhook (canal serveur-à-serveur authentifié, montant
    // reconfirmé) appelle grant_subscription(), pour garder un seul point
    // d'écriture et éviter tout octroi basé sur une réponse que le client
    // pourrait rejouer ou falsifier.
    return jsonResponse(
      {
        step,
        message: chariowResponseJson.data?.message ?? null,
        reference: internalReference,
      },
      200
    );
  } catch (err) {
    console.error('chariow-initiate-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
