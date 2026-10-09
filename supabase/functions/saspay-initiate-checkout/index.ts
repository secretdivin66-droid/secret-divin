// Initie un paiement SasPay (checkout hébergé — mobile money/carte, zone
// Afrique de l'Ouest/Centre) pour un pack de crédits. Provider PRINCIPAL
// depuis son introduction (2026-10) — Chariow puis FedaPay restent en
// repli silencieux côté frontend (voir CreditsPage.tsx). Voir
// saspay-webhook pour la confirmation finale (grant_credits/grant_subscription).
//
// Doc API : https://docs.saspay.me/api-reference/payments/checkout-create
//
// Différences notables avec Chariow (chariow-initiate-checkout) :
// - SasPay accepte amount/currency EN DIRECT à la création (pas de produit
//   pré-créé côté dashboard à maintenir en sync) — le prix vient
//   uniquement de credit_packs.price, jamais falsifiable par le client.
// - Pas de prénom/nom/téléphone à collecter : seuls customer_email et
//   customer_name sont exigés par /checkout-sessions/, tous deux résolus
//   côté serveur depuis `profiles` (jamais acceptés du corps de la
//   requête) — donc PAS de modal de contact nécessaire pour ce provider.
// - Idempotency-Key explicitement NON supporté par cet endpoint selon la
//   doc (doublon sans conséquence financière, une session ne débite rien
//   tant qu'elle n'est pas payée) — aucun header envoyé.
//
// Sécurité : même modèle que chariow-initiate-checkout — JWT Supabase
// réel requis, email résolu serveur, clé SASPAY_API_KEY jamais exposée
// au client.
import { createClient } from 'npm:@supabase/supabase-js@2';
import countries from 'npm:i18n-iso-countries@7';
import frLocale from 'npm:i18n-iso-countries@7/langs/fr.json' with { type: 'json' };
import enLocale from 'npm:i18n-iso-countries@7/langs/en.json' with { type: 'json' };

countries.registerLocale(frLocale);
countries.registerLocale(enLocale);

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
  returnUrl?: string;
}

interface SaspaySessionResponse {
  success?: boolean;
  data?: {
    id?: string;
    checkout_url?: string;
    status?: string;
  };
  error?: { message?: string; code?: string } | Record<string, string[]>;
}

// Normalise un texte libre (accents, casse, espaces/apostrophes/tirets)
// pour le comparer à un nom de pays — profiles.country est saisi à la
// main sur ProfilPage, jamais normalisé à la saisie.
function normalizeCountryText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

// Table nom-normalisé -> code ISO alpha-2, construite une fois au
// démarrage depuis i18n-iso-countries (fr puis en, mêmes locales que
// ChariowContactModal.tsx côté frontend) — couvre les ~245 pays/
// territoires au lieu d'une liste de regex à la main limitée à la
// Guinée comme avant.
const COUNTRY_NAME_TO_CODE = new Map<string, string>();
for (const [code, name] of Object.entries(countries.getNames('fr'))) {
  COUNTRY_NAME_TO_CODE.set(normalizeCountryText(name as string), code);
}
for (const [code, name] of Object.entries(countries.getNames('en'))) {
  const key = normalizeCountryText(name as string);
  if (!COUNTRY_NAME_TO_CODE.has(key)) COUNTRY_NAME_TO_CODE.set(key, code);
}

// Variantes informelles vues dans profiles.country (texte libre) que la
// table ci-dessus ne reconnaît pas comme nom de pays officiel.
const INFORMAL_COUNTRY_ALIASES: Record<string, string> = {
  conakry: 'GN',
  burkina: 'BF',
  rci: 'CI',
};

type ProfileCountryResolution = string | 'EMPTY' | 'UNRECOGNIZED';

function resolveProfileCountryCode(text: string | null | undefined): ProfileCountryResolution {
  const normalized = text?.trim();
  if (!normalized) return 'EMPTY';
  const key = normalizeCountryText(normalized);
  return COUNTRY_NAME_TO_CODE.get(key) ?? INFORMAL_COUNTRY_ALIASES[key] ?? 'UNRECOGNIZED';
}

