import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { averageNote, whatsappContactUrl } from '../utils/marabouts';
import type { Marabout } from '../utils/marabouts';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
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

function Stars({ note }: { note: number }) {
  return <span className="text-or">{'★'.repeat(note)}{'☆'.repeat(5 - note)}</span>;
}

export function MaraboutProfilPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [marabout, setMarabout] = useState<Marabout | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedNote, setSelectedNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [avisMessage, setAvisMessage] = useState<string | null>(null);
  const [submittingAvis, setSubmittingAvis] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active) setUserId(user?.id ?? null);

      const { data } = await supabase
        .from('marabouts')
        .select(`*, marabout_avis (note, commentaire, created_at, user_id)`)
        .eq('id', id)
        .eq('is_verified', true)
        .maybeSingle();

      if (!active) return;

      if (!data) {
        setNotFound(true);
        return;
      }

      setMarabout(data as Marabout);

      // Incrémente les vues via une fonction serveur dédiée : la fiche est
      // publique (sans connexion), donc on ne peut pas ouvrir UPDATE sur
      // toute la table à un visiteur anonyme.
      await supabase.rpc('increment_marabout_views', { p_marabout_id: id });
    }

    setMarabout(null);
    setNotFound(false);
    load();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (notFound) navigate('/marabouts', { replace: true });
  }, [notFound, navigate]);

  async function handleSubmitAvis() {
    if (!userId || !id || selectedNote === 0) return;
    setSubmittingAvis(true);
    setAvisMessage(null);
    try {
      const { error } = await supabase.from('marabout_avis').insert({
        marabout_id: id,
        user_id: userId,
        note: selectedNote,
        commentaire: commentaire || null,
      });
      if (error) {
        setAvisMessage(
          error.code === '23505'
            ? 'Tu as déjà laissé un avis pour ce marabout.'
            : "Erreur lors de l'envoi de ton avis."
        );
      } else {
        setAvisMessage('Ton avis a bien été publié.');
        setSelectedNote(0);
        setCommentaire('');
        const { data } = await supabase
          .from('marabouts')
          .select(`*, marabout_avis (note, commentaire, created_at, user_id)`)
          .eq('id', id)
          .single();
        if (data) setMarabout(data as Marabout);
      }
    } finally {
      setSubmittingAvis(false);
    }
  }

  if (notFound) return null;

  if (!marabout) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <p className="text-or">Chargement...</p>
      </div>
    );
  }

  const note = averageNote(marabout.marabout_avis);
  const avisList = marabout.marabout_avis ?? [];
  const contactMessage = 'Bonjour, je vous contacte depuis Secret Divin. J\'aurais besoin de vos services.';

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-3xl mx-auto">
        <Link to="/marabouts" className="btn-secondaire rounded inline-block mb-6">← Retour aux marabouts</Link>

        <div className="rounded-lg p-8 text-center" style={{ background: 'linear-gradient(160deg, #0d1545, #0a0f2e)', border: '1px solid rgba(245,200,66,0.3)' }}>
          <div className="w-[100px] h-[100px] rounded-full bg-or text-white font-bold flex items-center justify-center mx-auto text-4xl overflow-hidden">
            {marabout.photo_url ? (
              <img src={marabout.photo_url} alt={marabout.nom_complet} className="w-full h-full object-cover" />
            ) : (
              marabout.nom_complet.charAt(0).toUpperCase()
            )}
          </div>
          <p className="text-or font-bold text-[2rem] mt-4">{marabout.nom_complet}</p>
          <p className="text-white mt-1">{marabout.ville}, {marabout.pays}</p>
          {note && <p className="text-or font-bold mt-2">★ {note} / 5 ({avisList.length} avis)</p>}
          <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>{marabout.vues} profil(s) consulté(s)</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {marabout.langues.map((l) => (
              <span key={l} className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#1a1a2e', color: '#a0aec0' }}>{l}</span>
            ))}
          </div>
          <button
            onClick={() => window.open(whatsappContactUrl(marabout.numero_whatsapp, contactMessage), '_blank', 'noopener,noreferrer')}
            className="rounded font-bold py-3 px-8 mt-6"
            style={{ background: '#25D366', color: 'white' }}
          >
            Contacter sur WhatsApp
          </button>
        </div>

        <Separateur />

        <h2 className="text-or font-bold">À propos</h2>
        <p className="text-white mt-3">{marabout.description}</p>

        <Separateur />

        <h2 className="text-or font-bold mb-3">Spécialités</h2>
        <div className="flex flex-wrap gap-2">
          {marabout.specialite.map((s) => (
            <span key={s} className="px-3 py-2 rounded text-sm text-white" style={{ background: '#0d1545', border: '1px solid rgba(245,200,66,0.2)' }}>
              ✦ {s}
            </span>
          ))}
        </div>

        <Separateur />

        <div className="carte rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-4">
          <p className="text-white text-sm"><span className="font-bold text-or">Expérience : </span>{marabout.annees_experience} ans</p>
          <p className="text-white text-sm"><span className="font-bold text-or">Langues : </span>{marabout.langues.join(', ')}</p>
          <p className="text-white text-sm"><span className="font-bold text-or">Localisation : </span>{marabout.ville}, {marabout.pays}</p>
          {marabout.tarifs_description && (
            <p className="text-white text-sm sm:col-span-3"><span className="font-bold text-or">Tarifs : </span>{marabout.tarifs_description}</p>
          )}
        </div>

        <Separateur />

        <h2 className="text-or font-bold mb-4">Avis des clients ({avisList.length} avis)</h2>
        {avisList.length > 0 ? (
          <div className="flex flex-col gap-3">
            {avisList.map((a, i) => (
              <div key={i} className="carte rounded-lg">
                <Stars note={a.note} />
                {a.commentaire && <p className="text-white mt-2 text-sm">{a.commentaire}</p>}
                <p className="text-xs mt-2" style={{ color: '#a0aec0' }}>{formatDate(a.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#a0aec0' }}>Aucun avis pour le moment.</p>
        )}

        <Separateur />

        {userId ? (
          <div className="carte rounded-lg">
            <h2 className="text-or font-bold mb-3">Laisser un avis</h2>
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedNote(n)}
                  className="text-3xl"
                  style={{ color: n <= selectedNote ? '#f5c842' : '#444' }}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder="Ton commentaire (optionnel)"
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
            />
            {avisMessage && <p className="text-sm mt-2 text-or">{avisMessage}</p>}
            <button
              onClick={handleSubmitAvis}
              disabled={selectedNote === 0 || submittingAvis}
              className="btn-principal rounded mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingAvis ? 'Publication...' : 'Publier mon avis'}
            </button>
          </div>
        ) : (
          <div className="carte rounded-lg text-center">
            <p className="text-white mb-4">Connecte-toi pour laisser un avis.</p>
            <Link to="/auth" className="btn-principal rounded inline-block">Se connecter</Link>
          </div>
        )}

        <Separateur />

        <div className="rounded-lg p-8 text-center" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
          <p className="text-white font-bold mb-4">Besoin des services de {marabout.nom_complet} ?</p>
          <button
            onClick={() => window.open(whatsappContactUrl(marabout.numero_whatsapp, contactMessage), '_blank', 'noopener,noreferrer')}
            className="rounded font-bold py-3 w-full"
            style={{ background: '#25D366', color: 'white' }}
          >
            Contacter sur WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
