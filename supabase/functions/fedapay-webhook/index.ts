// Reçoit les webhooks FedaPay (2e prestataire de paiement, à côté de
// Chariow — voir chariow-pulse-webhook pour le pattern de référence :
// même dédup atomique, même vérif de montant en défense en profondeur
// avant tout grant_credits/grant_subscription, même réponse 200 rapide
// suivie d'un traitement métier en arrière-plan via EdgeRuntime.waitUntil.
//
// Format de signature CONFIRMÉ en lisant le vrai code source du SDK
// officiel (github.com/fedapay/fedapay-node, src/Webhook.ts — la doc
// publique ne descend pas à ce niveau de détail) :
// - header X-FEDAPAY-SIGNATURE: "t=<timestamp>,s=<signature>[,s=<sig2>...]"
// - signature = HMAC-SHA256(`${timestamp}.${corps_brut}`, secret), hex
// - tolérance anti-rejeu : 300s (Webhook.DEFAULT_TOLERANCE dans le SDK)
//
// Forme réelle du corps CONFIRMÉE en live le 2026-08-15 (paiement sandbox
// réel MTN Bénin, transaction #487893, voir le parsing plus bas) :
// `{ name, object, entity: { id, status, amount, currency,
// custom_metadata, ... }, account }` — contredit les fixtures du SDK
// officiel (Event resource) citées dans une version précédente de ce
// commentaire, qui laissaient croire à un id d'événement au niveau racine.
// Il n'y en a pas : la dédup utilise une clé synthétique (transaction +
// statut, voir plus bas). Le statut/montant/custom_metadata ne sont
// volontairement PAS lus depuis `entity` directement : ce webhook RAPPELLE
// l'API FedaPay (GET /v1/transactions/:id, authentifiée par
// FEDAPAY_SECRET_KEY) pour les obtenir, même prudence que la leçon Chariow
// citée par l'utilisateur (`message === 'success'` qui n'apparaît que dans
// les erreurs) : ne jamais déduire un statut d'un champ non revérifié
// quand une source faisant autorité est disponible à un appel de distance.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-fedapay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Confirmé dans le SDK officiel : Webhook.DEFAULT_TOLERANCE = 300.
const SIGNATURE_TOLERANCE_SECONDS = 300;

// Whitelist explicite demandée — tout événement hors de cette liste est
// logué et ignoré (200, sans effet), jamais traité "par défaut".
const HANDLED_EVENT_TYPES = new Set([
  'transaction.created',
  'transaction.approved',
  'transaction.declined',
  'transaction.canceled',
  'transaction.transferred',
]);

// Confirmé dans Transaction.ts du SDK officiel (Transaction.PAID_STATUS) —
// pas une supposition. `wasPaid()` y est défini exactement comme ceci.
const PAID_STATUSES = new Set([
  'approved',
  'transferred',
  'refunded',
  'approved_partially_refunded',
  'transferred_partially_refunded',
]);

