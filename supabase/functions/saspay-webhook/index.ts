// Reçoit les webhooks SasPay (transaction.success/transaction.failed/...).
// Voir saspay-initiate-checkout / saspay-marabout-checkout pour la
// création de la session en amont.
//
// Doc : https://docs.saspay.me/api-reference/webhooks
//
// Vérification de signature CONFIRMÉE par la doc (pas juste un exemple,
// pas encore testée en live faute de webhook configuré/transaction
// réelle sur ce compte au moment de l'écriture — à revérifier via
// l'event `webhook.test` dès que l'utilisateur crée le point de réception
// sur app.saspay.me) :
// - X-Webhook-Signature : hex SHA-256 HMAC en minuscules, SANS préfixe
//   "sha256=" (contrairement à Chariow) — HMAC("{timestamp}.{corps_brut}", secret).
// - X-Webhook-Timestamp : horodatage Unix (secondes), régénéré à chaque
//   tentative — rejeté si l'écart avec l'horloge serveur dépasse 300s.
// - X-Webhook-Event : nom de l'event, ex "transaction.success".
//
// CORRÉLATION — différence volontaire avec chariow-pulse-webhook :
// le payload documenté d'un event transaction.* (id, reference, amount,
// fee, charged, net_amount, currency, country, network, msisdn) ne
// contient PAS le `metadata` qu'on pose à la création de la session, et
// aucun champ ne relie explicitement la Transaction à sa CheckoutSession
// d'origine. Plutôt que de deviner un champ non documenté, ce webhook
// utilise le payload reçu comme un simple DÉCLENCHEUR : il re-vérifie
// TOUTES nos lignes payment_transactions SasPay encore PENDING via
// GET /checkout-sessions/{id}/status/ (qui revérifie TOUJOURS l'état réel
// côté gateway, jamais un statut mémorisé, par design documenté) — c'est
// cette réponse, et notre propre raw_payload stocké à la création, qui
// pilotent l'octroi, jamais le contenu du webhook lui-même au-delà de la
// signature. Conséquence : idempotent par construction (une ligne déjà
// COMPLETED n'est plus jamais retouchée), donc pas besoin d'une table de
// dédoublonnage par delivery-id comme pour Chariow/FedaPay.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-signature, x-webhook-timestamp, x-webhook-event',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOLERANCE_SECONDS = 300;

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

interface SessionStatusResponse {
  success?: boolean;
  data?: {
    id?: string;
    status?: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
    transaction_id?: string;
    transaction_status?: 'PENDING' | 'SUCCESS' | 'FAILED';
    transaction_reference?: string;
  };
}

interface PendingRow {
  id: string;
  deposit_id: string;
  amount: number | null;
  currency: string | null;
  raw_payload: { request?: { metadata?: Record<string, unknown> } } | null;
}

async function notifyMaraboutActivated(supabase: ReturnType<typeof createClient>, maraboutId: string) {
  try {
    const { data: marabout } = await supabase
      .from('marabouts')
      .select('user_id, nom_complet')
      .eq('id', maraboutId)
      .maybeSingle();
    if (!marabout) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', marabout.user_id)
      .maybeSingle();
    if (!profile?.email) return;

    const novuKey = Deno.env.get('NOVU_API_KEY');
    if (!novuKey) return;

    await fetch('https://api.novu.co/v1/events/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `ApiKey ${novuKey}` },
      body: JSON.stringify({
        name: 'marabout-registration-and-activation',
        to: { subscriberId: profile.email, email: profile.email },
        payload: { name: marabout.nom_complet, event: 'activation' },
      }),
    });
  } catch (err) {
    console.error('saspay-webhook: notifyMaraboutActivated failed', { maraboutId, error: err });
  }
}

const UNLIMITED_PACK_ID = 'unlimited';
const UNLIMITED_MAPS_TO_PLAN_ID = 'pro';

async function grantForRow(
  supabase: ReturnType<typeof createClient>,
  row: PendingRow,
  transactionReference: string
) {
  const metadata = row.raw_payload?.request?.metadata ?? {};
  const product = metadata.product;
  const userId = metadata.userId;

  if (product === 'marabout_subscription') {
    const maraboutId = metadata.maraboutId;
    const tier = metadata.tier === 'vip' ? 'vip' : 'standard';
    if (typeof maraboutId !== 'string') {
      console.error('saspay-webhook: marabout_subscription metadata without maraboutId', { rowId: row.id });
      return false;
    }
    const { error } = await supabase.rpc('activate_marabout_subscription_via_payment', {
      p_marabout_id: maraboutId,
      p_provider: 'saspay',
      p_provider_reference: transactionReference,
      p_tier: tier,
    });
    if (error) {
      console.error('saspay-webhook: activate_marabout_subscription_via_payment failed', { rowId: row.id, maraboutId, error });
      return false;
    }
    await notifyMaraboutActivated(supabase, maraboutId);
    return true;
  }

  // Défaut 'credit_pack'.
  const packId = metadata.packId;
  if (typeof userId !== 'string' || typeof packId !== 'string') {
    console.error('saspay-webhook: credit_pack metadata incomplete', { rowId: row.id, metadata });
    return false;
  }

  if (packId === UNLIMITED_PACK_ID) {
    const { error } = await supabase.rpc('grant_subscription', {
      p_user_id: userId,
      p_plan_id: UNLIMITED_MAPS_TO_PLAN_ID,
      p_provider: 'saspay',
      p_provider_reference: transactionReference,
    });
    if (error) {
      console.error('saspay-webhook: grant_subscription failed', { rowId: row.id, userId, packId, error });
      return false;
    }
    return true;
  }

  const { data: pack, error: packError } = await supabase
    .from('credit_packs')
    .select('credits')
    .eq('id', packId)
    .maybeSingle();
  if (packError || !pack) {
    console.error('saspay-webhook: unknown packId at grant time', { rowId: row.id, packId });
    return false;
  }

  const { error } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: pack.credits,
    p_pack: packId,
    p_description: `Achat pack ${packId} (SasPay)`,
  });
  if (error) {
    console.error('saspay-webhook: grant_credits failed', { rowId: row.id, userId, packId, error });
    return false;
  }
  return true;
}