// Repli IP → pays via ipwho.is (gratuit, HTTPS, aucune clé requise) pour
// les profils sans `country` renseigné (champ optionnel) — timeout court
// et échec silencieux : une géoloc ratée ne doit JAMAIS bloquer un
// paiement, juste faire perdre cette optimisation de routage (on
// retombe sur SasPay par défaut, comme avant ce changement).
async function countryFromIp(req: Request): Promise<string | null> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!ip) return null;
  try {
    const res = await fetch(`https://ipwho.is/${ip}?fields=country_code,success`, { signal: AbortSignal.timeout(2000) });
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) return null;
    return typeof json.country_code === 'string' ? json.country_code : null;
  } catch {
    return null;
  }
}

async function resolveCountryCode(req: Request, profileCountry: string | null | undefined): Promise<string | null> {
  const fromProfile = resolveProfileCountryCode(profileCountry);
  if (fromProfile === 'EMPTY') return await countryFromIp(req); // profil vide uniquement
  if (fromProfile === 'UNRECOGNIZED') return null; // profil renseigné mais non reconnu — jamais de repli IP
  return fromProfile; // code ISO reconnu depuis le texte du profil
}

interface SaspayNetwork {
  country?: string;
  code?: string;
  is_active?: boolean;
}
interface SaspayCountryRow {
  id?: string;
  iso_code?: string;
}

// Pays forcés vers Chariow indépendamment du catalogue SasPay — décision
// produit, pas automatique. La Guinée reste ici même si mtn_gn est actif
// (vérifié le 2026-10-09) : Orange Money (orange_gn, inactif) y est jugé
// trop dominant pour laisser un client guinéen sur SasPay avec un seul
// opérateur restant. Les autres pays suivent la règle générale ci-dessous
// (au moins un réseau actif suffit), voir l'échange du 2026-10-09 où
// Sénégal/Bénin/Cameroun ont été explicitement exclus de ce traitement
// strict malgré chacun un réseau mineur inactif (e_money_sn/coris_bj/
// eu_mobile_cm).
const SASPAY_FORCED_UNSUPPORTED_COUNTRIES = new Set(['GN']);

