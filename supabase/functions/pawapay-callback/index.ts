// Reçoit les notifications de statut PawaPay (dépôts mobile money) quand un
// paiement atteint son statut final (COMPLETED/FAILED/REJECTED). Voir
// pawapay-initiate-deposit pour la création de la transaction en amont.
//
// Authenticité : PawaPay ne peut pas envoyer de JWT Supabase (c'est un
// serveur tiers) — cette fonction doit être déployée avec --no-verify-jwt.
// À la place, l'URL enregistrée dans le dashboard PawaPay porte un jeton
// secret en query string (?token=...), comparé à PAWAPAY_CALLBACK_SECRET en
// temps constant. Ce jeton ne doit exister que dans le dashboard PawaPay et
// les secrets Supabase, jamais dans le code ou un commit.
//
// La transaction est TOUJOURS enregistrée dans payment_transactions
// d'abord (source de vérité, raw_payload gardé pour debug/réconciliation).
// La logique métier déclenchée par un statut COMPLETED (ex: activer un
// abonnement via grant_subscription()) tourne ensuite en arrière-plan
// (EdgeRuntime.waitUntil) pour ne jamais retarder le 200 attendu
// rapidement par PawaPay (sinon il retente l'envoi). Un échec de cette
// logique métier est loggé mais ne fait pas échouer la réponse : le
// paiement est déjà durablement enregistré, on ne veut pas que PawaPay
// retente indéfiniment à cause d'un bug de notre côté.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

interface PawaPayCallbackPayload {
  depositId: string;
  status: string;
  amount?: string;
  currency?: string;
  country?: string;
  payer?: {
    type?: string;
    accountDetails?: {
      phoneNumber?: string;
      provider?: string;
    };
  };
  clientReferenceId?: string;
  providerTransactionId?: string;
  metadata?: Record<string, string> | Array<Record<string, string>>;
  failureReason?: { failureCode?: string; failureMessage?: string };
}

// Vérifié empiriquement en sandbox (2026-08-05) : PawaPay renvoie metadata
// dans le callback comme un OBJET PLAT ({"planId": "...", "customerId":
// "..."}), pas comme le tableau documenté par certains exemples/versions
// de leur API ([{ "orderId": "..." }, ...] ou [{fieldName,fieldValue}]).
// On gère les trois formes plutôt que de parier sur une seule, puisque le
// format réel a déjà divergé une fois entre la doc et le comportement live.
function flattenMetadata(metadata: Record<string, string> | Array<Record<string, string>> | undefined): Record<string, string> {
  const flat: Record<string, string> = {};
  if (!metadata) return flat;
  if (!Array.isArray(metadata)) {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') flat[key] = value;
    }
    return flat;
  }
  for (const entry of metadata) {
    if (typeof entry.fieldName === 'string' && typeof entry.fieldValue === 'string') {
      flat[entry.fieldName] = entry.fieldValue;
    } else {
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === 'string') flat[key] = value;
      }
    }
  }
  return flat;
}

// Point d'extension : la seule action métier concrète que ce schéma sait
// faire aujourd'hui est activer un abonnement (grant_subscription, voir
// migration 0020). D'autres domaines (ex: commande de livre sur
// secretmystique.com) vivent hors de ce projet/schéma et devront être
// branchés ici le jour où on aura leurs tables/API.
async function runBusinessLogic(
  supabase: ReturnType<typeof createClient>,
  payload: PawaPayCallbackPayload
) {
  if (payload.status !== 'COMPLETED') return;

  const meta = flattenMetadata(payload.metadata);
  const userId = meta.customerId;
  const planId = meta.planId;

  if (userId && planId) {
    // Ne jamais accorder l'abonnement sans revérifier que le montant
    // RÉELLEMENT reçu par PawaPay correspond au prix du plan (table
    // plans, seule source de vérité — voir migration 0025) : le montant
    // demandé à l'initiation est déjà vérifié côté
    // pawapay-initiate-deposit, mais ce callback doit rester sûr même si
    // ce contrôle amont était contourné, buggé, ou si le payload a été
    // altéré en route.
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('price, currency')
      .eq('id', planId)
      .maybeSingle();

    if (planError || !plan) {
      console.error('pawapay-callback: unknown planId, refusing grant_subscription', {
        depositId: payload.depositId,
        planId,
      });
      return;
    }

    const paidAmount = payload.amount ? Number(payload.amount) : NaN;
    if (payload.currency !== plan.currency || paidAmount !== plan.price) {
      console.error('pawapay-callback: amount/currency mismatch, refusing grant_subscription', {
        depositId: payload.depositId,
        userId,
        planId,
        expected: { price: plan.price, currency: plan.currency },
        received: { amount: payload.amount, currency: payload.currency },
      });
      return;
    }

    const { error } = await supabase.rpc('grant_subscription', {
      p_user_id: userId,
      p_plan_id: planId,
      p_provider: 'pawapay',
      p_provider_reference: payload.providerTransactionId ?? payload.depositId,
    });
    if (error) {
      console.error('pawapay-callback: grant_subscription failed', {
        depositId: payload.depositId,
        userId,
        planId,
        error,
      });
    }
    return;
  }

  console.log('pawapay-callback: COMPLETED sans metadata reconnue, aucune action métier déclenchée', {
    depositId: payload.depositId,
    clientReferenceId: payload.clientReferenceId,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const expectedToken = Deno.env.get('PAWAPAY_CALLBACK_SECRET') ?? '';

    if (!expectedToken || !timingSafeEqual(token, expectedToken)) {
      return jsonResponse({ error: 'not_authorized' }, 401);
    }

    let payload: PawaPayCallbackPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    if (typeof payload.depositId !== 'string' || !payload.depositId) {
      return jsonResponse({ error: 'missing_deposit_id' }, 400);
    }
    if (typeof payload.status !== 'string' || !payload.status) {
      return jsonResponse({ error: 'missing_status' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const environment = Deno.env.get('PAWAPAY_ENV') === 'production' ? 'production' : 'sandbox';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await supabase
      .from('payment_transactions')
      .upsert(
        {
          deposit_id: payload.depositId,
          client_reference_id: payload.clientReferenceId ?? null,
          status: payload.status,
          amount: payload.amount ? Number(payload.amount) : null,
          currency: payload.currency ?? null,
          country: payload.country ?? null,
          phone_number: payload.payer?.accountDetails?.phoneNumber ?? null,
          provider: payload.payer?.accountDetails?.provider ?? null,
          environment,
          failure_reason: payload.failureReason ?? null,
          raw_payload: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'deposit_id' }
      );

    if (upsertError) {
      console.error('pawapay-callback: upsert failed', { depositId: payload.depositId, error: upsertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    // On répond 200 dès que le paiement est durablement enregistré ; la
    // logique métier tourne après, sans bloquer la réponse.
    const businessLogic = runBusinessLogic(supabase, payload).catch((err) => {
      console.error('pawapay-callback: business logic threw', { depositId: payload.depositId, error: err });
    });
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(businessLogic);
    } else {
      await businessLogic;
    }

    return jsonResponse({ received: true }, 200);
  } catch (err) {
    console.error('pawapay-callback: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