// Coeur du mécanisme : re-vérifie chaque ligne PENDING SasPay auprès de
// SasPay lui-même plutôt que de faire confiance au contenu du webhook qui
// a déclenché cet appel — voir le commentaire d'en-tête.
async function recheckPendingSessions(supabase: ReturnType<typeof createClient>, apiKey: string) {
  const { data: pendingRows, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('id, deposit_id, amount, currency, raw_payload')
    .eq('provider', 'saspay')
    .eq('status', 'PENDING');

  if (fetchError) {
    console.error('saspay-webhook: failed to fetch pending rows', fetchError);
    return;
  }
  if (!pendingRows || pendingRows.length === 0) return;

  for (const row of pendingRows as unknown as PendingRow[]) {
    let statusJson: SessionStatusResponse | null = null;
    try {
      const res = await fetch(`https://api.saspay.me/api/v1/checkout-sessions/${row.deposit_id}/status/`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      statusJson = await res.json().catch(() => null);
    } catch (err) {
      console.error('saspay-webhook: status check failed', { rowId: row.id, error: err });
      continue;
    }

    const data = statusJson?.data;
    if (!data) continue;

    if (data.status === 'PAID' && data.transaction_status === 'SUCCESS') {
      const granted = await grantForRow(supabase, row, data.transaction_id ?? row.deposit_id);
      if (granted) {
        await supabase
          .from('payment_transactions')
          .update({ status: 'COMPLETED', raw_payload: { ...row.raw_payload, session_status: data }, updated_at: new Date().toISOString() })
          .eq('id', row.id);
      }
      // Si le grant a échoué, la ligne reste PENDING : retentée au
      // prochain webhook plutôt que marquée COMPLETED à tort.
      continue;
    }

    if (data.status === 'EXPIRED' || data.status === 'CANCELLED' || data.transaction_status === 'FAILED') {
      await supabase
        .from('payment_transactions')
        .update({ status: 'FAILED', raw_payload: { ...row.raw_payload, session_status: data }, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
    // Sinon encore PENDING côté SasPay : rien à faire, retentée plus tard.
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
    const secret = Deno.env.get('SASPAY_WEBHOOK_SECRET') ?? '';
    const apiKey = Deno.env.get('SASPAY_API_KEY') ?? '';
    if (!secret || !apiKey) {
      console.error('saspay-webhook: SASPAY_WEBHOOK_SECRET or SASPAY_API_KEY not configured');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    // Corps BRUT lu AVANT tout parsing JSON — la signature SasPay porte
    // sur les octets exacts reçus, jamais sur une re-sérialisation.
    const rawBody = await req.text();

    const signatureHeader = req.headers.get('x-webhook-signature') ?? '';
    const timestampHeader = req.headers.get('x-webhook-timestamp') ?? '';

    if (!timestampHeader || Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader)) > TOLERANCE_SECONDS) {
      console.error('saspay-webhook: timestamp out of tolerance or missing', { timestampHeader });
      return jsonResponse({ error: 'invalid_timestamp' }, 403);
    }

    const expectedSignature = await hmacSha256Hex(secret, `${timestampHeader}.${rawBody}`);
    if (!signatureHeader || !timingSafeEqual(signatureHeader.toLowerCase(), expectedSignature)) {
      console.error('saspay-webhook: invalid signature');
      return jsonResponse({ error: 'invalid_signature' }, 401);
    }

    let payload: { event?: string } = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const event = req.headers.get('x-webhook-event') || payload.event;

    // Seuls les events transaction.* concernent les flux de ce projet
    // (packs de crédits / abonnement marabout) — settlement.*/wallet_transfer.*
    // ne sont jamais utilisés ici (pas de payout SasPay sur ce projet), et
    // webhook.test n'a pas de transaction réelle à revérifier.
    if (!event || !event.startsWith('transaction.')) {
      console.log('saspay-webhook: event ignoré', { event });
      return jsonResponse({ received: true, ignored: true }, 200);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const recheck = recheckPendingSessions(supabase, apiKey).catch((err) => {
      console.error('saspay-webhook: recheckPendingSessions threw', err);
    });
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(recheck);
    } else {
      await recheck;
    }

    return jsonResponse({ received: true }, 200);
  } catch (err) {
    console.error('saspay-webhook: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
