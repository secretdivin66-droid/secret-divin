// Prérend une page HTML statique par article de blog publié, écrite dans
// dist/blog/<slug>/index.html. Tourne APRÈS `vite build` (contrairement à
// generate-sitemap.mjs, qui tourne avant) : il lui faut le vrai
// dist/index.html déjà construit, avec les <script>/<link> vers les
// fichiers hashés du build, comme gabarit à cloner.
//
// Pourquoi : ce site est un SPA 100% client-side (voir vercel.json — tout
// est réécrit vers /index.html), donc le premier passage d'un crawler sur
// une URL d'article ne voyait que le <title>/meta de l'accueil et un
// <body> vide (<div id="root"></div>) jusqu'à exécution du JS. Vercel sert
// un fichier statique existant AVANT d'appliquer les rewrites de
// vercel.json, donc un vrai fichier à dist/blog/<slug>/index.html prend le
// pas sur la réécriture générique pour cette URL précise — le crawler
// obtient direct le bon titre/meta/canonical/contenu, sans dépendre du
// rendu JS. React ne fait pas d'hydratation ici (main.tsx utilise
// createRoot().render(), pas hydrateRoot()), donc remplacer le contenu de
// #root par du HTML statique est sans risque : React le remplace
// simplement au montage, aucune erreur de mismatch possible.
//
// Comme pour generate-sitemap.mjs : jamais d'échec de build si la requête
// Supabase rate (juste un avertissement, dist/ garde alors ses seules
// pages statiques habituelles).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const TEMPLATE_PATH = path.join(DIST_DIR, 'index.html');
const ORIGIN = 'https://www.secretdivin.com';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderArticleHtml(article) {
  const faqBlock =
    article.faq && article.faq.length > 0
      ? `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: article.faq.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        })}</script>`
      : '';

  return `<article>
      <h1>${escapeHtml(article.title)}</h1>
      <p>${escapeHtml(article.category ?? '')} — ${escapeHtml(formatDate(article.published_at))}</p>
      ${article.content ?? ''}
      <p><a href="${ORIGIN}/blog">Retour au blog</a></p>
    </article>
    ${faqBlock}`;
}

function buildHtmlForArticle(template, article) {
  const title = `${article.title} — Secret Divin`;
  const description = article.excerpt || `${article.title} — Secret Divin, sciences ésotériques islamiques traditionnelles.`;
  const url = `${ORIGIN}/blog/${article.slug}`;

  let html = template;

  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /<meta name="description" content=".*?"\s*\/>/s,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );

  const extraHead = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    article.cover_image ? `<meta property="og:image" content="${escapeHtml(article.cover_image)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  html = html.replace('</head>', `    ${extraHead}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${renderArticleHtml(article)}</div>`);

  return html;
}

async function main() {
  let template;
  try {
    template = readFileSync(TEMPLATE_PATH, 'utf-8');
  } catch {
    console.warn('[prerender-blog] dist/index.html introuvable (build pas encore fait ?) — étape ignorée.');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn('[prerender-blog] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY absents — aucune page prérendue.');
    return;
  }

  const endpoint = `${supabaseUrl}/rest/v1/blog_articles?select=slug,title,excerpt,content,category,cover_image,published_at,faq&is_published=eq.true`;

  let articles;
  try {
    const response = await fetch(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!response.ok) {
      throw new Error(`Supabase REST a répondu ${response.status}`);
    }
    articles = await response.json();
  } catch (err) {
    console.warn('[prerender-blog] Échec de récupération des articles, aucune page prérendue :', err.message);
    return;
  }

  for (const article of articles) {
    const outDir = path.join(DIST_DIR, 'blog', article.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'index.html'), buildHtmlForArticle(template, article));
  }

  console.log(`[prerender-blog] ${articles.length} page(s) d'article prérendue(s) dans dist/blog/<slug>/index.html.`);
}

main();
