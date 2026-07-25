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
//   même thème (jamais un doublon littéral — voir buildPrompt) : la file
//   ne se vide donc jamais réellement, elle grossit indéfiniment. Fallback
//   supplémentaire si blog_queue est entièrement vide (ex: migration pas
//   encore appliquée) : génère sur une catégorie BLOG_CATEGORIES au hasard
//   sans angle précis, plutôt que d'échouer.
//
// Image de couverture : une URL Unsplash tirée au hasard dans
// MYSTICAL_IMAGES (pas de clé Unsplash requise, ce sont déjà des photos
// valides), re-uploadée vers Cloudinary via un upload SIGNÉ (pas de preset
// unsigned côté serveur, voir uploadToCloudinary).
//
// Slug : jamais deux articles avec le même slug — si le slug généré
// existe déjà, un suffixe timestamp est ajouté (voir uniqueSlug).
//
// Insère toujours en is_published=false (brouillon) : la relecture et la
// publication restent manuelles via /admin (BlogAdminPanel), il n'existe
// pas de pipeline de validation automatique sur ce projet.
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
//   AUTO_BLOG_CRON_SECRET, GEMINI_API_KEY, CLOUDINARY_CLOUD_NAME,
//   CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
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

interface GeneratedArticle {
  title: string;
  excerpt: string;
  content: string;
}

const GENERATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    excerpt: { type: 'STRING', description: '1-2 phrases, ~150-160 caractères, résumé accrocheur' },
    content: {
      type: 'STRING',
      description:
        'Corps complet en HTML : <h2>/<h3> pour les titres, <p> pour les paragraphes, <ul>/<ol> pour les listes. Pas de <h1>, pas de wrapper <html>/<body>.',
    },
  },
  required: ['title', 'excerpt', 'content'],
};

function buildPrompt(
  category: string,
  topic: string | null,
  isNewAngle: boolean,
  existingTitles: string[],
): string {
  const existingList =
    existingTitles.length > 0
      ? existingTitles.map((t) => `- ${t}`).join('\n')
      : '(aucun article publié dans cette catégorie pour l\'instant)';

  const subjectInstruction = !topic
    ? `Choisis toi-même un sujet précis et pertinent dans cette catégorie.`
    : isNewAngle
      ? `Le thème de référence est "${topic}", déjà traité par le passé sur ce blog. Invente un ANGLE NOUVEAU et inédit sur ce même thème (par exemple : un approfondissement, "secret avancé de...", "X choses à savoir sur...", un angle pratique différent) — le "title" que tu renvoies doit être ce nouvel angle précis, pas une reformulation générique du thème.`
      : `Le sujet exact à traiter est : "${topic}".`;

  return `Tu écris un nouvel article de blog pour Secret Divin, un site de spiritualité et de pratiques mystiques traditionnelles, dans la catégorie "${category}".

${subjectInstruction}

Règles :
- Ton : tutoiement ("tu"/"toi"), jamais "vous" — c'est la voix standard du site.
- 600-900 mots, structuré avec des <h2> qui reprennent les questions concrètes que se pose le lecteur.
- Concret et respectueux de la tradition : explique le sens et la pratique sans inventer de faits historiques précis ni de dates.
- Aucune promesse de résultat garanti (pas de "tu obtiendras à coup sûr...").
- Ne traite pas exactement le même angle qu'un de ces articles déjà publiés dans cette catégorie :
${existingList}
- Réponds UNIQUEMENT avec le JSON demandé, aucun texte hors du JSON.`;
}

async function generateArticle(apiKey: string, prompt: string): Promise<GeneratedArticle | null> {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GENERATION_SCHEMA,
          temperature: 0.8,
          maxOutputTokens: 3000,
        },
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return null;

  try {
    const parsed = JSON.parse(text) as Partial<GeneratedArticle>;
    if (!parsed.title || !parsed.excerpt || !parsed.content) return null;
    return { title: parsed.title, excerpt: parsed.excerpt, content: parsed.content };
  } catch {
    return null;
  }
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

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const cloudinaryApiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const cloudinaryApiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
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

    const prompt = buildPrompt(category, topic, isNewAngle, existingTitles);
    const generated = await generateArticle(geminiApiKey, prompt);
    if (!generated) {
      return jsonResponse({ error: 'generation_failed' }, 502);
    }

    const sourceImage = pickRandom(MYSTICAL_IMAGES);
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
        content: generated.content,
        category,
        cover_image: coverImage,
        is_published: false,
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
