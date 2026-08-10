// Initie un paiement Chariow (carte/mobile money via leur checkout hébergé)
// pour un pack de crédits (voir chariow-pulse-webhook pour la confirmation
// finale de la vente). Réorienté le 2026-08-10 depuis les abonnements
// (plans/subscriptions) vers les packs de crédits (credit_packs, voir
// migration 0031) — Chariow ne sert que les packs de crédits sur ce
// projet, les abonnements Free/Premium/Pro restent sans moyen de paiement
// réel branché pour l'instant.
//
// Sécurité (même principes que pawapay-initiate-deposit) :
// - exige un JWT Supabase valide (utilisateur réel connecté) — jamais
//   appelable anonymement, puisqu'elle appelle l'API Chariow avec une clé
//   secrète et crée une vraie transaction.
// - l'email envoyé à Chariow est TOUJOURS résolu côté serveur depuis
//   `profiles` via le user_id du JWT, jamais accepté depuis le corps de la
//   requête — c'est le champ qui lie la vente à une identité, un client ne
//   peut donc pas faire un achat au nom d'un autre utilisateur.
// - prénom/nom/téléphone sont en revanche acceptés depuis le corps de la
//   requête (voir InitiateCheckoutBody) : Chariow les exige au checkout
//   (confirmé en live le 2026-08-09 — pas documenté publiquement) et le
//   profil permanent de l'utilisateur ne les contient pas forcément. Ce
//   sont de simples infos de contact pour Chariow, pas des données
//   d'autorisation : l'identité réelle qui reçoit les crédits reste
//   entièrement déterminée par `user.id` (JWT) → `custom_metadata.userId`,
//   jamais par ces champs. Validés non-vides ci-dessous, sinon 400.
// - contrairement à PawaPay, l'API checkout Chariow ne prend PAS de
//   montant en paramètre (POST /v1/checkout : product_id, email,
//   first_name, last_name, phone, redirect_url, payment_currency,
//   custom_metadata — voir la doc chariow.dev/fr/guides/checkout) : le
//   prix est entièrement déterminé côté Chariow par le produit
//   (credit_packs.chariow_product_id), donc il n'existe pas de champ
//   "amount" qu'un client pourrait falsifier ici. La vérification "montant
//   payé == prix du pack" (défense en profondeur façon PawaPay) se fait
//   quand même, mais seulement côté chariow-pulse-webhook, sur le montant
//   RÉELLEMENT rapporté par Chariow après paiement — cette fonction-ci se
//   contente de vérifier que le packId existe et a un produit Chariow
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
  packId: string;
  redirectUrl?: string;
  firstName?: string;
  lastName?: string;
  phone?: { number?: string; countryCode?: string };
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
    const { packId, redirectUrl, firstName, lastName, phone } = body;

    if (typeof packId !== 'string' || !packId) {
      return jsonResponse({ error: 'invalid_pack_id' }, 400);
    }

    // Chariow exige ces 3 champs au checkout (confirmé en live, voir le
    // commentaire d'en-tête) — validés ici plutôt que de laisser Chariow
    // renvoyer son propre message d'erreur générique, pour pouvoir
    // afficher un message clair côté client sans dépendre du format de
    // réponse de Chariow.
    if (
      typeof firstName !== 'string' || !firstName.trim() ||
      typeof lastName !== 'string' || !lastName.trim() ||
      typeof phone?.number !== 'string' || !phone.number.trim() ||
      typeof phone?.countryCode !== 'string' || !phone.countryCode.trim()
    ) {
      return jsonResponse({ error: 'missing_contact_info' }, 400);
    }

    const apiKey = Deno.env.get('CHARIOW_API_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Seule source de vérité pour le prix ET pour le product_id Chariow
    // (voir migration 0031) : jamais fait confiance à autre chose que la
    // table `credit_packs` pour déterminer ce qui va être facturé.
    const { data: pack, error: packError } = await adminClient
      .from('credit_packs')
      .select('id, price, currency, chariow_product_id')
      .eq('id', packId)
      .maybeSingle();

    if (packError || !pack) {
      return jsonResponse({ error: 'unknown_pack' }, 400);
    }
    if (!pack.price || pack.price <= 0) {
      return jsonResponse({ error: 'pack_not_payable' }, 400);
    }
    if (!pack.chariow_product_id) {
      console.error('chariow-initiate-checkout: pack has no chariow_product_id configured', { packId });
      return jsonResponse({ error: 'pack_not_configured_for_chariow' }, 400);
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer avec Chariow.' }, 400);
    }

    const internalReference = crypto.randomUUID();

    const chariowRequestBody: Record<string, unknown> = {
      product_id: pack.chariow_product_id,
      email: profile.email,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      payment_currency: pack.currency,
      redirect_url: redirectUrl ?? undefined,
      // Repris tel quel dans les Pulses (webhooks) selon la doc — c'est
      // le seul lien fiable entre une vente Chariow et notre
      // payment_transactions/utilisateur/pack. "userId" est TOUJOURS
      // résolu depuis le JWT ci-dessus, jamais depuis le corps de la
      // requête (même principe que "customerId" dans
      // pawapay-initiate-deposit).
      custom_metadata: {
        type: 'credit_pack',
        internalReference,
        packId: pack.id,
        userId: user.id,
      },
    };
    // number/country_code confirmés obligatoires en live (voir le
    // commentaire d'en-tête). Format de country_code confirmé en live le
    // 2026-08-09 : le code appelant nu ("225") est rejeté ("country not
    // found"), le code ISO alpha-2 ("CI") est accepté — le frontend
    // (BuyButton) envoie donc de l'ISO alpha-2.
    chariowRequestBody.phone = { number: phone.number.trim(), country_code: phone.countryCode.trim() };

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
      amount: pack.price,
      currency: pack.currency,
      provider: 'chariow',
      environment: apiKey.startsWith('sk_live_') ? 'production' : 'sandbox',
      raw_payload: { request: chariowRequestBody, response: chariowResponseJson },
    });

    if (insertError) {
      console.error('chariow-initiate-checkout: insert failed', { internalReference, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    // Un succès n'a PAS de "message":"success" au niveau racine (confirmé
    // en live le 2026-08-10 — seules les erreurs ont un `message` racine,
    // ex: "The first name field is required."). `step` présent dans
    // `data` suffit à identifier une réponse exploitable ; l'ancienne
    // condition sur `message === 'success'` rejetait à tort TOUTE requête
    // réussie, jamais détecté avant parce que les tests précédents
    // n'avaient vu que des réponses d'erreur (clé invalide, produit
    // placeholder introuvable) qui, elles, passaient ce test par hasard.
    if (!chariowResponseJson || !step) {
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
    // Chariow, mais on n'accorde PAS les crédits ici — seul
    // chariow-pulse-webhook (canal serveur-à-serveur authentifié, montant
    // reconfirmé) appelle grant_credits()/grant_subscription(), pour
    // garder un seul point d'écriture et éviter tout octroi basé sur une
    // réponse que le client pourrait rejouer ou falsifier.
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
