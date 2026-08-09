// Reçoit les "Pulses" Chariow (leur système de webhooks) quand une vente
// est confirmée. Voir chariow-initiate-checkout pour la création de la
// transaction en amont.
//
// TODO: vérifier format Pulses via support@chariow.com — malgré une
// recherche approfondie (chariow.dev/*, help.chariow.com/*), je n'ai pas
// trouvé de documentation publique donnant : (1) le nom exact de
// l'en-tête de signature (s'il existe — plusieurs plateformes similaires
// n'en ont pas et misent sur un secret dans l'URL), (2) le schéma JSON
// exact du payload (je n'ai que des indices : un événement
// "sale.completed", un corps `{ event, data }`, et un `custom_metadata`
// répercuté depuis la requête de checkout), (3) si les montants sont en
// unité principale ou en sous-unité. En attendant une confirmation,
// cette fonction :
// - authentifie l'appelant via un secret partagé en query string
//   (CHARIOW_PULSE_SECRET), exactement comme pawapay-callback — À
//   REMPLACER par une vraie vérification de signature HMAC si Chariow en
//   fournit une, une fois confirmée.
// - lit le montant/la devise/le statut à plusieurs emplacements plausibles
//   du payload (voir extractSaleFields ci-dessous) plutôt que de parier
//   sur un seul, et logue TOUJOURS le payload brut (raw_payload) pour
//   pouvoir corriger le mapping sans perdre de données si la vraie forme
//   diffère.
// - ne fait JAMAIS confiance à un montant qui ne proviendrait pas de ce
//   payload serveur-à-serveur pour activer un abonnement (même défense en
//   profondeur que pawapay-callback : revérifie contre `plans` avant tout
//   grant_subscription()).
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

interface ChariowPulsePayload {
  event?: string;
  data?: Record<string, unknown>;
  // Certaines plateformes envoient directement l'objet vente à la racine
  // plutôt que sous "data" — on gère les deux (voir extractSaleFields).
  [key: string]: unknown;
}

interface SaleFields {
  saleId: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  customMetadata: Record<string, unknown>;
}

// TODO: à ajuster une fois le vrai payload d'un Pulse confirmé (voir le
// TODO en tête de fichier). Cherche les champs plausibles à plusieurs
// emplacements imbriqués courants (data.sale, data.purchase, data
// directement) plutôt que de supposer une seule forme exacte.
function extractSaleFields(payload: ChariowPulsePayload): SaleFields {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const nested =
    (data.sale as Record<string, unknown> | undefined) ??
    (data.purchase as Record<string, unknown> | undefined) ??
    data;

  const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return null;
  };

  const saleId = pick(nested, ['id', 'sale_id', 'purchase_id']);
  const status = pick(nested, ['status']) ?? (payload.event === 'sale.completed' ? 'completed' : null);
  const amountRaw = pick(nested, ['amount', 'total', 'price']);
  const currency = pick(nested, ['currency', 'payment_currency']);
  const customMetadata =
    (nested.custom_metadata as Record<string, unknown> | undefined) ??
    (data.custom_metadata as Record<string, unknown> | undefined) ??
    {};

  return {
    saleId: typeof saleId === 'string' ? saleId : null,
    status: typeof status === 'string' ? status : null,
    amount: amountRaw !== null && amountRaw !== undefined && !Number.isNaN(Number(amountRaw)) ? Number(amountRaw) : null,
    currency: typeof currency === 'string' ? currency : null,
    customMetadata,
  };
}

// PENDING/COMPLETED/FAILED : même vocabulaire que payment_transactions
// pour PawaPay (contrainte CHECK posée en 0024) — voir 0028 pour pourquoi
// on mappe dessus plutôt que d'élargir la contrainte.
function mapStatus(chariowStatus: string | null, event: string | undefined): string {
  const s = (chariowStatus ?? '').toLowerCase();
  if (s.includes('complet') || s.includes('success') || event === 'sale.completed') return 'COMPLETED';
  if (s.includes('fail') || s.includes('reject') || s.includes('cancel')) return 'FAILED';
  return 'PENDING';
}

