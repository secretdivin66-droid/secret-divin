// Génère automatiquement un article de blog Secret Divin, en continu et
// sans jamais s'arrêter, à raison de 2 appels/jour (8h et 18h UTC, voir
// migration 0016 pour le planning pg_cron).
//
// Sujet :
// - Pioche un angle 'pending' au hasard dans blog_queue (file thématique
//   pré-remplie par la migration 0016, ~65 angles de référence groupés
//   par thème). Une fois généré, l'angle passe en 'done'.
// - Si plus aucun angle n'est 'pending' (file épuisée), pioche un thème
//   déjà 'done' au hasard et demande à Gemini un ANGLE NOUVEAU sur ce
//   même thème (jamais un doublon littéral — voir buildUserPrompt) : la file
//   ne se vide donc jamais réellement, elle grossit indéfiniment. Fallback
//   supplémentaire si blog_queue est entièrement vide (ex: migration pas
//   encore appliquée) : génère sur une catégorie BLOG_CATEGORIES au hasard
//   sans angle précis, plutôt que d'échouer.
//
// Image de couverture : recherchée sur l'API Unsplash (endpoint
// /search/photos) avec 2-3 mots-clés anglais dérivés de la catégorie de
// l'article (voir CATEGORY_IMAGE_KEYWORDS/searchUnsplashImage), puis
// re-uploadée vers Cloudinary via un upload SIGNÉ (pas de preset unsigned
// côté serveur, voir uploadToCloudinary) — jamais l'URL Unsplash brute
// stockée directement, même pipeline Cloudinary qu'avant. Le nom du
// photographe et son lien de profil sont conservés dans
// blog_articles.image_credit_name/image_credit_url (migration 0018) pour
// attribution sous l'image (voir BlogArticlePage.tsx). Si UNSPLASH_ACCESS_KEY
// est absent, la recherche échoue ou ne retourne aucun résultat : repli sur
// MYSTICAL_IMAGES (aucune clé requise, ce sont déjà des photos valides) —
// jamais de mention de crédit dans ce cas, voir searchUnsplashImage et son
// appelant.
//
// Texte alternatif de la couverture (blog_articles.cover_image_alt,
// migration 0019) : généré par Gemini dans le MÊME appel que title/
// excerpt/content/faq (champ coverImageAlt du schéma), pas une recherche
// d'image séparée — décrit le sujet de l'article, pas la photo Unsplash
// elle-même (dont le contenu visuel exact n'est connu qu'après coup).
// BlogArticlePage.tsx/BlogPage.tsx retombent sur le titre si NULL (articles
// publiés avant cette migration, ou créés manuellement via BlogAdminPanel).
//
// Slug : jamais deux articles avec le même slug — si le slug généré
// existe déjà, un suffixe timestamp est ajouté (voir uniqueSlug).
//
// Publication : is_published/published_at reflètent directement le
// résultat de la validation déterministe ci-dessous (pas de colonne
// "status" séparée dans ce schéma — BlogAdminPanel, BlogPage et
// BlogArticlePage lisent tous is_published, en ajouter une seconde
// source de vérité créerait une désynchronisation possible). Publié
// automatiquement UNIQUEMENT si validation_notes commence par "Passed" ;
// sinon inséré en brouillon (is_published=false) pour relecture manuelle
// dans /admin (BlogAdminPanel) — jamais republié automatiquement après
// coup, pas de second appel cron de validation comme sur un autre projet.
//
// Contenu obligatoire (SYSTEM_PROMPT) : au moins 5 liens internes fondus
// dans le texte, un CTA milieu vers l'outil de la catégorie, un CTA fin
// vers /auth, le nom "Secret Divin" au moins 5 fois, et 3-5 questions FAQ
// pour le schema FAQPage.
//
// Validation en 2 niveaux, sur le contenu BRUT généré par Gemini (avant
// tout patch) :
// - Patché directement si absent (jamais laissé au hasard du prompt) :
//   lien WhatsApp et CTA final /auth — voir ensureWhatsAppSection/
//   ensureFinalCta, appliqués juste avant l'insertion.
// - Vérifié + UNE régénération si ça échoue (liens/mentions/marque ne se
//   patchent pas sans dégrader l'article, voir runDeterministicChecks) :
//   au moins 5 liens internes distincts, au moins 5 mentions de "Secret
//   Divin", CTA milieu présent avant les 15% derniers du contenu. Le
//   résultat (pass ou liste des échecs restants après la régénération)
//   est écrit dans blog_articles.validation_notes (migration 0017) — un
//   "Passed" déclenche la publication immédiate, une liste d'échecs
//   laisse l'article en brouillon pour relecture dans BlogAdminPanel.
//
// La FAQ n'est PAS injectée comme <script> dans "content" : elle est
// stockée dans la colonne blog_articles.faq (jsonb), déjà rendue par
// BlogArticlePage.tsx en un vrai <script type="application/ld+json">
// (voir migration 0015 — un <script> inline dans "content" ne produit
// aucune donnée structurée exploitable une fois passé par
// dangerouslySetInnerHTML, c'est exactement le bug que 0015 corrigeait).
//
// IMPORTANT AU DÉPLOIEMENT : --no-verify-jwt (pg_cron n'envoie pas de JWT
// Supabase, voir migration 0016) :
//   supabase functions deploy auto-blog --no-verify-jwt
//
// Sécurité : authentifiée par un secret partagé dédié (header
// x-auto-blog-cron-secret comparé en temps constant à
// AUTO_BLOG_CRON_SECRET), pas par la clé service_role — ni Vault ni
// `alter database` ne sont disponibles sur le plan gratuit pour faire
// porter un secret jusqu'à pg_cron (voir migration 0016, table
// private.pipeline_secrets).
//
// Secrets requis (supabase secrets set) :
//   AUTO_BLOG_CRON_SECRET, GEMINI_API_KEY_BLOG, CLOUDINARY_CLOUD_NAME,
//   CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Secret optionnel (repli silencieux sur MYSTICAL_IMAGES si absent) :
//   UNSPLASH_ACCESS_KEY
//
// GEMINI_API_KEY_BLOG est une clé dédiée au projet Google Cloud
// "secretdivin-autoblog", séparée depuis le 2026-07-26 de celle utilisée par
// gemini-proxy (GEMINI_API_KEY_USER_TOOLS, projet "secretdivin-tools") :
// les deux partageaient auparavant GEMINI_API_KEY, donc le même quota
// Google (20 req/jour en free tier) — auto-blog (2 runs cron/jour + retries)
// pouvait à lui seul épuiser le quota des pages outils utilisateur, et
// inversement. Chaque fonction a maintenant son propre quota isolé.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// gemini-2.5-flash renvoie 404 "no longer available to new users" avec
// cette clé (comptes Google AI créés après la dépréciation de ce modèle) —
// vérifié en direct via curl le 2026-07-25. gemini-3.5-flash répondait 200
// avec la même clé à cette date, mais renvoie du 503 "high demand" de façon
// persistante depuis le 2026-07-28 (constaté en direct le 2026-07-29, même
// symptôme que sur un autre projet la veille) ; gemini-3.6-flash répond
// normalement au même moment avec la même clé, d'où ce choix.
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Fallback si blog_queue est entièrement vide (ex: migration 0016 pas
// encore appliquée) — mêmes 13 catégories que src/utils/blog.ts, dupliqué
// volontairement (le frontend et les Edge Functions Deno ne partagent
// jamais de code dans ce projet, voir gemini-proxy/novu-proxy).
const BLOG_CATEGORIES = [
  'Spiritualité islamique',
  'Géomancie africaine',
  'Plantes mystiques',
  'Carrés magiques',
  'Rêves',
  'Poids mystique',
  'Talismans',
  'Secrets Mystiques',
  'Destin',
  'Jours de Naissance',
  'Compatibilité',
  'Formation',
  'Attraper ou Réconcilier',
  'Tutoriels',
];

// Photos Unsplash génériques à thème mystique/spirituel, choisies au
// préalable pour éviter tout appel à l'API de recherche Unsplash (pas de
// clé requise) — une est tirée au hasard par article, puis re-hébergée
// sur Cloudinary pour ne pas dépendre du lien Unsplash direct sur la durée.
const MYSTICAL_IMAGES = [
  'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=1200',
  'https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=1200',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
  'https://images.unsplash.com/photo-1471623432079-b009d30b6729?w=1200',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=1200',
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200',
  'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=1200',
  'https://images.unsplash.com/photo-1446941611757-91d2c3bd3d45?w=1200',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200',
  'https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=1200',
];

// Mots-clés anglais (recherche Unsplash) par catégorie — un thème visuel
// pertinent par catégorie plutôt qu'une extraction dynamique du sujet
// précis (topic), pour rester déterministe même sur un angle inédit inventé
// par Gemini (isNewAngle) : category est toujours connue, topic non.
const CATEGORY_IMAGE_KEYWORDS: Record<string, string[]> = {
  'Secrets Mystiques': ['islamic spirituality', 'sacred quran'],
  'Poids mystique': ['numerology', 'sacred geometry'],
  'Carrés magiques': ['magic squares', 'sacred geometry'],
  'Rêves': ['dream interpretation', 'night sky'],
  'Plantes mystiques': ['sacred herbs', 'medicinal plants'],
  'Géomancie africaine': ['geomancy', 'african tradition'],
  'Destin': ['fate destiny', 'starry sky'],
  'Jours de Naissance': ['islamic astrology', 'moon phases'],
  'Compatibilité': ['love connection', 'harmony'],
  'Formation': ['ancient manuscript', 'learning wisdom'],
  'Attraper ou Réconcilier': ['reconciliation', 'unity peace'],
  'Tutoriels': ['spiritual guide', 'ancient knowledge'],
  'Spiritualité islamique': ['islamic spirituality', 'mosque prayer'],
  'Talismans': ['talisman amulet', 'protection symbol'],
};
const DEFAULT_IMAGE_KEYWORDS = ['mystical spirituality', 'ancient wisdom'];

function getImageKeywords(category: string): string[] {
  return CATEGORY_IMAGE_KEYWORDS[category] ?? DEFAULT_IMAGE_KEYWORDS;
}

interface UnsplashPhoto {
  url: string;
  photographerName: string;
  photographerUrl: string;
}

// Cherche une photo pertinente sur Unsplash pour ces mots-clés ; retourne
// null (jamais ne lève) sur toute défaillance — clé absente, erreur réseau,
// réponse non-OK, ou aucun résultat — pour que l'appelant retombe
// silencieusement sur MYSTICAL_IMAGES sans jamais bloquer la génération.
async function searchUnsplashImage(accessKey: string | undefined, keywords: string[]): Promise<UnsplashPhoto | null> {
  if (!accessKey) return null;

  const query = keywords.join(' ');
  let response: Response;
  try {
    response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5`,
      { headers: { Authorization: `Client-ID ${accessKey}` } },
    );
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data = (await response.json()) as {
    results?: { urls: { regular: string }; user: { name: string; links: { html: string } } }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) return null;

  const photo = pickRandom(results);
  return { url: photo.urls.regular, photographerName: photo.user.name, photographerUrl: photo.user.links.html };
}

const WHATSAPP_URL = 'https://whatsapp.com/channel/0029Vb61GC6Bvvsa4BN19I0W';
const AUTH_URL = 'https://www.secretdivin.com/auth';

// CTA "milieu d'article" : pointe vers la page outil de la catégorie
// traitée. Les 2 catégories historiques sans page outil dédiée
// ("Spiritualité islamique", "Talismans") retombent sur l'accueil.
const TOOL_PAGE_URLS: Record<string, string> = {
  'Poids mystique': 'https://www.secretdivin.com/poids-mystique',
  'Carrés magiques': 'https://www.secretdivin.com/carres-magiques',
  'Géomancie africaine': 'https://www.secretdivin.com/geomancie',
  'Rêves': 'https://www.secretdivin.com/reves',
  'Secrets Mystiques': 'https://www.secretdivin.com/secrets',
  'Plantes mystiques': 'https://www.secretdivin.com/plantes',
  'Destin': 'https://www.secretdivin.com/destin',
  'Attraper ou Réconcilier': 'https://www.secretdivin.com/attraper',
  'Jours de Naissance': 'https://www.secretdivin.com/jours',
  'Compatibilité': 'https://www.secretdivin.com/compatibilite',
  'Formation': 'https://www.secretdivin.com/formation',
  'Tutoriels': 'https://www.secretdivin.com/tutoriels',
};
const DEFAULT_TOOL_URL = 'https://www.secretdivin.com';

// Pour le comptage déterministe de liens (voir runDeterministicChecks) —
// même liste que celle listée dans SYSTEM_PROMPT. Ne PAS inclure
// DEFAULT_TOOL_URL seule ("https://www.secretdivin.com") : elle est un
// préfixe de toutes les autres, un comptage par sous-chaîne la
// compterait à tort à chaque autre lien trouvé. On compte donc les hrefs
// exacts extraits du HTML (voir extractHrefs), jamais par inclusion de
// sous-chaîne.
const ALL_INTERNAL_LINKS = [
  'https://www.secretdivin.com/poids-mystique',
  'https://www.secretdivin.com/carres-magiques',
  'https://www.secretdivin.com/geomancie',
  'https://www.secretdivin.com/reves',
  'https://www.secretdivin.com/secrets',
  'https://www.secretdivin.com/plantes',
  'https://www.secretdivin.com/destin',
  'https://www.secretdivin.com/attraper',
  'https://www.secretdivin.com/jours',
  'https://www.secretdivin.com/compatibilite',
  'https://www.secretdivin.com/formation',
  'https://www.secretdivin.com/tutoriels',
  'https://www.secretdivin.com/auth',
  'https://www.secretdivin.com/marabouts',
  'https://www.secretdivin.com/marabouts/inscrire',
  'https://www.secretdivin.com/credits',
  'https://www.secretdivin.com',
];

const MIN_INTERNAL_LINKS = 5;
const MIN_BRAND_MENTIONS = 5;

const DIACRITICS_REGEX = new RegExp('[̀-ͯ]', 'g');

// Dupliqué depuis src/utils/blog.ts, même remarque que BLOG_CATEGORIES
// ci-dessus.
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

interface QueueRow {
  id: string;
  theme: string;
  topic: string;
  category: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface GeneratedArticle {
  title: string;
  excerpt: string;
  content: string;
  faq: FaqItem[];
  coverImageAlt: string;
}

const GENERATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    excerpt: { type: 'STRING', description: '1-2 phrases, ~150-160 caractères, résumé accrocheur' },
    content: {
      type: 'STRING',
      description:
        'Corps complet en HTML : <h2>/<h3> pour les titres, <p> pour les paragraphes, <ul>/<ol> pour les listes, <a href="..."> pour les liens obligatoires. Pas de <h1>, pas de wrapper <html>/<body>, pas de <script>.',
    },
    faq: {
      type: 'ARRAY',
      description:
        '3 à 5 questions fréquentes pertinentes avec leur réponse, pour le schema FAQPage — affichées séparément par le site, ne pas les répéter dans "content".',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          answer: { type: 'STRING' },
        },
        required: ['question', 'answer'],
      },
    },
    coverImageAlt: {
      type: 'STRING',
      description:
        'Texte alternatif (attribut alt) de l\'image de couverture, pour l\'accessibilité et le SEO — décrit le SUJET de l\'article (pas l\'image Unsplash elle-même, inconnue à ce stade), 8 à 15 mots, sans "image de" ni "photo de" en préfixe. Exemple pour un article sur le poids mystique : "Calcul du poids mystique en numérologie Abjad selon la tradition islamique".',
    },
  },
  required: ['title', 'excerpt', 'content', 'faq', 'coverImageAlt'],
};

// System prompt fixe (mêmes règles à chaque appel) — voir buildUserPrompt
// pour ce qui varie par article (sujet précis, catégorie, CTA milieu).
const SYSTEM_PROMPT = `Tu es expert en sciences islamiques ésotériques africaines. Rédige un article de blog en français de 1200-1500 mots, ton islamique et respectueux, optimisé SEO. Tutoiement ("tu"/"toi"), jamais "vous" — c'est la voix standard du site.

LIENS OBLIGATOIRES à intégrer naturellement dans le texte (pas en liste, pas en footer) :

Pages fonctionnalités :
- Poids Mystique : https://www.secretdivin.com/poids-mystique
- Carrés Magiques : https://www.secretdivin.com/carres-magiques
- Géomancie : https://www.secretdivin.com/geomancie
- Interprétation des Rêves : https://www.secretdivin.com/reves
- Secrets Mystiques : https://www.secretdivin.com/secrets
- Plantes Mystiques : https://www.secretdivin.com/plantes
- Destin Complet : https://www.secretdivin.com/destin
- Attraper ou Réconcilier : https://www.secretdivin.com/attraper
- Jours de Naissance : https://www.secretdivin.com/jours
- Compatibilité : https://www.secretdivin.com/compatibilite
- Formation : https://www.secretdivin.com/formation
- Tutoriels : https://www.secretdivin.com/tutoriels

Pages principales :
- Accueil : https://www.secretdivin.com
- Inscription gratuite : https://www.secretdivin.com/auth
- Annuaire marabouts : https://www.secretdivin.com/marabouts
- Inscrire marabout : https://www.secretdivin.com/marabouts/inscrire
- Crédits : https://www.secretdivin.com/credits

Chaîne WhatsApp formation gratuite (mentionner comme ressource complémentaire) :
https://whatsapp.com/channel/0029Vb61GC6Bvvsa4BN19I0W

RÈGLES D'INTÉGRATION :
- Intègre au minimum 5 des liens ci-dessus par article, fondus dans des phrases naturelles (jamais une liste à puces de liens, jamais un bloc "liens utiles").
- Formate chaque lien en HTML : <a href="URL">texte d'ancre naturel</a>, jamais une URL brute.
- Le lien WhatsApp doit apparaître dans une section dédiée vers la fin de l'article.
- 2 CTA obligatoires : un au milieu de l'article vers la page de l'outil de la catégorie traitée (précisée dans le message suivant), un en fin d'article vers https://www.secretdivin.com/auth.
- Mentionne "Secret Divin" par son nom au moins 5 fois dans l'article.
- Concret et respectueux de la tradition : explique le sens et la pratique sans inventer de faits historiques précis ni de dates.
- Aucune promesse de résultat garanti (pas de "tu obtiendras à coup sûr...").
- Fournis aussi 3 à 5 questions fréquentes (FAQ) pertinentes avec réponse dans le champ JSON dédié, pour le schema FAQPage de la page — ne les répète pas dans le corps de l'article.
- Réponds UNIQUEMENT avec le JSON demandé (title, excerpt, content, faq), aucun texte hors du JSON.`;

function buildUserPrompt(
  category: string,
  topic: string | null,
  isNewAngle: boolean,
  existingTitles: string[],
  toolUrl: string,
): string {
  const existingList =
    existingTitles.length > 0
      ? existingTitles.map((t) => `- ${t}`).join('\n')
      : '(aucun article publié dans cette catégorie pour l\'instant)';

  const subjectInstruction = !topic
    ? `Choisis toi-même un sujet précis et pertinent dans la catégorie "${category}".`
    : isNewAngle
      ? `Le thème de référence est "${topic}", déjà traité par le passé sur ce blog, dans la catégorie "${category}". Invente un ANGLE NOUVEAU et inédit sur ce même thème (par exemple : un approfondissement, "secret avancé de...", "X choses à savoir sur...", un angle pratique différent) — le "title" que tu renvoies doit être ce nouvel angle précis, pas une reformulation générique du thème.`
      : `Le sujet exact à traiter est : "${topic}", dans la catégorie "${category}".`;

  return `${subjectInstruction}

Le CTA du milieu de l'article doit pointer vers ${toolUrl} — c'est la page de l'outil correspondant à cette catégorie.

Ne traite pas exactement le même angle qu'un de ces articles déjà publiés dans cette catégorie :
${existingList}`;
}

type GenerateResult = { ok: true; article: GeneratedArticle } | { ok: false; reason: string };

async function generateArticle(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GENERATION_SCHEMA,
          temperature: 0.8,
          maxOutputTokens: 6000,
          // gemini-3.5-flash consommait une grosse part du budget de sortie
          // en "thinking" interne par défaut (~1400 tokens observés sur un
          // test), ce qui tronquait le JSON avant la fin de l'article
          // (erreur "Unterminated string in JSON", vérifié le 2026-07-25) —
          // d'où thinkingBudget=0 à l'origine. gemini-3.6-flash REJETTE 0
          // avec 400 INVALID_ARGUMENT (vérifié en direct le 2026-07-29,
          // même comportement que sur un autre projet la veille) ; 1 est le
          // minimum accepté par ce modèle.
          thinkingConfig: { thinkingBudget: 1 },
        },
      }),
    });
  } catch (error) {
    return { ok: false, reason: `fetch_error: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, reason: `gemini_http_${String(response.status)}: ${body.slice(0, 500)}` };
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    const finishReason = payload.candidates?.[0]?.finishReason ?? 'unknown';
    const blockReason = payload.promptFeedback?.blockReason;
    return {
      ok: false,
      reason: `no_text_in_response: finishReason=${finishReason}${blockReason ? `, blockReason=${blockReason}` : ''}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as Partial<GeneratedArticle>;
    if (!parsed.title || !parsed.excerpt || !parsed.content) {
      return { ok: false, reason: 'incomplete_json: missing title/excerpt/content' };
    }
    const faq = Array.isArray(parsed.faq)
      ? parsed.faq.filter(
          (item): item is FaqItem =>
            typeof item?.question === 'string' && typeof item.answer === 'string',
        )
      : [];
    // coverImageAlt n'est volontairement pas dans la vérification
    // "incomplete_json" ci-dessus : un alt manquant/vide ne doit jamais
    // faire échouer un article par ailleurs valide — la valeur par défaut
    // ici (chaîne vide) devient NULL à l'insertion (voir plus bas), et
    // BlogArticlePage.tsx/BlogPage.tsx retombent alors sur le titre.
    const coverImageAlt = typeof parsed.coverImageAlt === 'string' ? parsed.coverImageAlt : '';
    return {
      ok: true,
      article: { title: parsed.title, excerpt: parsed.excerpt, content: parsed.content, faq, coverImageAlt },
    };
  } catch (error) {
    return {
      ok: false,
      reason: `json_parse_error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Extrait toutes les valeurs de href="..." d'un contenu HTML, pour
// compter les liens réellement posés (jamais par inclusion de
// sous-chaîne, voir la remarque sur ALL_INTERNAL_LINKS ci-dessus).
function extractHrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

function countDistinctInternalLinks(content: string): number {
  const hrefs = new Set(extractHrefs(content));
  return ALL_INTERNAL_LINKS.filter((link) => hrefs.has(link)).length;
}

function countBrandMentions(content: string): number {
  const text = content.replace(/<[^>]+>/g, ' ').toLowerCase();
  return (text.match(/secret divin/g) ?? []).length;
}

// "Milieu" vérifié au sens large : le lien vers l'outil de la catégorie
// doit apparaître avant les 15% derniers du contenu (donc pas seulement
// mêlé au CTA final / à la section WhatsApp, tous deux en toute fin).
function hasMiddleCta(content: string, toolUrl: string): boolean {
  const idx = content.indexOf(`href="${toolUrl}"`);
  if (idx === -1) return false;
  return idx <= content.length * 0.85;
}

// Vérifie les 3 règles du system prompt qui ne sont PAS garanties par
// ensureWhatsAppSection/ensureFinalCta (celles-là sont toujours vraies
// après coup, donc inutiles à re-vérifier). Appelé sur le contenu BRUT
// généré par Gemini, avant tout patch déterministe — pour un signal
// honnête de ce que le LLM a réellement produit, voir l'appelant.
function runDeterministicChecks(content: string, toolUrl: string): string[] {
  const failures: string[] = [];

  const linkCount = countDistinctInternalLinks(content);
  if (linkCount < MIN_INTERNAL_LINKS) {
    failures.push(`only ${String(linkCount)} internal link(s), need at least ${String(MIN_INTERNAL_LINKS)}`);
  }

  const mentions = countBrandMentions(content);
  if (mentions < MIN_BRAND_MENTIONS) {
    failures.push(`"Secret Divin" mentioned ${String(mentions)} time(s), need at least ${String(MIN_BRAND_MENTIONS)}`);
  }

  if (!hasMiddleCta(content, toolUrl)) {
    failures.push(`missing mid-article CTA link to ${toolUrl}`);
  }

  return failures;
}

function buildRetryUserPrompt(basePrompt: string, failures: string[]): string {
  return `${basePrompt}

IMPORTANT : ta précédente tentative ne respectait pas ces règles obligatoires du system prompt, corrige-les strictement cette fois :
${failures.map((f) => `- ${f}`).join('\n')}`;
}

// Garantit déterministiquement (sans compter sur le LLM) les deux règles
// les plus simples à patcher directement : le lien WhatsApp et le CTA
// final vers /auth. Les 3 autres règles (voir runDeterministicChecks)
// sont vérifiées et éventuellement corrigées via une régénération, pas
// patchées directement (impossible d'ajouter "3 mentions de la marque"
// par du texte générique sans dégrader l'article).
function ensureWhatsAppSection(content: string): string {
  if (content.includes(WHATSAPP_URL)) return content;
  return `${content}\n<h2>Continue ta formation gratuitement</h2>\n<p>Rejoins la chaîne WhatsApp de formation gratuite Secret Divin pour approfondir ces enseignements chaque semaine : <a href="${WHATSAPP_URL}">rejoindre la chaîne WhatsApp</a>.</p>`;
}

function ensureFinalCta(content: string): string {
  if (content.includes(AUTH_URL)) return content;
  return `${content}\n<p>Envie d'aller plus loin avec Secret Divin ? <a href="${AUTH_URL}">Crée ton compte gratuitement</a> et découvre tous nos outils.</p>`;
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Upload signé (pas de preset unsigned côté serveur) : rapatrie l'image
// Unsplash choisie vers Cloudinary, dans le même dossier que les covers
// uploadées manuellement depuis BlogAdminPanel (voir src/lib/cloudinary.ts).
async function uploadToCloudinary(
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  sourceImageUrl: string,
): Promise<string | null> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = 'secret-divin/blog';
  const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);

  const form = new FormData();
  form.set('file', sourceImageUrl);
  form.set('api_key', apiKey);
  form.set('timestamp', timestamp);
  form.set('folder', folder);
  form.set('signature', signature);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body = (await response.json()) as { secure_url?: string };
  return body.secure_url ?? null;
}

// Ajoute un court suffixe si le slug existe déjà — jamais deux articles
// avec le même slug.
async function uniqueSlug(
  supabase: ReturnType<typeof createClient>,
  title: string,
): Promise<string> {
  const base = slugify(title);
  const { data } = await supabase.from('blog_articles').select('id').eq('slug', base).maybeSingle();
  if (!data) return base;
  return `${base}-${Date.now().toString(36)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const cronSecret = req.headers.get('x-auto-blog-cron-secret') ?? '';
    const expectedCronSecret = Deno.env.get('AUTO_BLOG_CRON_SECRET') ?? '';

    if (!expectedCronSecret || !timingSafeEqual(cronSecret, expectedCronSecret)) {
      return jsonResponse({ error: 'not_authorized' }, 403);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY_BLOG');
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const cloudinaryApiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const cloudinaryApiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    // Optionnel : absent ou en échec => repli sur MYSTICAL_IMAGES, voir
    // searchUnsplashImage. Ne fait jamais partie de server_misconfigured.
    const unsplashAccessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!geminiApiKey || !cloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: pendingRows } = await supabase
      .from('blog_queue')
      .select('id, theme, topic, category')
      .eq('status', 'pending');

    const { data: doneRows } = await supabase
      .from('blog_queue')
      .select('id, theme, topic, category')
      .eq('status', 'done');

    let queueRow: QueueRow | null = null;
    let isNewAngle = false;
    let category: string;
    let topic: string | null;

    if (pendingRows && pendingRows.length > 0) {
      queueRow = pickRandom(pendingRows);
      category = queueRow.category;
      topic = queueRow.topic;
    } else if (doneRows && doneRows.length > 0) {
      queueRow = pickRandom(doneRows);
      isNewAngle = true;
      category = queueRow.category;
      topic = queueRow.topic;
    } else {
      // Fallback : blog_queue entièrement vide (migration pas encore
      // appliquée, ou seed effacé) — ne bloque jamais la génération.
      category = pickRandom(BLOG_CATEGORIES);
      topic = null;
    }

    const { data: recentArticles } = await supabase
      .from('blog_articles')
      .select('title')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(30);
    const existingTitles = (recentArticles ?? []).map((a) => a.title);

    const toolUrl = TOOL_PAGE_URLS[category] ?? DEFAULT_TOOL_URL;
    const userPrompt = buildUserPrompt(category, topic, isNewAngle, existingTitles, toolUrl);
    let result = await generateArticle(geminiApiKey, SYSTEM_PROMPT, userPrompt);
    if (!result.ok) {
      return jsonResponse({ error: 'generation_failed', reason: result.reason }, 502);
    }
    let generated = result.article;

    // Vérifie les règles obligatoires (liens, mentions, CTA milieu) sur
    // le brouillon brut ; une seule régénération si ça échoue, avec un
    // rappel explicite des règles manquées — jamais plus, pour limiter le
    // coût Gemini. isValidated (juste en dessous) décide ensuite si
    // l'article part publié tel quel ou reste en brouillon.
    let failures = runDeterministicChecks(generated.content, toolUrl);
    if (failures.length > 0) {
      result = await generateArticle(geminiApiKey, SYSTEM_PROMPT, buildRetryUserPrompt(userPrompt, failures));
      if (result.ok) {
        generated = result.article;
        failures = runDeterministicChecks(generated.content, toolUrl);
      }
    }

    const isValidated = failures.length === 0;
    const validationNotes = isValidated
      ? 'Passed automatic validation (internal links, brand mentions, mid-article CTA).'
      : failures.join('; ');

    const content = ensureFinalCta(ensureWhatsAppSection(generated.content));

    const imageKeywords = getImageKeywords(category);
    console.log(`[auto-blog] Unsplash search keywords for category "${category}":`, imageKeywords);
    const unsplashPhoto = await searchUnsplashImage(unsplashAccessKey, imageKeywords);

    let sourceImage: string;
    let imageCreditName: string | null;
    let imageCreditUrl: string | null;

    if (unsplashPhoto) {
      sourceImage = unsplashPhoto.url;
      imageCreditName = unsplashPhoto.photographerName;
      imageCreditUrl = unsplashPhoto.photographerUrl;
      console.log(`[auto-blog] using Unsplash photo by ${imageCreditName}: ${sourceImage}`);
    } else {
      sourceImage = pickRandom(MYSTICAL_IMAGES);
      imageCreditName = null;
      imageCreditUrl = null;
      console.log('[auto-blog] Unsplash unavailable or no results, falling back to static image:', sourceImage);
    }

    const coverImage = await uploadToCloudinary(cloudName, cloudinaryApiKey, cloudinaryApiSecret, sourceImage);
    if (!coverImage) {
      return jsonResponse({ error: 'cloudinary_upload_failed' }, 502);
    }

    const slug = await uniqueSlug(supabase, generated.title);

    const { data: article, error: insertError } = await supabase
      .from('blog_articles')
      .insert({
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content,
        faq: generated.faq.length > 0 ? generated.faq : null,
        cover_image_alt: generated.coverImageAlt || null,
        category,
        cover_image: coverImage,
        is_published: isValidated,
        published_at: isValidated ? new Date().toISOString() : null,
        validation_notes: validationNotes,
        image_credit_name: imageCreditName,
        image_credit_url: imageCreditUrl,
      })
      .select('id, slug')
      .single();

    if (insertError || !article) {
      return jsonResponse({ error: 'insert_failed', detail: insertError?.message }, 500);
    }

    // Fait avancer la file : marque l'angle 'pending' consommé comme
    // 'done', ou enregistre le nouvel angle inventé par Gemini pour que
    // le prochain cycle ne le repioche pas tel quel.
    if (queueRow && !isNewAngle) {
      await supabase
        .from('blog_queue')
        .update({ status: 'done', article_id: article.id, done_at: new Date().toISOString() })
        .eq('id', queueRow.id);
    } else if (queueRow && isNewAngle) {
      await supabase.from('blog_queue').upsert(
        {
          theme: queueRow.theme,
          topic: generated.title,
          category,
          status: 'done',
          article_id: article.id,
          done_at: new Date().toISOString(),
        },
        { onConflict: 'theme,topic', ignoreDuplicates: true },
      );
    }

    return jsonResponse({ success: true, article, category, isNewAngle });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'internal_error' }, 500);
  }
});
