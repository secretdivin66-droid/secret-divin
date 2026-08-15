// Initie un paiement FedaPay pour l'abonnement marabout (voir
// marabout_subscription_plan/activate_marabout_subscription_via_payment,
// migration 0032) — même modèle que fedapay-initiate-checkout (packs de
// crédits), adapté à un montant fixe unique au lieu d'un packId choisi par
// le client. Voir fedapay-webhook (handleMaraboutSubscriptionTransaction)
// pour la confirmation finale et l'activation.
//
// Sécurité identique à chariow-marabout-checkout :
// - JWT Supabase requis, jamais appelable anonymement.
// - l'email est résolu côté serveur depuis `profiles`, jamais accepté du
//   client.
// - le marabout ne peut payer QUE son propre profil — maraboutId résolu
//   depuis `marabouts.user_id = auth.uid()`, jamais depuis un id fourni
//   par le client (empêche de payer l'abonnement d'un autre marabout).
// - le prix vient uniquement de `marabout_subscription_plan` (table sans
//   accès public) ; comme pour fedapay-initiate-checkout, FedaPay n'a pas
//   de notion de "produit" pré-créé — le montant est un paramètre direct
//   de la création de transaction, toujours dérivé de cette table, jamais
//   du client. Le montant réellement payé est revérifié côté
//   fedapay-webhook avant toute activation (défense en profondeur).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Même liste/indicatifs que fedapay-initiate-checkout et
// ChariowContactModal.tsx (usage réel de Secret Divin, zone FCFA
// francophone).
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
    const { callbackUrl, firstName, lastName, phone } = body;

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
      .select('price, currency')
      .eq('id', 'standard')
      .maybeSingle();

    if (planError || !plan) {
      return jsonResponse({ error: 'plan_not_configured' }, 500);
    }
    if (!plan.price || plan.price <= 0) {
      return jsonResponse({ error: 'plan_not_payable' }, 500);
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
      description: 'Abonnement marabout - Secret Divin',
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
      // handleMaraboutSubscriptionTransaction) — "userId" du JWT n'est pas
      // nécessaire ici (contrairement aux packs de crédits), l'activation
      // se fait uniquement sur maraboutId.
      custom_metadata: {
        type: 'marabout_subscription',
        internalReference,
        maraboutId: marabout.id,
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
        console.error('fedapay-marabout-checkout: transaction creation failed', { internalReference, status: createResponse.status, body: createJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-marabout-checkout: call to FedaPay failed', { internalReference, error: err });
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
        console.error('fedapay-marabout-checkout: token generation failed', { internalReference, transactionId, status: tokenResponse.status, body: tokenJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-marabout-checkout: token call to FedaPay failed', { internalReference, transactionId, error: err });
      return jsonResponse({ error: 'fedapay_unreachable' }, 502);
    }

    // Log immédiat (PENDING) — fedapay-webhook fait passer cette même ligne
    // à COMPLETED (corrélation par deposit_id = internalReference), même
    // pattern que fedapay-initiate-checkout/chariow-marabout-checkout.
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
      console.error('fedapay-marabout-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ checkoutUrl, reference: internalReference }, 200);
  } catch (err) {
    console.error('fedapay-marabout-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
