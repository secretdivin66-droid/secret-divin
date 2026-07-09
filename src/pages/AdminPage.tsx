import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { callGeminiProxy } from '../lib/geminiProxy';
import { BLOG_CATEGORIES, slugify } from '../utils/blog';
import { ABONNEMENT_PRIX_FCFA } from '../utils/marabouts';
import type { Marabout } from '../utils/marabouts';

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

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'blog' | 'marabouts'>('blog');

  const [view, setView] = useState<'list' | 'form'>('list');
  const [articles, setArticles] = useState<Article[]>([]);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const [marabouts, setMarabouts] = useState<Marabout[]>([]);
  const [maraboutActionLoading, setMaraboutActionLoading] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(BLOG_CATEGORIES[0]);
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadArticles();
    loadMarabouts();
  }, []);

  async function loadMarabouts() {
    const { data } = await supabase.from('marabouts').select('*').order('created_at', { ascending: false });
    setMarabouts((data as Marabout[]) ?? []);
  }

  async function handleValidateMarabout(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('verify_marabout', { p_marabout_id: m.id });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleActivateSubscription(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('activate_marabout_subscription', { p_marabout_id: m.id });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleToggleMaraboutActive(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('set_marabout_active', { p_marabout_id: m.id, p_is_active: !m.is_active });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleDeleteMarabout(m: Marabout) {
    if (!window.confirm(`Supprimer le profil de "${m.nom_complet}" ?`)) return;
    setMaraboutActionLoading(m.id);
    try {
      await supabase.from('marabouts').delete().eq('id', m.id);
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function loadArticles() {
    const { data } = await supabase.from('blog_articles').select('*').order('created_at', { ascending: false });
    setArticles(data ?? []);
  }

  function resetForm() {
    setEditingArticle(null);
    setTitle('');
    setCategory(BLOG_CATEGORIES[0]);
    setExcerpt('');
    setContent('');
    setCoverImage('');
    setIsPublished(false);
  }

  function handleNewArticle() {
    resetForm();
    setView('form');
  }

  function handleEditArticle(article: Article) {
    setEditingArticle(article);
    setTitle(article.title);
    setCategory(article.category ?? BLOG_CATEGORIES[0]);
    setExcerpt(article.excerpt ?? '');
    setContent(article.content ?? '');
    setCoverImage(article.cover_image ?? '');
    setIsPublished(article.is_published);
    setView('form');
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
    if (!user || !title.trim()) return;
    setSaving(true);
    try {
      const slug = editingArticle?.slug ?? slugify(title);
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

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Administration</h1>

        <Separateur />

        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('blog')}
            className={`px-4 py-2 rounded-full text-sm font-bold ${activeTab === 'blog' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}
          >
            Blog
          </button>
          <button
            onClick={() => setActiveTab('marabouts')}
            className={`px-4 py-2 rounded-full text-sm font-bold ${activeTab === 'marabouts' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}
          >
            Marabouts
          </button>
        </div>

        {activeTab === 'blog' && view === 'list' && (
          <>
            <div className="flex justify-end mb-5">
              <button onClick={handleNewArticle} className="btn-principal rounded">Nouvel article</button>
            </div>

            {articles.length === 0 ? (
              <p className="text-center" style={{ color: '#b0b8d4' }}>Aucun article pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="carte rounded-lg min-w-[700px]">
                  <div className="grid grid-cols-7 gap-3 pb-3 font-bold text-sm" style={{ color: '#b0b8d4', borderBottom: '1px solid rgba(37,99,235,0.2)' }}>
                    <span className="col-span-2">Titre</span>
                    <span>Catégorie</span>
                    <span>Statut</span>
                    <span>Vues</span>
                    <span>Date</span>
                    <span>Actions</span>
                  </div>
                  {articles.map((article) => (
                    <div key={article.id} className="grid grid-cols-7 gap-3 py-3 items-center text-sm" style={{ borderBottom: '1px solid rgba(37,99,235,0.1)' }}>
                      <span className="col-span-2 text-white">{article.title}</span>
                      <span style={{ color: '#b0b8d4' }}>{article.category}</span>
                      <span>
                        <span
                          className="px-2 py-1 rounded-full text-xs font-bold"
                          style={article.is_published ? { background: '#1b3a1f', color: '#4caf50' } : { background: '#333', color: '#999' }}
                        >
                          {article.is_published ? 'Publié' : 'Brouillon'}
                        </span>
                      </span>
                      <span style={{ color: '#b0b8d4' }}>{article.views}</span>
                      <span style={{ color: '#b0b8d4' }}>{formatDate(article.created_at)}</span>
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
        )}

        {activeTab === 'blog' && view === 'form' && (
          <div className="carte rounded-lg max-w-[700px] mx-auto flex flex-col gap-4">
            <h2 className="text-or font-bold">{editingArticle ? 'Modifier l\'article' : 'Nouvel article'}</h2>

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
              {title && <p className="text-xs mt-1" style={{ color: '#b0b8d4' }}>Slug : {editingArticle?.slug ?? slugify(title)}</p>}
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Catégorie</label>
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
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Extrait (300 caractères max)</label>
              <textarea
                rows={2}
                maxLength={300}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
              <p className="text-right text-xs mt-1" style={{ color: '#b0b8d4' }}>{excerpt.length}/300</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm" style={{ color: '#b0b8d4' }}>Contenu</label>
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
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>URL image de couverture</label>
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
            </div>

            <label className="flex items-center gap-3">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              <span className="text-white text-sm">Publier maintenant</span>
            </label>

            <div className="flex flex-col md:flex-row gap-3 mt-2">
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="btn-principal rounded w-full md:flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button onClick={() => setView('list')} className="btn-secondaire rounded w-full md:flex-1">
                Annuler
              </button>
            </div>
          </div>
        )}

        {activeTab === 'marabouts' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.length}</p>
                <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>marabouts inscrits</p>
              </div>
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.filter((m) => m.is_verified).length}</p>
                <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>marabouts validés</p>
              </div>
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.filter((m) => m.abonnement_actif).length}</p>
                <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>
                  abonnements actifs — {marabouts.filter((m) => m.abonnement_actif).length * ABONNEMENT_PRIX_FCFA} FCFA/mois
                </p>
              </div>
            </div>

            {marabouts.length === 0 ? (
              <p className="text-center" style={{ color: '#b0b8d4' }}>Aucun marabout inscrit pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="carte rounded-lg min-w-[800px]">
                  <div className="grid grid-cols-6 gap-3 pb-3 font-bold text-sm" style={{ color: '#b0b8d4', borderBottom: '1px solid rgba(37,99,235,0.2)' }}>
                    <span>Nom</span>
                    <span>Pays</span>
                    <span>Statut</span>
                    <span>Abonnement</span>
                    <span>Vues</span>
                    <span>Actions</span>
                  </div>
                  {marabouts.map((m) => {
                    const statusLabel = !m.is_verified ? 'En attente' : m.is_active ? 'Vérifié actif' : 'Vérifié inactif';
                    const statusColor = !m.is_verified
                      ? { bg: '#3a2410', text: '#ff9800' }
                      : m.is_active
                      ? { bg: '#1b3a1f', text: '#4caf50' }
                      : { bg: '#3a1b1b', text: '#e53935' };
                    const busy = maraboutActionLoading === m.id;
                    return (
                      <div key={m.id} className="grid grid-cols-6 gap-3 py-3 items-center text-sm" style={{ borderBottom: '1px solid rgba(37,99,235,0.1)' }}>
                        <span className="text-white">{m.nom_complet}</span>
                        <span style={{ color: '#b0b8d4' }}>{m.pays}</span>
                        <span>
                          <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: statusColor.bg, color: statusColor.text }}>
                            {statusLabel}
                          </span>
                        </span>
                        <span>
                          {m.abonnement_actif ? (
                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                              Actif — {formatDate(m.abonnement_expire_le)}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#333', color: '#999' }}>Inactif</span>
                          )}
                        </span>
                        <span style={{ color: '#b0b8d4' }}>{m.vues}</span>
                        <span className="flex flex-col gap-1">
                          {!m.is_verified && (
                            <button onClick={() => handleValidateMarabout(m)} disabled={busy} className="text-left hover:underline disabled:opacity-50" style={{ color: '#4caf50' }}>
                              Valider
                            </button>
                          )}
                          {m.is_verified && !m.abonnement_actif && (
                            <button onClick={() => handleActivateSubscription(m)} disabled={busy} className="text-or text-left hover:underline disabled:opacity-50">
                              Activer abonnement
                            </button>
                          )}
                          <button onClick={() => handleToggleMaraboutActive(m)} disabled={busy} className="text-left hover:underline disabled:opacity-50" style={{ color: m.is_active ? '#e53935' : '#4caf50' }}>
                            {m.is_active ? 'Désactiver' : 'Réactiver'}
                          </button>
                          <button onClick={() => handleDeleteMarabout(m)} disabled={busy} className="text-red-400 text-left hover:underline disabled:opacity-50">
                            Supprimer
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
