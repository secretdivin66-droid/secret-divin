// Génère automatiquement un article de blog Secret Divin : sujet +
// contenu via Gemini (appel direct, PAS via gemini-proxy — ce proxy exige
// un JWT utilisateur réel et un rate-limit pensé pour l'usage interactif,
// inadapté à un appel serveur autonome), une image de couverture choisie
// aléatoirement dans MYSTICAL_IMAGES puis re-uploadée vers Cloudinary
// (upload signé, sans clé Unsplash : ces URLs sont déjà des photos
// Unsplash valides, on ne fait que les rapatrier sur notre CDN).
//
// Insère toujours en is_published=false (brouillon) : la relecture et la
// publication restent manuelles via /admin (BlogAdminPanel), il n'existe
// pas ici de pipeline de validation automatique comme sur d'autres
// projets — un admin humain publie après relecture.
//
// Pas de déclenchement cron configuré pour l'instant (pas demandé) :
// cette fonction s'invoque pour l'instant à la demande (dashboard
// Supabase ou `supabase functions invoke auto-blog`).
//
// Sécurité : seul un appelant présentant la clé service_role est accepté
// — chaque appel consomme du quota Gemini/Cloudinary payant et écrit en
// base, une clé anon (publique, dans le bundle client) ne doit pas
// suffire à déclencher ça à volonté.
//
// Secrets requis (supabase secrets set) :
//   GEMINI_API_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const BLOG_CATEGORIES = [
  'Spiritualité islamique',
  'Géomancie africaine',
  'Plantes mystiques',
  'Carrés magiques',
  'Rêves',
  'Poids mystique',
  'Talismans',
];

// Photos Unsplash génériques à thème mystique/spirituel, choisies au
// préalable pour éviter tout appel à l'API de recherche Unsplash (pas de
// clé requise) — une est tirée au hasard par article, puis re-hébergée
// sur Cloudinary pour ne pas dépendre du lien Unsplash direct (poids,
// disponibilité) sur le long terme.
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

// Dupliqué depuis src/utils/blog.ts volontairement : le frontend et les
// Edge Functions Deno ne partagent jamais de code dans ce projet (voir
// gemini-proxy/novu-proxy, chacun autonome).
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

async function generateArticle(apiKey: string, category: string): Promise<GeneratedArticle | null> {
  const prompt = `Tu écris un nouvel article de blog pour Secret Divin, un site de spiritualité et de pratiques mystiques traditionnelles (géomancie, talismans, invocations, rêves), dans la catégorie "${category}".

Règles :
- Ton : tutoiement ("tu"/"toi"), jamais "vous" — c'est la voix standard du site.
- 600-900 mots, structuré avec des <h2> qui reprennent les questions concrètes que se pose le lecteur.
- Concret et respectueux de la tradition : explique le sens et la pratique sans inventer de faits historiques précis ni de dates.
- Aucune promesse de résultat garanti (pas de "tu obtiendras à coup sûr...").
- N'utilise jamais le mot "vous".
- Réponds UNIQUEMENT avec le JSON demandé, aucun texte hors du JSON.`;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      return jsonResponse({ error: 'not_authorized' }, 403);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const cloudinaryApiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const cloudinaryApiSecret = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!geminiApiKey || !cloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const category = pickRandom(BLOG_CATEGORIES);
    const generated = await generateArticle(geminiApiKey, category);
    if (!generated) {
      return jsonResponse({ error: 'generation_failed' }, 502);
    }

    const sourceImage = pickRandom(MYSTICAL_IMAGES);
    const coverImage = await uploadToCloudinary(cloudName, cloudinaryApiKey, cloudinaryApiSecret, sourceImage);
    if (!coverImage) {
      return jsonResponse({ error: 'cloudinary_upload_failed' }, 502);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const slug = slugify(generated.title);
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

    if (insertError) {
      return jsonResponse({ error: 'insert_failed', detail: insertError.message }, 500);
    }

    return jsonResponse({ success: true, article });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'internal_error' }, 500);
  }
});
