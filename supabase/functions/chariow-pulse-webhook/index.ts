// Reçoit les "Pulses" Chariow (leur système de webhooks) quand une vente
// est confirmée. Voir chariow-initiate-checkout pour la création de la
// transaction en amont. Réorienté le 2026-08-10 des abonnements vers les
// packs de crédits (credit_packs, voir migration 0031) — voir
// runBusinessLogic ci-dessous pour le détail du mapping packId → action.
//
// Format CONFIRMÉ le 2026-08-09 via la documentation Chariow (dashboard,
// Automations → Pulses) — remplace l'ancien mécanisme provisoire (secret
// partagé en query string) par une vraie vérification de signature :
// - header x-chariow-signature: "sha256=<hex>", HMAC-SHA256 du corps BRUT
//   (avant tout parsing JSON) avec CHARIOW_WEBHOOK_SECRET (récupéré côté
//   Chariow au moment de la création du Pulse dans leur dashboard — la
//   valeur actuellement dans les secrets Supabase est un placeholder tant
//   que le Pulse n'a pas été créé côté Chariow).
// - header x-pulse-delivery-id : clé d'idempotence — Chariow peut renvoyer
//   la même livraison plusieurs fois (retry), dédupliquée ici via la
//   colonne payment_transactions.pulse_delivery_id (contrainte UNIQUE,
//   voir migration 0029) plutôt que de la retraiter (double
//   grant_credits/grant_subscription).
// - header x-pulse-event : nom de l'événement — seul "successful.sale"
//   est traité pour l'instant ; les autres sont logués et ignorés (200,
//   sans écriture) en attendant qu'on en ait besoin.
//
// Comme pour pawapay-callback : la transaction est enregistrée en base
// d'abord (source de vérité + dédup), la réponse 200 part dès que c'est
// fait, puis la logique métier (vérif montant + grant_credits/grant_subscription) tourne
// en arrière-plan (EdgeRuntime.waitUntil) pour ne jamais faire attendre
// Chariow.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-chariow-signature, x-pulse-id, x-pulse-delivery-id, x-pulse-event',
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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface ChariowSale {
  id?: string;
  amount?: { value?: number; currency?: string };
  status?: string;
  custom_metadata?: { internalReference?: string; packId?: string; userId?: string };
  completed_at?: string;
}

interface ChariowSalePulse {
  event?: string;
  sale?: ChariowSale;
}

// Le pack 'unlimited' (49000 XOF/mois, credits=NULL — voir migration 0031)
// n'accorde pas des crédits mais un accès illimité pendant 1 mois, exactement
// ce que fait déjà grant_subscription() pour un abonnement `plans.pro`
// (is_unlimited=true — voir useCredits.ts:isUnlimited, qui lit l'existence
// d'une ligne `subscriptions` active, pas un solde de crédits). Plutôt que
// de recréer un second mécanisme d'accès illimité, l'achat de ce pack route
// vers grant_subscription('pro') : ça réutilise l'infra existante et reste
// cohérent avec la seule notion d'"illimité" qui existe déjà dans le code.
const UNLIMITED_PACK_ID = 'unlimited';
const UNLIMITED_MAPS_TO_PLAN_ID = 'pro';