async function runBusinessLogic(
  supabase: ReturnType<typeof createClient>,
  fields: SaleFields,
  mappedStatus: string
) {
  if (mappedStatus !== 'COMPLETED') return;

  const userId = fields.customMetadata.userId;
  const planId = fields.customMetadata.planId;
  if (typeof userId !== 'string' || typeof planId !== 'string') {
    console.log('chariow-pulse-webhook: COMPLETED sans custom_metadata reconnue, aucune action métier déclenchée', {
      saleId: fields.saleId,
    });
    return;
  }

  // Même défense en profondeur que pawapay-callback (voir migration
  // 0025/cbdf7dd) : ne jamais accorder l'abonnement sans revérifier que
  // le montant RÉELLEMENT rapporté par Chariow correspond au prix du
  // plan (table plans, seule source de vérité), même si
  // chariow-initiate-checkout ne laisse déjà aucune prise à un montant
  // falsifié par le client (voir son commentaire d'en-tête) — ce
  // contrôle reste la dernière ligne de défense si le payload a été
  // altéré en route ou si Chariow envoie un montant inattendu pour
  // n'importe quelle raison.
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('price, currency')
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    console.error('chariow-pulse-webhook: unknown planId, refusing grant_subscription', {
      saleId: fields.saleId,
      planId,
    });
    return;
  }

  if (fields.amount === null || fields.currency === null) {
    console.error('chariow-pulse-webhook: amount/currency not found in payload, refusing grant_subscription', {
      saleId: fields.saleId,
      planId,
    });
    return;
  }

  if (fields.amount !== plan.price || fields.currency !== plan.currency) {
    console.error('chariow-pulse-webhook: amount/currency mismatch, refusing grant_subscription', {
      saleId: fields.saleId,
      userId,
      planId,
      expected: { price: plan.price, currency: plan.currency },
      received: { amount: fields.amount, currency: fields.currency },
    });
    return;
  }

  const { error } = await supabase.rpc('grant_subscription', {
    p_user_id: userId,
    p_plan_id: planId,
    p_provider: 'chariow',
    p_provider_reference: fields.saleId,
  });
  if (error) {
    console.error('chariow-pulse-webhook: grant_subscription failed', {
      saleId: fields.saleId,
      userId,
      planId,
      error,
    });
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
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const expectedToken = Deno.env.get('CHARIOW_PULSE_SECRET') ?? '';

    if (!expectedToken || !timingSafeEqual(token, expectedToken)) {
      return jsonResponse({ error: 'not_authorized' }, 401);
    }

    let payload: ChariowPulsePayload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const fields = extractSaleFields(payload);
    const mappedStatus = mapStatus(fields.status, payload.event);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Corrélation avec la transaction créée par chariow-initiate-checkout
    // via l'internalReference qu'on avait injectée dans custom_metadata
    // (voir son commentaire d'en-tête) — c'est notre deposit_id.
    const internalReference = fields.customMetadata.internalReference;
    if (typeof internalReference === 'string') {
      const { error: upsertError } = await supabase
        .from('payment_transactions')
        .update({
          status: mappedStatus,
          amount: fields.amount,
          currency: fields.currency,
          raw_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('deposit_id', internalReference);

      if (upsertError) {
        console.error('chariow-pulse-webhook: update failed', { internalReference, error: upsertError });
      }
    } else {
      // Pas d'internalReference reconnue dans le payload : on logue quand
      // même une ligne pour ne perdre aucune notification pendant qu'on
      // affine extractSaleFields, plutôt que de la jeter silencieusement.
      console.error('chariow-pulse-webhook: no internalReference in custom_metadata, logging as orphan row', {
        saleId: fields.saleId,
      });
      const { error: insertError } = await supabase.from('payment_transactions').insert({
        deposit_id: fields.saleId ?? crypto.randomUUID(),
        status: mappedStatus,
        amount: fields.amount,
        currency: fields.currency,
        provider: 'chariow',
        environment: 'production',
        raw_payload: payload,
      });
      if (insertError) {
        console.error('chariow-pulse-webhook: orphan insert failed', { error: insertError });
      }
    }

    // On répond 200 dès que le paiement est durablement enregistré ; la
    // logique métier tourne après, sans bloquer la réponse (même raison
    // que pawapay-callback : ne pas risquer un retry Chariow à cause d'un
    // bug dans grant_subscription).
    const businessLogic = runBusinessLogic(supabase, fields, mappedStatus).catch((err) => {
      console.error('chariow-pulse-webhook: business logic threw', { saleId: fields.saleId, error: err });
    });
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(businessLogic);
    } else {
      await businessLogic;
    }

    return jsonResponse({ received: true }, 200);
  } catch (err) {
    console.error('chariow-pulse-webhook: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