// Vérifie en direct auprès de SasPay si AU MOINS UN réseau mobile money
// catalogué pour ce pays est actif — un pays n'est traité comme non
// couvert par SasPay (et basculé vers Chariow, voir CreditsPage.tsx qui
// traite 'country_not_supported_by_saspay' comme un code de repli) que
// s'il a au moins un réseau catalogué et qu'AUCUN n'est actif. Un pays
// avec un réseau mineur inactif mais d'autres actifs (ex. Sénégal/Bénin/
// Cameroun) reste donc sur SasPay — seule la Guinée est traitée plus
// strictement, via SASPAY_FORCED_UNSUPPORTED_COUNTRIES ci-dessus. Aucun
// réseau catalogué pour ce pays, ou tout échec réseau/API -> true
// (ouvert par défaut) : ni l'absence de données ni un problème de ce
// contrôle ne doivent jamais bloquer un paiement SasPay qui aurait
// fonctionné — même principe que le repli IP ci-dessus.
async function isSaspayCountrySupported(countryCode: string, apiKey: string): Promise<boolean> {
  try {
    const [networksRes, countriesRes] = await Promise.all([
      fetch('https://api.saspay.me/api/v1/networks/?page_size=100', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      }),
      fetch('https://api.saspay.me/api/v1/countries/?page_size=100', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      }),
    ]);
    const [networksJson, countriesJson] = await Promise.all([
      networksRes.json().catch(() => null),
      countriesRes.json().catch(() => null),
    ]);

    const networks: SaspayNetwork[] | undefined = networksJson?.data?.results;
    const countryList: SaspayCountryRow[] | undefined = countriesJson?.data;
    if (!Array.isArray(networks) || !Array.isArray(countryList)) return true;

    const countryRow = countryList.find((c) => c.iso_code === countryCode);
    if (!countryRow) return true;

    // 'internal_adjustment' est un pseudo-réseau comptable interne à
    // SasPay (jamais proposé au client sur leur page de paiement) —
    // confirmé présent/inactif sur plusieurs pays sans rapport entre eux
    // le 2026-10-09, exclu pour ne pas fausser le diagnostic.
    const relevant = networks.filter((n) => n.country === countryRow.id && n.code !== 'internal_adjustment');
    if (relevant.length === 0) return true;

    return relevant.some((n) => n.is_active === true);
  } catch (err) {
    console.error('isSaspayCountrySupported: check failed, defaulting to supported', { countryCode, error: err });
    return true;
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

    // Même flag que chariow-initiate-checkout/fedapay-initiate-checkout —
    // règle produit, indépendante du prestataire de paiement utilisé.
    if (Deno.env.get('CREDIT_PACKS_ENABLED') !== 'true') {
      return jsonResponse({
        error: 'credit_packs_disabled',
        message: 'Rechargement temporairement indisponible — Nous améliorons notre système. Merci de réessayer dans quelques instants 🙏',
      }, 503);
    }

    const body: InitiateCheckoutBody = await req.json();
    const { packId, returnUrl } = body;

    if (typeof packId !== 'string' || !packId) {
      return jsonResponse({ error: 'invalid_pack_id' }, 400);
    }

    const apiKey = Deno.env.get('SASPAY_API_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: pack, error: packError } = await adminClient
      .from('credit_packs')
      .select('id, price, currency')
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
      .select('email, first_name, last_name, country')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return jsonResponse({ error: 'incomplete_profile', message: 'Un email est requis pour payer.' }, 400);
    }

    const countryCode = await resolveCountryCode(req, profile.country);
    if (
      countryCode &&
      (SASPAY_FORCED_UNSUPPORTED_COUNTRIES.has(countryCode) || !(await isSaspayCountrySupported(countryCode, apiKey)))
    ) {
      return jsonResponse({ error: 'country_not_supported_by_saspay' }, 400);
    }

    // customer_name est un simple libellé affiché sur la page de paiement
    // SasPay, pas une donnée d'autorisation — repli sur la partie locale
    // de l'email si prénom/nom ne sont pas renseignés sur le profil.
    const customerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.email.split('@')[0];

    const saspayRequestBody: Record<string, unknown> = {
      amount: pack.price.toFixed(2),
      currency: pack.currency,
      description: `Pack de crédits ${pack.id} — Secret Divin`,
      customer_email: profile.email,
      customer_name: customerName,
      // "product"/"packId"/"userId" : conservés dans metadata pour
      // consultation éventuelle côté tableau de bord SasPay, mais JAMAIS
      // relus par saspay-webhook (la doc ne garantit pas que metadata
      // revienne dans le payload d'un event transaction.* — voir
      // saspay-webhook pour la vraie méthode de corrélation, basée sur
      // GET /checkout-sessions/{id}/status/ plutôt que sur le contenu du
      // webhook).
      metadata: { product: 'credit_pack', packId: pack.id, userId: user.id },
    };
    if (returnUrl) {
      saspayRequestBody.return_url = returnUrl;
    }

    let saspayResponseJson: SaspaySessionResponse | null = null;
    let saspayHttpStatus = 0;
    try {
      const saspayResponse = await fetch('https://api.saspay.me/api/v1/checkout-sessions/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(saspayRequestBody),
      });
      saspayHttpStatus = saspayResponse.status;
      saspayResponseJson = await saspayResponse.json().catch(() => null);
    } catch (err) {
      console.error('saspay-initiate-checkout: call to SasPay failed', { packId, userId: user.id, error: err });
      return jsonResponse({ error: 'saspay_unreachable' }, 502);
    }

    if (saspayHttpStatus !== 201 || !saspayResponseJson?.success || !saspayResponseJson.data?.id || !saspayResponseJson.data?.checkout_url) {
      console.error('saspay-initiate-checkout: unexpected SasPay response', {
        packId,
        userId: user.id,
        httpStatus: saspayHttpStatus,
        response: saspayResponseJson,
      });
      return jsonResponse({ error: 'unexpected_response' }, 502);
    }

    const session = saspayResponseJson.data;

    // deposit_id = l'id de la session SasPay elle-même (pas une référence
    // générée par nous, contrairement à Chariow) — c'est ce qui permet à
    // saspay-webhook de rappeler GET /checkout-sessions/{id}/status/
    // directement, sans dépendre d'un champ de corrélation dans le
    // payload du webhook.
    const { error: insertError } = await adminClient.from('payment_transactions').insert({
      deposit_id: session.id,
      client_reference_id: session.id,
      status: 'PENDING',
      amount: pack.price,
      currency: pack.currency,
      provider: 'saspay',
      environment: 'production',
      raw_payload: { request: saspayRequestBody, response: saspayResponseJson },
    });

    if (insertError) {
      console.error('saspay-initiate-checkout: insert failed', { sessionId: session.id, error: insertError });
      return jsonResponse({ error: 'db_error' }, 500);
    }

    return jsonResponse({ checkoutUrl: session.checkout_url, reference: session.id }, 200);
  } catch (err) {
    console.error('saspay-initiate-checkout: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
