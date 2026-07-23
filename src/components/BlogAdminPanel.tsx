import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { callGeminiProxy } from '../lib/geminiProxy';
import { openCloudinaryUploadWidget } from '../lib/cloudinary';
import { BLOG_CATEGORIES, slugify } from '../utils/blog';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  cover_image: string | null;
  is_published: boolean;
  published_at: string | null;
  views: number;
  created_at: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('fr-FR');
}

export function BlogAdminPanel() {
  const { user } = useAuth();

  const [view, setView] = useState<'list' | 'form'>('list');
  const [articles, setArticles] = useState<Article[]>([]);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState(BLOG_CATEGORIES[0]);
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  useEffect(() => {
    loadArticles();
  }, []);

  async function loadArticles() {
    const { data } = await supabase.from('blog_articles').select('*').order('created_at', { ascending: false });
    setArticles(data ?? []);
  }

  function resetForm() {
    setEditingArticle(null);
    setTitle('');
    setSlug('');
    setSlugTouched(false);
    setCategory(BLOG_CATEGORIES[0]);
    setExcerpt('');
    setContent('');
    setCoverImage('');
    setStatus('draft');
    setCoverError(null);
  }

  function handleNewArticle() {
    resetForm();
    setView('form');
  }

  function handleEditArticle(article: Article) {
    setEditingArticle(article);
    setTitle(article.title);
    setSlug(article.slug);
    setSlugTouched(true);
    setCategory(article.category ?? BLOG_CATEGORIES[0]);
    setExcerpt(article.excerpt ?? '');
    setContent(article.content ?? '');
    setCoverImage(article.cover_image ?? '');
    setStatus(article.is_published ? 'published' : 'draft');
    setCoverError(null);
    setView('form');
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  function handleOpenCloudinaryWidget() {
    setCoverError(null);
    openCloudinaryUploadWidget({
      uploadPreset: 'blog_images',
      folder: 'secret-divin/blog',
      onSuccess: setCoverImage,
      onError: setCoverError,
    });
  }

  async function handleGenerateWithGemini() {
    if (!title.trim()) return;
    setGenerating(true);
    try {
      const prompt = `Génère un article de blog complet en français sur ce sujet mystique islamique africain : ${title}. 500-800 mots. Retourne UNIQUEMENT le texte.`;
      const json = await callGeminiProxy('gemini-2.5-flash', {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2000 },
      });
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) setContent(text.trim());
    } catch {
      // L'admin peut réessayer ou écrire le contenu manuellement.
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!user || !title.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      const isPublished = status === 'published';
      await supabase.from('blog_articles').upsert(
        {
          id: editingArticle?.id,
          author_id: user.id,
          title,
          slug,
          excerpt: excerpt || null,
          content: content || null,
          category,
          cover_image: coverImage || null,
          is_published: isPublished,
          published_at: isPublished ? editingArticle?.published_at ?? new Date().toISOString() : null,
          views: editingArticle?.views ?? 0,
        },
        { onConflict: 'slug' }
      );
      await loadArticles();
      setView('list');
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish(article: Article) {
    const nowPublished = !article.is_published;
    await supabase
      .from('blog_articles')
      .update({
        is_published: nowPublished,
        published_at: nowPublished ? article.published_at ?? new Date().toISOString() : article.published_at,
      })
      .eq('id', article.id);
    await loadArticles();
  }

  async function handleDelete(article: Article) {
    if (!window.confirm(`Supprimer l'article "${article.title}" ?`)) return;
    await supabase.from('blog_articles').delete().eq('id', article.id);
    await loadArticles();
  }

  if (view === 'list') {
    return (
      <>
        <div className="flex justify-end mb-5">
          <button onClick={handleNewArticle} className="btn-principal rounded">Nouvel article</button>
        </div>

        {articles.length === 0 ? (
          <p className="text-center" style={{ color: '#a0aec0' }}>Aucun article pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="carte rounded-lg min-w-[700px]">
              <div className="grid grid-cols-7 gap-3 pb-3 font-bold text-sm" style={{ color: '#a0aec0', borderBottom: '1px solid rgba(245,200,66,0.2)' }}>
                <span className="col-span-2">Titre</span>
                <span>Catégorie</span>
                <span>Statut</span>
                <span>Vues</span>
                <span>Date</span>
                <span>Actions</span>
              </div>
              {articles.map((article) => (
                <div key={article.id} className="grid grid-cols-7 gap-3 py-3 items-center text-sm" style={{ borderBottom: '1px solid rgba(245,200,66,0.1)' }}>
                  <span className="col-span-2 text-white">{article.title}</span>
                  <span style={{ color: '#a0aec0' }}>{article.category}</span>
                  <span>
                    <span
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={article.is_published ? { background: '#1b3a1f', color: '#4caf50' } : { background: '#333', color: '#999' }}
                    >
                      {article.is_published ? 'Publié' : 'Brouillon'}
                    </span>
                  </span>
                  <span style={{ color: '#a0aec0' }}>{article.views}</span>
                  <span style={{ color: '#a0aec0' }}>{formatDate(article.created_at)}</span>
                  <span className="flex flex-col gap-1">
                    <button onClick={() => handleEditArticle(article)} className="text-or text-left hover:underline">Modifier</button>
                    <button onClick={() => handleTogglePublish(article)} className="text-or text-left hover:underline">
                      {article.is_published ? 'Dépublier' : 'Publier'}
                    </button>
                    <button onClick={() => handleDelete(article)} className="text-red-400 text-left hover:underline">Supprimer</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="carte rounded-lg max-w-[700px] mx-auto flex flex-col gap-4">
      <h2 className="text-or font-bold">{editingArticle ? "Modifier l'article" : 'Nouvel article'}</h2>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Titre</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
        />
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
        />
        <p className="text-xs mt-1" style={{ color: '#a0aec0' }}>secretdivin.com/blog/{slug || '...'}</p>
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Catégorie</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
        >
          {BLOG_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Extrait (300 caractères max)</label>
        <textarea
          rows={2}
          maxLength={300}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
        />
        <p className="text-right text-xs mt-1" style={{ color: '#a0aec0' }}>{excerpt.length}/300</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm" style={{ color: '#a0aec0' }}>Contenu</label>
          <button
            type="button"
            onClick={handleGenerateWithGemini}
            disabled={!title.trim() || generating}
            className="btn-secondaire rounded text-xs px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Génération...' : 'Générer avec Gemini'}
          </button>
        </div>
        <textarea
          rows={14}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Image de couverture</label>
        {coverImage && (
          <div className="w-full h-32 rounded mb-2" style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="URL de l'image, ou uploade un fichier →"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            className="flex-1 bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
          />
          <button
            type="button"
            onClick={handleOpenCloudinaryWidget}
            className="btn-secondaire rounded px-4 shrink-0"
          >
            Uploader
          </button>
        </div>
        {coverError && <p className="text-red-400 text-xs mt-1">{coverError}</p>}
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Statut</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
          className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
        >
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
        </select>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mt-2">
        <button
          onClick={handleSave}
          disabled={!title.trim() || !slug.trim() || saving}
          className="btn-principal rounded w-full md:flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Enregistrement...' : "Publier l'article"}
        </button>
        <button onClick={() => setView('list')} className="btn-secondaire rounded w-full md:flex-1">
          Annuler
        </button>
      </div>
    </div>
  );
}
