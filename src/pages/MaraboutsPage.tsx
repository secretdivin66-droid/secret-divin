import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { SPECIALITES, PAYS_LIST, LANGUES, averageNote, whatsappContactUrl } from '../utils/marabouts';
import type { Marabout } from '../utils/marabouts';

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function MaraboutsPage() {
  const [marabouts, setMarabouts] = useState<Marabout[]>([]);
  const [loading, setLoading] = useState(true);

  const [specialite, setSpecialite] = useState('Toutes');
  const [pays, setPays] = useState('Tous');
  const [langue, setLangue] = useState('Toutes');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('marabouts')
      .select(`*, marabout_avis (note)`)
      .eq('is_verified', true)
      .eq('is_active', true)
      .eq('abonnement_actif', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMarabouts((data as Marabout[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = marabouts.filter((m) => {
    const matchSpecialite = specialite === 'Toutes' || m.specialite.includes(specialite);
    const matchPays = pays === 'Tous' || m.pays === pays;
    const matchLangue = langue === 'Toutes' || m.langues.includes(langue);
    const matchSearch = !search.trim() || m.nom_complet.toLowerCase().includes(search.trim().toLowerCase());
    return matchSpecialite && matchPays && matchLangue && matchSearch;
  });

  function handleContact(m: Marabout) {
    window.open(
      whatsappContactUrl(m.numero_whatsapp, 'Bonjour, je vous contacte depuis Secret Divin. J\'aurais besoin de vos services.'),
      '_blank',
      'noopener,noreferrer'
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Marabouts</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Trouve un marabout professionnel pour t'accompagner dans ta démarche spirituelle
        </p>

        <div className="text-center mt-6">
          <Link to="/marabouts/inscrire" className="btn-principal rounded inline-block">
            Vous êtes marabout ? Inscrivez-vous ici
          </Link>
        </div>

        <Separateur />

        {/* FILTRES */}
        <div className="carte rounded-lg grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Spécialité</label>
            <select value={specialite} onChange={(e) => setSpecialite(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
              <option value="Toutes">Toutes</option>
              {SPECIALITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Pays</label>
            <select value={pays} onChange={(e) => setPays(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
              <option value="Tous">Tous</option>
              {PAYS_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Langue</label>
            <select value={langue} onChange={(e) => setLangue(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
              <option value="Toutes">Toutes</option>
              {LANGUES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Recherche</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom du marabout..."
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
          </div>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="text-center" style={{ color: '#a0aec0' }}>Aucun marabout trouvé pour ces critères.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((m) => {
            const note = averageNote(m.marabout_avis);
            const visibleSpecialites = m.specialite.slice(0, 3);
            const remaining = m.specialite.length - visibleSpecialites.length;
            return (
              <div key={m.id} className="rounded-lg overflow-hidden flex flex-col" style={{ background: '#0d1545', border: '1px solid rgba(245,200,66,0.15)' }}>
                <div className="p-5 text-center" style={{ background: 'linear-gradient(160deg, #0d1545, #0d1545)' }}>
                  <div className="w-[70px] h-[70px] rounded-full bg-or text-white font-bold flex items-center justify-center mx-auto text-2xl overflow-hidden">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.nom_complet} className="w-full h-full object-cover" />
                    ) : (
                      m.nom_complet.charAt(0).toUpperCase()
                    )}
                  </div>
                  <p className="text-white font-bold mt-3">{m.nom_complet}</p>
                  <p className="text-sm" style={{ color: '#a0aec0' }}>{m.ville}, {m.pays}</p>
                  {note && <p className="text-or font-bold mt-1">★ {note} / 5</p>}
                </div>

                <div className="p-5 flex flex-col gap-2 flex-1">
                  <div className="flex flex-wrap gap-1">
                    {visibleSpecialites.map((s) => (
                      <span key={s} className="px-2 py-1 rounded-full text-xs font-bold text-or" style={{ background: 'rgba(245,200,66,0.1)' }}>
                        {s}
                      </span>
                    ))}
                    {remaining > 0 && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#1a1a2e', color: '#a0aec0' }}>
                        +{remaining} autres
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: '#a0aec0' }}>{m.annees_experience} ans d'expérience</p>
                  <div className="flex flex-wrap gap-1">
                    {m.langues.map((l) => (
                      <span key={l} className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#1a1a2e', color: '#a0aec0' }}>
                        {l}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-white flex-1">
                    {m.description.length > 100 ? m.description.slice(0, 100) + '…' : m.description}
                  </p>

                  <div className="flex flex-col gap-2 mt-2">
                    <Link to={`/marabouts/${m.id}`} className="btn-secondaire rounded text-center">Voir le profil</Link>
                    <button onClick={() => handleContact(m)} className="rounded font-bold py-2" style={{ background: '#25D366', color: 'white' }}>
                      Contacter
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-10 py-10 px-4 text-center" style={{ background: '#0d1545', borderTop: '1px solid rgba(245,200,66,0.3)' }}>
        <p className="text-or font-bold text-xl">Vous êtes marabout professionnel ?</p>
        <p className="mt-2" style={{ color: '#a0aec0' }}>
          Rejoignez Secret Divin et trouvez de nouveaux clients. Abonnement à 5 000 FCFA/mois.
        </p>
        <Link to="/marabouts/inscrire" className="btn-principal rounded mt-5 inline-block">
          Créer mon profil marabout
        </Link>
      </div>
    </div>
  );
}
