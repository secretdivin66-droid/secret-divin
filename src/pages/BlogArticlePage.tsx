import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

interface FaqItem {
  question: string;
  answer: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  category: string | null;
  cover_image: string | null;
  published_at: string | null;
  views: number;
  faq: FaqItem[] | null;
}

interface ArticleNavEntry {
  slug: string;
  title: string;
  published_at: string | null;
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

export function BlogArticlePage() {
  useRevealOnScroll();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [article, setArticle] = useState<Article | null>(null);
  const [prevArticle, setPrevArticle] = useState<ArticleNavEntry | null>(null);
  const [nextArticle, setNextArticle] = useState<ArticleNavEntry | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: articleData } = await supabase
        .from('blog_articles')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (!active) return;

      if (!articleData) {
        setNotFound(true);
        return;
      }

      setArticle(articleData);

      // Incrémente les vues via une fonction serveur dédiée : le blog est
      // public (sans connexion), donc on ne peut pas ouvrir UPDATE sur toute
      // la table à un visiteur anonyme — cette fonction ne touche que la
      // colonne views, de façon atomique.
      await supabase.rpc('increment_blog_views', { p_article_id: articleData.id });

      const { data: navData } = await supabase
        .from('blog_articles')
        .select('slug, title, published_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (!active || !navData) return;

      const index = navData.findIndex((a) => a.slug === slug);
      setPrevArticle(index >= 0 && index < navData.length - 1 ? navData[index + 1] : null);
      setNextArticle(index > 0 ? navData[index - 1] : null);
    }

    setArticle(null);
    setNotFound(false);
    load();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (notFound) navigate('/blog', { replace: true });
  }, [notFound, navigate]);

  if (notFound) return null;

  if (!article) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <p className="text-or">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-3xl mx-auto reveal visible">
        <div
          className="h-56 rounded-lg mb-6"
          style={
            article.cover_image
              ? { backgroundImage: `url(${article.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: 'linear-gradient(135deg, #f5c842, #0d1545)' }
          }
        />

        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2 py-1 rounded text-xs font-bold text-or" style={{ background: 'rgba(245,200,66,0.1)' }}>
            {article.category}
          </span>
          <span className="text-xs" style={{ color: '#a0aec0' }}>
            {article.published_at ? formatDate(article.published_at) : ''}
          </span>
          <span className="text-xs" style={{ color: '#a0aec0' }}>{article.views} vues</span>
        </div>

        <h1 className="text-or font-bold text-[2rem] mt-4">{article.title}</h1>

        <Separateur />

        {/* Contenu écrit par les admins uniquement (RLS admin_manage_blog) —
            même niveau de confiance que l'accès direct au panneau d'admin. */}
        <div
          className="blog-content text-white"
          style={{ lineHeight: 1.8 }}
          dangerouslySetInnerHTML={{ __html: article.content ?? '' }}
        />

        {article.faq && article.faq.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: article.faq.map((item) => ({
                  '@type': 'Question',
                  name: item.question,
                  acceptedAnswer: { '@type': 'Answer', text: item.answer },
                })),
              }),
            }}
          />
        )}

        <Separateur />

        <div className="flex flex-col md:flex-row gap-3">
          {prevArticle ? (
            <Link to={`/blog/${prevArticle.slug}`} className="btn-secondaire rounded w-full md:flex-1 text-center">
              ← {prevArticle.title}
            </Link>
          ) : (
            <div className="w-full md:flex-1" />
          )}
          {nextArticle ? (
            <Link to={`/blog/${nextArticle.slug}`} className="btn-secondaire rounded w-full md:flex-1 text-center">
              {nextArticle.title} →
            </Link>
          ) : (
            <div className="w-full md:flex-1" />
          )}
        </div>

        <div className="text-center mt-6">
          <Link to="/blog" className="btn-secondaire rounded">← Retour au blog</Link>
        </div>
      </div>
    </div>
  );
}
