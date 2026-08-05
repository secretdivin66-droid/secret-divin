// Régénère public/sitemap.xml à chaque build, à partir des articles
// réellement publiés dans blog_articles — évite qu'il redevienne stale
// comme avant (fichier statique mis à jour à la main, jamais resynchronisé
// avec les publications d'auto-blog, voir historique git de ce fichier).
//
// Utilise l'API REST Supabase directement (clé anon, mêmes
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY que le client — public_read_blog
// autorise déjà anon à lire les articles publiés) plutôt que
// @supabase/supabase-js, pour rester une dépendance zéro dans un script de
// build. N'échoue jamais le build : en cas de souci réseau/config, garde le
// sitemap existant tel quel et se contente d'avertir — un sitemap
// légèrement daté est préférable à un déploiement bloqué.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = path.join(__dirname, '..', 'public', 'sitemap.xml');
const ORIGIN = 'https://www.secretdivin.com';

const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
  { path: '/marabouts', priority: '0.9', changefreq: 'weekly' },
  { path: '/fonctionnalites', priority: '0.8', changefreq: 'monthly' },
  { path: '/credits', priority: '0.8', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/mentions-legales', priority: '0.3', changefreq: 'yearly' },
  { path: '/confidentialite', priority: '0.3', changefreq: 'yearly' },
  { path: '/conditions', priority: '0.3', changefreq: 'yearly' },
];

function buildXml(articleSlugs) {
  const urls = [
    ...STATIC_PAGES,
    ...articleSlugs.map((slug) => ({ path: `/blog/${slug}`, priority: '0.6', changefreq: 'monthly' })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${ORIGIN}${u.path}</loc>\n    <priority>${u.priority}</priority>\n    <changefreq>${u.changefreq}</changefreq>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn('[generate-sitemap] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY absents — sitemap.xml existant conservé tel quel.');
    return;
  }

  const endpoint = `${supabaseUrl}/rest/v1/blog_articles?select=slug&is_published=eq.true&order=published_at.asc`;

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
    console.warn('[generate-sitemap] Échec de récupération des articles, sitemap.xml existant conservé tel quel :', err.message);
    return;
  }

  const slugs = articles.map((a) => a.slug);
  const xml = buildXml(slugs);
  writeFileSync(SITEMAP_PATH, xml);
  console.log(`[generate-sitemap] sitemap.xml régénéré avec ${slugs.length} article(s) + ${STATIC_PAGES.length} pages statiques.`);
}

main();
