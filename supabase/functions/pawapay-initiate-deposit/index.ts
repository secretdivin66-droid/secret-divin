// Initie un dépôt mobile money PawaPay depuis le client (utilisateur
// connecté). Voir pawapay-callback pour la réception du statut final.
//
// Sécurité :
// - exige un JWT Supabase valide (utilisateur réel connecté) — jamais
//   appelable anonymement, puisqu'elle appelle l'API PawaPay avec un
//   token secret et crée une vraie transaction.
// - "customerId" dans metadata (utilisé par pawapay-callback pour relier
//   le dépôt à un utilisateur) est TOUJOURS résolu côté serveur depuis le
//   JWT, jamais accepté depuis le corps de la requête — un client ne peut
//   donc pas usurper l'identité d'un autre utilisateur pour, par exemple,
//   activer un abonnement à sa place (même principe que
//   supabase/functions/novu-proxy).
// - le token API PawaPay (PAWAPAY_API_TOKEN) ne quitte jamais ce runtime.
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

interface InitiateDepositBody {
  amount: number | string;
  currency: string;
  phoneNumber: string;
  provider: string;
  clientReferenceId: string;
  customerMessage?: string;
  // Champs libres additionnels (ex: planId pour un abonnement) — fusionnés
  // dans le metadata envoyé à PawaPay et repris tel quel par le callback.
  // "customerId"/"userId" sont ignorés s'ils sont fournis ici : voir plus
  // bas, cette valeur est toujours résolue depuis le JWT.
  metadata?: Record<string, string>;
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

    const body: InitiateDepositBody = await req.json();
    const { amount, currency, phoneNumber, provider, clientReferenceId } = body;

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return jsonResponse({ error: 'invalid_amount' }, 400);
    }
    if (typeof currency !== 'string' || !currency) {
      return jsonResponse({ error: 'invalid_currency' }, 400);
    }
    if (typeof phoneNumber !== 'string' || !phoneNumber) {
      return jsonResponse({ error: 'invalid_phone_number' }, 400);
    }
    if (typeof provider !== 'string' || !provider) {
      return jsonResponse({ error: 'invalid_provider' }, 400);
    }
    if (typeof clientReferenceId !== 'string' || !clientReferenceId) {
      return jsonResponse({ error: 'invalid_client_reference_id' }, 400);
    }

    const apiToken = Deno.env.get('PAWAPAY_API_TOKEN');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiToken || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const environment = Deno.env.get('PAWAPAY_ENV') === 'production' ? 'production' : 'sandbox';
    const baseUrl =
      environment === 'production' ? 'https://api.pawapay.io/v2' : 'https://api.sandbox.pawapay.io/v2';

    const depositId = crypto.randomUUID();
    // Ne jamais forcer un nombre fixe de décimales : PawaPay rejette un
    // montant avec des décimales dès que le provider/devise ne les
    // supporte pas (ex: XOF/ORANGE_CIV -> "0 decimal places", vu en
    // sandbox avec "100.00" -> INVALID_AMOUNT). On envoie la
    // représentation numérique la plus simple du montant reçu.
    const amountStr = Number(amount).toString();

    // "customerId" est forcé à l'utilisateur authentifié : ce que le client
    // met dans body.metadata ne peut jamais l'écraser (voir en-tête).
    const safeMetadata: Record<string, string> = { ...(body.metadata ?? {}) };
    delete safeMetadata.customerId;
    delete safeMetadata.userId;
    const metadataEntries: Record<string, string> = {
      orderId: clientReferenceId,
      ...safeMetadata,
      customerId: user.id,
    };
    const metadata = Object.entries(metadataEntries).map(([key, value]) => ({ [key]: value }));

    const pawapayRequestBody = {
      depositId,
      amount: amountStr,
      currency,
      payer: {
        type: 'MMO',
        accountDetails: {
          phoneNumber,
          provider,
        },
      },
      clientReferenceId,
      customerMessage: body.customerMessage ?? 'Secret Divin',
      metadata,
    };

    let pawapayStatus = 'PENDING';
    let pawapayResponseJson: unknown = null;
    let failureReason: unknown = null;

    try {
      const pawapayResponse = await fetch(`${baseUrl}/deposits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(pawapayRequestBody),
      });

      pawapayResponseJson = await pawapayResponse.json().catch(() => null);
      const parsed = pawapayResponseJson as { status?: string; failureReason?: unknown } | null;

      if (parsed?.status) {
        pawapayStatus = parsed.status;
      }
      if (parsed?.failureReason) {
        failureReason = parsed.failureReason;
      }
    } catch (err) {
      console.error('pawapay-initiate-deposit: call to PawaPay failed', { depositId, error: err });
      return jsonResponse({ error: 'pawapay_unreachable' }, 502);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: depositId,
      client_reference_id: clientReferenceId,
      status: pawapayStatus,
      amount: Number(amountStr),
      currency,
      country: null,
      phone_number: phoneNumber,
      provider,
      environment,
      failure_reason: failureReason,
      raw_payload: { request: pawapayRequestBody, response: pawapayResponseJson },
    });

    if (insertError) {
      console.error('pawapay-initiate-deposit: insert failed', { depositId, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ depositId, status: pawapayStatus }, 200);
  } catch (err) {
    console.error('pawapay-initiate-deposit: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
