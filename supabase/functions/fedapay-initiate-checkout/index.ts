// Initie un paiement FedaPay (mobile money/carte via leur checkout hébergé)
// pour un pack de crédits — voir fedapay-webhook pour la confirmation finale
// de la vente, et chariow-initiate-checkout pour le modèle dont cette
// fonction s'inspire (même principes de sécurité, adaptés aux différences
// réelles de l'API FedaPay confirmées en live ci-dessous).
//
// Différences confirmées avec Chariow (testé en live sur le sandbox FedaPay
// le 2026-08-15, transaction #487882) :
// - FedaPay n'a PAS de notion de "produit" pré-créé côté dashboard : le
//   montant est un paramètre direct de la création de transaction
//   (`amount`), toujours dérivé de `credit_packs.price` ici, jamais accepté
//   du client — donc pas de colonne `fedapay_product_id`/vérif
//   "not_configured" nécessaire, contrairement à Chariow.
// - `custom_metadata` est un champ RÉEL de l'API (confirmé : envoyé à la
//   création, revient identique sur GET /v1/transactions/:id) — c'est ce
//   que fedapay-webhook relit après coup pour retrouver userId/packId.
// - Le flux est en 2 appels, conforme au SDK officiel (fedapay-node,
//   src/Transaction.ts: create() puis generateToken()) : POST
//   /v1/transactions crée la transaction, POST
//   /v1/transactions/:id/token renvoie { token, url } — `url` est la page
//   de paiement hébergée à rediriger le client vers. La réponse de create()
//   contient parfois déjà un `payment_url` inline, mais ce n'est pas
//   documenté officiellement : on utilise l'appel token() explicite,
//   toujours fiable d'après le SDK.
// - `customer.phone` est une chaîne UNIQUE (indicatif + numéro collés, ex.
//   "22967666776"), pas un objet {number, country_code} comme Chariow —
//   confirmé dans le SDK officiel (test/CustomerTest.ts). Le frontend
//   envoie indicatif ISO alpha-2 + numéro séparés (même form
//   ChariowContactModal réutilisé) ; recombinés ici via
//   COUNTRY_CALLING_CODES.
//
// Sécurité : mêmes principes que chariow-initiate-checkout — JWT requis,
// email toujours résolu côté serveur depuis `profiles`, jamais accepté du
// client ; clé secrète FedaPay ne quitte jamais ce runtime ; le montant
// vient toujours de `credit_packs`, jamais du corps de la requête.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Même liste de pays que ChariowContactModal.tsx (usage réel de Secret
// Divin, zone FCFA francophone) — indicatifs confirmés via les libellés
// déjà affichés côté UI ("Côte d'Ivoire (+225)", etc.), pas une supposition
// séparée.
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
  packId: string;
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

    // Suspension temporaire des 5 packs crédits (Gemini API prod pas
    // encore configuré) — voir chariow-initiate-checkout pour le même
    // patch, même secret partagé, même raisonnement fail-safe (seule la
    // valeur exacte "true" active). Ne concerne QUE cette fonction ;
    // fedapay-marabout-checkout/fedapay-subscription-checkout sont des
    // fonctions séparées, jamais affectées.
    if (Deno.env.get('CREDIT_PACKS_ENABLED') !== 'true') {
      return jsonResponse({
        error: 'credit_packs_disabled',
        message: 'Rechargement temporairement indisponible — Nous améliorons notre système. Merci de réessayer dans quelques instants 🙏',
      }, 503);
    }

    const body: InitiateCheckoutBody = await req.json();
    const { packId, callbackUrl, firstName, lastName, phone } = body;

    if (typeof packId !== 'string' || !packId) {
      return jsonResponse({ error: 'invalid_pack_id' }, 400);
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

    // Seule source de vérité pour le prix : jamais fait confiance à un
    // montant venant du client (contrairement à Chariow, FedaPay accepte un
    // montant en paramètre direct, donc cette vérification est la SEULE
    // protection à la création — pas de product_id qui fixerait déjà le
    // prix côté prestataire).
    const { data: pack, error: packError } = await adminClient
      .from('credit_packs')
      .select('id, price, currency, credits')
      .eq('id', packId)
      .maybeSingle();

    if (packError || !pack) {
      return jsonResponse({ error: 'unknown_pack' }, 400);
    }
    if (!pack.price || pack.price <= 0) {
      return jsonResponse({ error: 'pack_not_payable' }, 400);
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
      description: `Achat pack ${pack.id} - Secret Divin`,
      amount: pack.price,
      currency: { iso: pack.currency },
      callback_url: callbackUrl ?? undefined,
      customer: {
        firstname: firstName.trim(),
        lastname: lastName.trim(),
        email: profile.email,
        // Indicatif + numéro collés sans "+", format confirmé par le SDK
        // officiel (ex. "22967666776").
        phone: `${callingCode}${phone.number.trim().replace(/\D/g, '')}`,
      },
      // Repris tel quel dans le webhook (voir fedapay-webhook,
      // FedaPayCustomMetadata) — confirmé en live que ce champ persiste sur
      // GET /v1/transactions/:id. "userId" vient toujours du JWT ci-dessus,
      // jamais du corps de la requête.
      custom_metadata: {
        type: 'credit_pack',
        internalReference,
        packId: pack.id,
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
        console.error('fedapay-initiate-checkout: transaction creation failed', { internalReference, status: createResponse.status, body: createJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-initiate-checkout: call to FedaPay failed', { internalReference, error: err });
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
        console.error('fedapay-initiate-checkout: token generation failed', { internalReference, transactionId, status: tokenResponse.status, body: tokenJson });
        return jsonResponse({ error: 'fedapay_checkout_failed', reference: internalReference }, 502);
      }
    } catch (err) {
      console.error('fedapay-initiate-checkout: token call to FedaPay failed', { internalReference, transactionId, error: err });
      return jsonResponse({ error: 'fedapay_unreachable' }, 502);
    }

    // Log immédiat (PENDING) — fedapay-webhook fait passer cette même ligne
    // à COMPLETED (corrélation par deposit_id = internalReference), même
    // pattern que chariow-pulse-webhook.
    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: internalReference,
      client_reference_id: internalReference,
      status: 'PENDING',
      amount: pack.price,
      currency: pack.currency,
      provider: 'fedapay',
      environment: apiKey.startsWith('sk_live_') ? 'production' : 'sandbox',
      raw_payload: { request: fedaPayRequestBody, transactionId },
    });

    if (insertError) {
      console.error('fedapay-initiate-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ checkoutUrl, reference: internalReference }, 200);
  } catch (err) {
    console.error('fedapay-initiate-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
