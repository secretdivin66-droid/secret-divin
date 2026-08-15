// Initie un paiement FedaPay pour un abonnement Free/Premium/Pro (`plans`,
// voir grant_subscription() dans schema.sql). Ce domaine de paiement n'a
// jamais eu de moyen de paiement réel branché jusqu'ici — Chariow a été
// délibérément réorienté vers les packs de crédits le 2026-08-10
// (SubscribeButton était retombé sur le placeholder CinetPay). FedaPay
// devient donc le SEUL chemin de paiement réel pour ce domaine, pas un
// repli derrière un autre — voir fedapay-initiate-checkout pour le modèle
// dont cette fonction s'inspire.
//
// Sécurité identique à fedapay-initiate-checkout :
// - JWT Supabase requis.
// - l'email est résolu côté serveur depuis `profiles`, jamais accepté du
//   client.
// - le prix vient uniquement de `plans` (le seul planId envoyé par le
//   client, jamais un montant) — FedaPay n'a pas de notion de "produit"
//   pré-créé, le montant est un paramètre direct de la transaction,
//   toujours dérivé de cette table. Revérifié côté fedapay-webhook avant
//   tout grant_subscription (défense en profondeur).
// - `free` (prix 0) est explicitement refusé : ce plan ne passe jamais
//   par un paiement, voir PricingPage.tsx qui ne rend même pas
//   SubscribeButton pour lui.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Même liste/indicatifs que fedapay-initiate-checkout et
// ChariowContactModal.tsx.
const COUNTRY_CALLING_CODES: Record<string, string> = {
  CI: '225',
  SN: '221',
  BF: '226',
  ML: '223',
  BJ: '229',
  TG: '228',
  GN: '224',
  CM: '237',
  GA: '241',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

interface InitiateCheckoutBody {
  planId: string;
  callbackUrl?: string;
  firstName?: string;
  lastName?: string;
  phone?: { number?: string; countryCode?: string };
}

interface FedaPayTransactionCreateResponse {
  'v1/transaction'?: { id?: number | string };
}

interface FedaPayTokenResponse {
  token?: string;
  url?: string;
}

function fedaPayApiBase(secretKey: string): string {
  return secretKey.startsWith('sk_live_') ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com';
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
    const { planId, callbackUrl, firstName, lastName, phone } = body;

    if (typeof planId !== 'string' || !planId) {
      return jsonResponse({ error: 'invalid_plan_id' }, 400);
    }

    if (
      typeof firstName !== 'string' || !firstName.trim() ||
      typeof lastName !== 'string' || !lastName.trim() ||
      typeof phone?.number !== 'string' || !phone.number.trim() ||
      typeof phone?.countryCode !== 'string' || !phone.countryCode.trim()
    ) {
      return jsonResponse({ error: 'missing_contact_info' }, 400);
    }

    const callingCode = COUNTRY_CALLING_CODES[phone.countryCode.trim().toUpperCase()];
    if (!callingCode) {
      return jsonResponse({ error: 'unsupported_country' }, 400);
    }

    const apiKey = Deno.env.get('FEDAPAY_SECRET_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('id, price, currency, name')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'unknown_plan' }, 400);
    }
    if (!plan.price || plan.price <= 0) {
      return jsonResponse({ error: 'plan_not_payable' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer avec FedaPay.' }, 400);
    }

    const internalReference = crypto.randomUUID();
    const apiBase = fedaPayApiBase(apiKey);

    const fedaPayRequestBody = {
      description: `Abonnement ${plan.name} - Secret Divin`,
      amount: plan.price,
      currency: { iso: plan.currency },
      callback_url: callbackUrl ?? undefined,
      customer: {
        firstname: firstName.trim(),
        lastname: lastName.trim(),
        email: profile.email,
        phone: `${callingCode}${phone.number.trim().replace(/\D/g, '')}`,
      },
      // Repris tel quel dans le webhook (voir fedapay-webhook,
      // handleSubscriptionTransaction) — "userId" vient toujours du JWT
      // ci-dessus, jamais du corps de la requête.
      custom_metadata: {
        type: 'subscription',
        internalReference,
        planId: plan.id,
        userId: user.id,
      },
    };

    let transactionId: number | string | undefined;
    try {
      const createResponse = await fetch(`${apiBase}/v1/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(fedaPayRequestBody),
      });
      const createJson: FedaPayTransactionCreateResponse | null = await createResponse.json().catch(() => null);
      transactionId = createJson?.['v1/transaction']?.id;
      if (!createResponse.ok || !transactionId) {
        console.error('fedapay-subscription-checkout: transaction creation failed', { internalReference, status: createResponse.status, body: createJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-subscription-checkout: call to FedaPay failed', { internalReference, error: err });
      return jsonResponse({ error: 'fedapay_unreachable' }, 502);
    }

    let checkoutUrl: string | undefined;
    try {
      const tokenResponse = await fetch(`${apiBase}/v1/transactions/${transactionId}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}),
      });
      const tokenJson: FedaPayTokenResponse | null = await tokenResponse.json().catch(() => null);
      checkoutUrl = tokenJson?.url;
      if (!tokenResponse.ok || !checkoutUrl) {
        console.error('fedapay-subscription-checkout: token generation failed', { internalReference, transactionId, status: tokenResponse.status, body: tokenJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-subscription-checkout: token call to FedaPay failed', { internalReference, transactionId, error: err });
      return jsonResponse({ error: 'fedapay_unreachable' }, 502);
    }

    // Log immédiat (PENDING) — fedapay-webhook fait passer cette même ligne
    // à COMPLETED (corrélation par deposit_id = internalReference), même
    // pattern que fedapay-initiate-checkout/fedapay-marabout-checkout.
    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: internalReference,
      client_reference_id: internalReference,
      status: 'PENDING',
      amount: plan.price,
      currency: plan.currency,
      provider: 'fedapay',
      environment: apiKey.startsWith('sk_live_') ? 'production' : 'sandbox',
      raw_payload: { request: fedaPayRequestBody, transactionId },
    });

    if (insertError) {
      console.error('fedapay-subscription-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ checkoutUrl, reference: internalReference }, 200);
  } catch (err) {
    console.error('fedapay-subscription-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