// Même choix que chariow-pulse-webhook : le pack 'unlimited' n'accorde pas
// des crédits mais un accès illimité via grant_subscription('pro') —
// réutilise l'infra existante plutôt que d'en recréer une seconde.
const UNLIMITED_PACK_ID = 'unlimited';
const UNLIMITED_MAPS_TO_PLAN_ID = 'pro';

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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parsing fidèle à WebhookSignature.parseHeader/verifyHeader du SDK
// officiel : accepte plusieurs signatures sous le même schéma "s", en
// valide au moins une, rejette si le timestamp dépasse la tolérance.
async function verifyFedaPaySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!header) return { ok: false, reason: 'missing_header' };

  let timestamp = -1;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = parseInt(value, 10);
    if (key === 's') signatures.push(value);
  }

  if (timestamp === -1 || Number.isNaN(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'malformed_header' };
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  const matches = signatures.some((sig) => timingSafeEqual(sig, expected));
  if (!matches) return { ok: false, reason: 'signature_mismatch' };

  const age = Math.floor(Date.now() / 1000) - timestamp;
  if (age > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp_too_old' };

  return { ok: true };
}

interface FedaPayCustomMetadata {
  userId?: string;
  packId?: string;
  type?: string;
  maraboutId?: string;
  internalReference?: string;
}

interface FedaPayTransaction {
  id: number | string;
  status?: string;
  amount?: number;
  currency?: { iso?: string };
  custom_metadata?: FedaPayCustomMetadata | null;
}

function fedaPayApiBase(secretKey: string): string {
  return secretKey.startsWith('sk_live_') ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com';
}

// Seule source de vérité pour le statut/montant/metadata réels — jamais
// déduits du corps du webhook (voir note en tête de fichier). `?include=
// currency` nécessaire : sans lui, GET /v1/transactions/:id ne renvoie que
// `currency_id`, pas l'objet `currency.iso` imbriqué (confirmé en live —
// `transaction.currency` était `undefined` sans ce paramètre, alors même
// que le corps du webhook, lui, l'embarque déjà).
async function fetchTransaction(transactionId: string | number, apiKey: string): Promise<FedaPayTransaction | null> {
  const res = await fetch(`${fedaPayApiBase(apiKey)}/v1/transactions/${transactionId}?include=currency`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error('fedapay-webhook: failed to fetch transaction', { transactionId, status: res.status });
    return null;
  }
  const body = await res.json();
  // Enveloppe confirmée dans les fixtures de test du SDK officiel :
  // { "v1/transaction": { ...champs } } pour une ressource unique.
  return (body?.['v1/transaction'] as FedaPayTransaction) ?? null;
}

async function handleCreditPackTransaction(
  supabase: ReturnType<typeof createClient>,
  transaction: FedaPayTransaction,
  userId: string,
) {
  const packId = transaction.custom_metadata?.packId;
  if (typeof packId !== 'string') {
    console.log('fedapay-webhook: credit_pack sans packId, aucune action métier déclenchée', { transactionId: transaction.id });
    return;
  }

  // Défense en profondeur, même raisonnement que chariow-pulse-webhook :
  // ne jamais accorder de crédits/accès sans revérifier que le montant
  // RÉELLEMENT rapporté par FedaPay correspond au prix du pack (table
  // credit_packs, seule source de vérité).
  const { data: pack, error: packError } = await supabase
    .from('credit_packs')
    .select('price, currency, credits')
    .eq('id', packId)
    .maybeSingle();

  if (packError || !pack) {
    console.error('fedapay-webhook: unknown packId, refusing to grant anything', { transactionId: transaction.id, packId });
    return;
  }

  if (transaction.amount !== pack.price || transaction.currency?.iso !== pack.currency) {
    console.error('fedapay-webhook: amount/currency mismatch, refusing to grant anything', {
      transactionId: transaction.id,
      userId,
      packId,
      expected: { price: pack.price, currency: pack.currency },
      received: { amount: transaction.amount, currency: transaction.currency?.iso },
    });
    return;
  }

  if (packId === UNLIMITED_PACK_ID) {
    const { error } = await supabase.rpc('grant_subscription', {
      p_user_id: userId,
      p_plan_id: UNLIMITED_MAPS_TO_PLAN_ID,
      p_provider: 'fedapay',
      p_provider_reference: String(transaction.id),
    });
    if (error) {
      console.error('fedapay-webhook: grant_subscription failed', { transactionId: transaction.id, userId, packId, error });
    }
    return;
  }

  const { error } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: pack.credits,
    p_pack: packId,
    p_description: `Achat pack ${packId} (FedaPay)`,
  });
  if (error) {
    console.error('fedapay-webhook: grant_credits failed', { transactionId: transaction.id, userId, packId, error });
  }
}

async function handleMaraboutSubscriptionTransaction(supabase: ReturnType<typeof createClient>, transaction: FedaPayTransaction) {
  const maraboutId = transaction.custom_metadata?.maraboutId;
  if (typeof maraboutId !== 'string') {
    console.log('fedapay-webhook: marabout_subscription sans maraboutId, aucune action métier déclenchée', {
      transactionId: transaction.id,
    });
    return;
  }

  const { data: plan, error: planError } = await supabase
    .from('marabout_subscription_plan')
    .select('price, currency')
    .eq('id', 'standard')
    .maybeSingle();

  if (planError || !plan) {
    console.error('fedapay-webhook: marabout_subscription_plan not configured, refusing to activate', { transactionId: transaction.id });
    return;
  }

  if (transaction.amount !== plan.price || transaction.currency?.iso !== plan.currency) {
    console.error('fedapay-webhook: amount/currency mismatch, refusing to activate marabout subscription', {
      transactionId: transaction.id,
      maraboutId,
      expected: { price: plan.price, currency: plan.currency },
      received: { amount: transaction.amount, currency: transaction.currency?.iso },
    });
    return;
  }

  const { error } = await supabase.rpc('activate_marabout_subscription_via_payment', {
    p_marabout_id: maraboutId,
    p_provider: 'fedapay',
    p_provider_reference: String(transaction.id),
  });
  if (error) {
    console.error('fedapay-webhook: activate_marabout_subscription_via_payment failed', {
      transactionId: transaction.id,
      maraboutId,
      error,
    });
  }
}

// Corrélation avec la ligne créée par fedapay-initiate-checkout (deposit_id
// = internalReference injecté dans custom_metadata au checkout) — même
// pattern que chariow-pulse-webhook, pour que payment_transactions reste la
// source d'audit à jour pour ce provider aussi, pas seulement Chariow.
async function markPaymentTransactionCompleted(supabase: ReturnType<typeof createClient>, transaction: FedaPayTransaction) {
  const internalReference = transaction.custom_metadata?.internalReference;
  if (typeof internalReference !== 'string') {
    console.log('fedapay-webhook: pas d\'internalReference, payment_transactions non mis à jour', { transactionId: transaction.id });
    return;
  }
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'COMPLETED',
      amount: transaction.amount ?? null,
      currency: transaction.currency?.iso ?? null,
      raw_payload: transaction,
      updated_at: new Date().toISOString(),
    })
    .eq('deposit_id', internalReference);
  if (error) {
    console.error('fedapay-webhook: payment_transactions update failed', { internalReference, transactionId: transaction.id, error });
  }
}