async function runBusinessLogic(supabase: ReturnType<typeof createClient>, sale: ChariowSale) {
  const userId = sale.custom_metadata?.userId;
  const packId = sale.custom_metadata?.packId;
  if (typeof userId !== 'string' || typeof packId !== 'string') {
    console.log('chariow-pulse-webhook: successful.sale sans custom_metadata reconnue, aucune action métier déclenchée', {
      saleId: sale.id,
    });
    return;
  }

  // Même défense en profondeur que pawapay-callback (voir migration
  // 0025/cbdf7dd) : ne jamais accorder de crédits/accès sans revérifier
  // que le montant RÉELLEMENT rapporté par Chariow correspond au prix du
  // pack (table credit_packs, seule source de vérité), même si
  // chariow-initiate-checkout ne laisse déjà aucune prise à un montant
  // falsifié par le client.
  const { data: pack, error: packError } = await supabase
    .from('credit_packs')
    .select('price, currency, credits')
    .eq('id', packId)
    .maybeSingle();

  if (packError || !pack) {
    console.error('chariow-pulse-webhook: unknown packId, refusing to grant anything', { saleId: sale.id, packId });
    return;
  }

  const paidAmount = sale.amount?.value;
  const paidCurrency = sale.amount?.currency;
  if (paidAmount !== pack.price || paidCurrency !== pack.currency) {
    console.error('chariow-pulse-webhook: amount/currency mismatch, refusing to grant anything', {
      saleId: sale.id,
      userId,
      packId,
      expected: { price: pack.price, currency: pack.currency },
      received: { amount: paidAmount, currency: paidCurrency },
    });
    return;
  }

  if (packId === UNLIMITED_PACK_ID) {
    const { error } = await supabase.rpc('grant_subscription', {
      p_user_id: userId,
      p_plan_id: UNLIMITED_MAPS_TO_PLAN_ID,
      p_provider: 'chariow',
      p_provider_reference: sale.id,
    });
    if (error) {
      console.error('chariow-pulse-webhook: grant_subscription failed', { saleId: sale.id, userId, packId, error });
    }
    return;
  }

  const { error } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: pack.credits,
    p_pack: packId,
    p_description: `Achat pack ${packId} (Chariow)`,
  });
  if (error) {
    console.error('chariow-pulse-webhook: grant_credits failed', { saleId: sale.id, userId, packId, error });
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
    const secret = Deno.env.get('CHARIOW_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      console.error('chariow-pulse-webhook: CHARIOW_WEBHOOK_SECRET not configured');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    // Corps BRUT lu AVANT tout parsing JSON — le HMAC est calculé sur les
    // octets exacts envoyés par Chariow ; un re-sérialisé JSON.stringify
    // pourrait ne pas matcher (ordre des clés, espaces...).
    const rawBody = await req.text();

    const signatureHeader = req.headers.get('x-chariow-signature') ?? '';
    const expectedSignature = `sha256=${await hmacSha256Hex(secret, rawBody)}`;
    if (!signatureHeader || !timingSafeEqual(signatureHeader, expectedSignature)) {
      console.error('chariow-pulse-webhook: invalid signature');
      return jsonResponse({ error: 'invalid_signature' }, 401);
    }

    const deliveryId = req.headers.get('x-pulse-delivery-id');
    if (!deliveryId) {
      return jsonResponse({ error: 'missing_delivery_id' }, 400);
    }

    let payload: ChariowSalePulse;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const event = req.headers.get('x-pulse-event') || payload.event;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Déduplication : Chariow peut renvoyer la même livraison plusieurs
    // fois (retry) — x-pulse-delivery-id est la clé d'idempotence.
    const { data: existingDelivery } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('pulse_delivery_id', deliveryId)
      .maybeSingle();

    if (existingDelivery) {
      return jsonResponse({ received: true, duplicate: true }, 200);
    }

    if (event !== 'successful.sale' || !payload.sale) {
      console.log('chariow-pulse-webhook: event ignoré', { event, deliveryId });
      return jsonResponse({ received: true, ignored: true }, 200);
    }

    const sale = payload.sale;
    const internalReference = sale.custom_metadata?.internalReference;

    // Corrélation avec la transaction créée par chariow-initiate-checkout
    // via l'internalReference injecté dans custom_metadata au checkout.
    if (typeof internalReference === 'string') {
      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'COMPLETED',
          amount: sale.amount?.value ?? null,
          currency: sale.amount?.currency ?? null,
          pulse_delivery_id: deliveryId,
          raw_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('deposit_id', internalReference);

      if (updateError) {
        console.error('chariow-pulse-webhook: update failed', { internalReference, deliveryId, error: updateError });
        return jsonResponse({ error: 'db_error' }, 500);
      }
    } else {
      // Pas d'internalReference reconnue : on logue quand même une ligne
      // (avec pulse_delivery_id pour la dédup) plutôt que de la jeter
      // silencieusement.
      console.error('chariow-pulse-webhook: no internalReference in custom_metadata, logging as orphan row', {
        saleId: sale.id,
        deliveryId,
      });
      const { error: insertError } = await supabase.from('payment_transactions').insert({
        deposit_id: sale.id ?? crypto.randomUUID(),
        status: 'COMPLETED',
        amount: sale.amount?.value ?? null,
        currency: sale.amount?.currency ?? null,
        provider: 'chariow',
        environment: 'production',
        pulse_delivery_id: deliveryId,
        raw_payload: payload,
      });
      if (insertError) {
        console.error('chariow-pulse-webhook: orphan insert failed', { deliveryId, error: insertError });
        return jsonResponse({ error: 'db_error' }, 500);
      }
    }

    // On répond 200 dès que le paiement est durablement enregistré (et
    // dédupliqué) ; la logique métier (vérif montant + grant_credits/grant_subscription)
    // tourne après, sans bloquer la réponse (même raison que
    // pawapay-callback : ne pas risquer un retry Chariow à cause d'un bug
    // dans grant_credits/grant_subscription).
    const businessLogic = runBusinessLogic(supabase, sale).catch((err) => {
      console.error('chariow-pulse-webhook: business logic threw', { saleId: sale.id, error: err });
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
