import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { BLOG_CATEGORIES } from '../utils/blog';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  cover_image: string | null;
  published_at: string | null;
  views: number;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function BlogPage() {
  useRevealOnScroll();

  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [category, setCategory] = useState('Tous');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('blog_articles')
      .select('id, title, slug, excerpt, category, cover_image, published_at, views')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .then(({ data }) => {
        setArticles(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = category === 'Tous' ? articles : articles.filter((a) => a.category === category);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Blog Secret Divin</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvrez les secrets des sciences mystiques islamiques
        </p>

        <Separateur />

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: 'thin' }}>
          {['Tous', ...BLOG_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition ${
                category === c ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {!loading && filtered.length === 0 && (
          <p className="text-center" style={{ color: '#b0b8d4' }}>Aucun article publié pour le moment.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((article) => (
            <Link
              key={article.id}
              to={`/blog/${article.slug}`}
              className="reveal rounded-lg overflow-hidden flex flex-col transition hover:-translate-y-1"
              style={{ background: '#111a55', border: '1px solid rgba(37,99,235,0.15)' }}
            >
              <div
                className="h-40"
                style={
                  article.cover_image
                    ? { backgroundImage: `url(${article.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: 'linear-gradient(135deg, #2563EB, #1a237e)' }
                }
              />
              <div className="p-5 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="px-2 py-1 rounded text-xs font-bold text-or" style={{ background: 'rgba(37,99,235,0.1)' }}>
                    {article.category}
                  </span>
                  <span className="text-xs" style={{ color: '#b0b8d4' }}>
                    {article.published_at ? formatDate(article.published_at) : ''}
                  </span>
                </div>
                <h2 className="text-white font-bold">{article.title}</h2>
                <p className="text-sm flex-1" style={{ color: '#b0b8d4' }}>{article.excerpt}</p>
                <span className="text-or font-bold text-sm mt-2">Lire la suite →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