async function runBusinessLogic(supabase: ReturnType<typeof createClient>, transaction: FedaPayTransaction) {
  if (!PAID_STATUSES.has(transaction.status ?? '')) {
    console.log('fedapay-webhook: transaction not in a paid status, no grant', {
      transactionId: transaction.id,
      status: transaction.status,
    });
    return;
  }

  await markPaymentTransactionCompleted(supabase, transaction);

  const type = transaction.custom_metadata?.type;
  const userId = transaction.custom_metadata?.userId;

  if (type === 'marabout_subscription') {
    await handleMaraboutSubscriptionTransaction(supabase, transaction);
    return;
  }

  if (typeof userId !== 'string') {
    console.log('fedapay-webhook: transaction approuvée sans custom_metadata reconnue, aucune action métier déclenchée', {
      transactionId: transaction.id,
    });
    return;
  }
  await handleCreditPackTransaction(supabase, transaction, userId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET') ?? '';
    const apiKey = Deno.env.get('FEDAPAY_SECRET_KEY') ?? '';
    if (!webhookSecret || !apiKey) {
      console.error('fedapay-webhook: FEDAPAY_WEBHOOK_SECRET or FEDAPAY_SECRET_KEY not configured');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    // Corps BRUT lu AVANT tout parsing JSON — le HMAC doit porter sur les
    // octets exacts envoyés par FedaPay.
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-fedapay-signature');
    const verification = await verifyFedaPaySignature(rawBody, signatureHeader, webhookSecret);
    if (!verification.ok) {
      console.error('fedapay-webhook: invalid signature', { reason: verification.reason });
      return jsonResponse({ error: 'invalid_signature' }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    // Forme RÉELLE confirmée en live le 2026-08-15 (paiement sandbox réel
    // MTN Bénin, transaction #487893) — contredit les fixtures du SDK
    // officiel citées dans la note en tête de fichier : le corps est
    // `{ name, object, entity: { id, status, amount, currency,
    // custom_metadata, ... }, account }`, SANS aucun champ d'id d'événement
    // au niveau racine (ni `id`, ni `object_id`) — confirmé via les logs de
    // la fonction (14 tentatives de livraison FedaPay, toutes en 400
    // `missing_event_id` avant ce correctif, alors que la signature, elle,
    // passait déjà). L'id de transaction vient de `entity.id`, jamais de
    // `object_id` (absent). Pas d'id d'événement fourni par FedaPay → clé
    // d'idempotence synthétique construite ici (transaction + statut),
    // suffisante puisque les seules livraisons répétées observées étaient
    // des retries identiques du même changement de statut.
    const eventType = payload.name as string | undefined;
    const entity = payload.entity as { id?: string | number; status?: string } | undefined;
    const transactionId = entity?.id;
    const eventId = transactionId != null ? `${transactionId}:${entity?.status ?? ''}` : null;

    if (!eventId || !transactionId) {
      console.error('fedapay-webhook: missing transaction entity in payload', { payload });
      return jsonResponse({ error: 'missing_transaction_entity' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!eventType || !HANDLED_EVENT_TYPES.has(eventType)) {
      console.log('fedapay-webhook: event ignoré (hors whitelist)', { eventType, eventId });
      return jsonResponse({ received: true, ignored: true }, 200);
    }

    // Dédup ATOMIQUE : la contrainte UNIQUE sur event_id fait échouer une
    // 2e livraison concurrente au lieu d'un select-puis-insert racy.
    const { error: insertError } = await supabase
      .from('fedapay_processed_events')
      .insert({ event_id: eventId, event_type: eventType });

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonResponse({ received: true, duplicate: true }, 200);
      }
      console.error('fedapay-webhook: dedup insert failed', { eventId, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    // 200 dès que l'événement est dédupliqué et enregistré ; la logique
    // métier (appel API FedaPay + grant_credits/grant_subscription) tourne
    // ensuite sans bloquer la réponse — même raison que
    // chariow-pulse-webhook : ne jamais risquer un retry FedaPay à cause
    // d'un bug dans le traitement métier lui-même.
    const businessLogic = (async () => {
      if (eventType !== 'transaction.approved') {
        console.log('fedapay-webhook: event logué, aucune action métier pour ce type', { eventType, eventId, transactionId });
        return;
      }
      const transaction = await fetchTransaction(transactionId, apiKey);
      if (!transaction) {
        console.error('fedapay-webhook: could not fetch transaction, no grant', { eventId, transactionId });
        return;
      }
      await runBusinessLogic(supabase, transaction);
    })().catch((err) => {
      console.error('fedapay-webhook: business logic threw', { eventId, transactionId, error: err });
    });

    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(businessLogic);
    } else {
      await businessLogic;
    }

    return jsonResponse({ received: true }, 200);
  } catch (err) {
    console.error('fedapay-webhook: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
