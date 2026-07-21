import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { SPECIALITES, PAYS_LIST, LANGUES, ABONNEMENT_PRIX_FCFA, averageNote, whatsappContactUrl } from '../utils/marabouts';
import { WHATSAPP_NUMBER } from '../utils/mystique';
import type { Marabout } from '../utils/marabouts';
import { PhotoUpload } from '../components/PhotoUpload';

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
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

function CheckboxGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

export function MaraboutDashboardPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [marabout, setMarabout] = useState<Marabout | null>(null);
  const [loading, setLoading] = useState(true);

  const [nomComplet, setNomComplet] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [pays, setPays] = useState(PAYS_LIST[0]);
  const [ville, setVille] = useState('');
  const [experience, setExperience] = useState('0');
  const [selectedSpecialites, setSelectedSpecialites] = useState<string[]>([]);
  const [selectedLangues, setSelectedLangues] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [tarifs, setTarifs] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      navigate('/auth');
      return;
    }
    setUser(authUser);

    const { data } = await supabase
      .from('marabouts')
      .select(`*, marabout_avis (note, commentaire, created_at)`)
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (!data) {
      navigate('/marabouts/inscrire');
      return;
    }

    const m = data as Marabout;
    setMarabout(m);
    setNomComplet(m.nom_complet);
    setWhatsapp(m.numero_whatsapp);
    setPays(m.pays);
    setVille(m.ville);
    setExperience(String(m.annees_experience));
    setSelectedSpecialites(m.specialite);
    setSelectedLangues(m.langues);
    setDescription(m.description);
    setTarifs(m.tarifs_description ?? '');
    setPhotoUrl(m.photo_url ?? '');
    setLoading(false);
  }

  function toggleSpecialite(value: string) {
    setSelectedSpecialites((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleLangue(value: string) {
    setSelectedLangues((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleUpdateProfile() {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      // Colonnes réelles : numero_whatsapp/specialite, pas whatsapp/
      // specialites (voir 0013_marabouts_add_missing_columns.sql pour
      // langues/tarifs_description/annees_experience/updated_at, qui
      // manquaient aussi jusque-là).
      await supabase
        .from('marabouts')
        .update({
          nom_complet: nomComplet,
          description,
          specialite: selectedSpecialites,
          pays,
          ville,
          langues: selectedLangues,
          numero_whatsapp: whatsapp,
          tarifs_description: tarifs || null,
          annees_experience: parseInt(experience) || 0,
          photo_url: photoUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      setSaveMessage('Profil mis à jour avec succès');
      setTimeout(() => setSaveMessage(null), 3000);
      await load();
    } catch {
      setSaveMessage('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !marabout || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <p className="text-or">Chargement...</p>
      </div>
    );
  }

  const avisList = marabout.marabout_avis ?? [];
  const note = averageNote(avisList);
  const paymentMessage =
    'Bonjour, je souhaite renouveler mon abonnement marabout sur Secret Divin pour 5 000 FCFA. Mon email : ' +
    user.email + ' Mon profil : ' + marabout.nom_complet;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-[800px] mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Mon Espace Marabout</h1>

        <Separateur />

        {/* STATUT */}
        {!marabout.is_verified && (
          <div className="rounded-lg p-5 text-center mb-8" style={{ background: '#3a2410', border: '1px solid #ff9800' }}>
            <p className="text-orange-300">En attente de validation par l'admin. Tu seras notifié par WhatsApp.</p>
          </div>
        )}
        {marabout.is_verified && !marabout.abonnement_actif && (
          <div className="rounded-lg p-5 text-center mb-8" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
            <p className="text-red-400 mb-3">Profil non actif. Abonnement à payer : {ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA/mois.</p>
            <button
              onClick={() => window.open(whatsappContactUrl(WHATSAPP_NUMBER, paymentMessage), '_blank', 'noopener,noreferrer')}
              className="rounded font-bold py-2 px-6"
              style={{ background: '#25D366', color: 'white' }}
            >
              Payer via WhatsApp
            </button>
          </div>
        )}
        {marabout.is_verified && marabout.abonnement_actif && (
          <div className="rounded-lg p-5 text-center mb-8" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
            <p className="text-green-400">Profil actif et visible.</p>
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Abonnement valide jusqu'au : {formatDate(marabout.abonnement_expire_le)}</p>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="carte rounded-lg text-center">
            <p className="text-or font-bold text-3xl">{marabout.vues}</p>
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Vues de ton profil</p>
          </div>
          <div className="carte rounded-lg text-center">
            <p className="text-or font-bold text-3xl">{avisList.length}</p>
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Avis reçus</p>
          </div>
          <div className="carte rounded-lg text-center">
            <p className="text-or font-bold text-3xl">{note ?? '—'}</p>
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Note moyenne / 5</p>
          </div>
        </div>

        <Separateur />

        {/* MODIFIER MON PROFIL */}
        <div className="carte rounded-lg flex flex-col gap-5">
          <h2 className="text-or font-bold">Modifier mon profil</h2>

          {saveMessage && <p className="text-sm text-green-400">{saveMessage}</p>}

          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Nom complet</label>
            <input value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Numéro WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Pays</label>
              <select value={pays} onChange={(e) => setPays(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
                {PAYS_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Ville</label>
              <input value={ville} onChange={(e) => setVille(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Années d'expérience</label>
            <input type="number" min={0} max={60} value={experience} onChange={(e) => setExperience(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Vos spécialités</label>
            <CheckboxGroup options={SPECIALITES} selected={selectedSpecialites} onToggle={toggleSpecialite} />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Langues parlées</label>
            <CheckboxGroup options={LANGUES} selected={selectedLangues} onToggle={toggleLangue} />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Description de vos services</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y" />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Tarifs indicatifs</label>
            <textarea rows={2} value={tarifs} onChange={(e) => setTarifs(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y" />
          </div>

          <div>
            <label className="block text-sm mb-1 text-center" style={{ color: '#a0aec0' }}>Votre photo</label>
            <PhotoUpload
              userId={user?.id ?? ''}
              currentPhotoUrl={photoUrl}
              onUploadSuccess={(url) => setPhotoUrl(url)}
            />
          </div>

          <button onClick={handleUpdateProfile} disabled={saving} className="btn-principal rounded disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Mettre à jour mon profil'}
          </button>
        </div>

        <Separateur />

        {/* MES AVIS */}
        <h2 className="text-or font-bold mb-4">Mes Avis</h2>
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
          <p style={{ color: '#a0aec0' }}>Aucun avis reçu pour le moment.</p>
        )}

        <Separateur />

        {/* RENOUVELER ABONNEMENT */}
        <div className="rounded-lg p-6 text-center" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
          <p className="text-white font-bold">Abonnement : {ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA/mois</p>
          {marabout.abonnement_actif ? (
            <>
              <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>Actif</span>
              <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>Expire le {formatDate(marabout.abonnement_expire_le)}</p>
              <button
                onClick={() => window.open(whatsappContactUrl(WHATSAPP_NUMBER, paymentMessage), '_blank', 'noopener,noreferrer')}
                className="rounded font-bold py-2 px-6 mt-4"
                style={{ background: '#25D366', color: 'white' }}
              >
                Renouveler via WhatsApp
              </button>
            </>
          ) : (
            <>
              <span className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#3a1b1b', color: '#e53935' }}>Inactif</span>
              <p className="text-sm mt-2 text-white">Ton profil n'est pas visible.</p>
              <button
                onClick={() => window.open(whatsappContactUrl(WHATSAPP_NUMBER, paymentMessage), '_blank', 'noopener,noreferrer')}
                className="rounded font-bold py-2 px-6 mt-4"
                style={{ background: '#25D366', color: 'white' }}
              >
                Payer {ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA via WhatsApp
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
