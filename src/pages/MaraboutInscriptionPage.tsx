import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { SPECIALITES, PAYS_LIST, LANGUES, ABONNEMENT_PRIX_FCFA, whatsappContactUrl } from '../utils/marabouts';
import { WHATSAPP_NUMBER } from '../utils/mystique';
import { PhotoUpload } from '../components/PhotoUpload';

const AVANTAGES = [
  'Profil visible sur la plateforme',
  'Filtres par spécialité et pays',
  'Bouton WhatsApp direct',
  "Système d'avis clients",
  'Dashboard personnel',
  "Visibilité auprès de milliers d'utilisateurs",
];

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
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

export function MaraboutInscriptionPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [alreadyPending, setAlreadyPending] = useState(false);

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        navigate('/auth');
        return;
      }
      setUser(authUser);

      console.log('[Supabase] SELECT marabouts — vérification profil existant', {
        table: 'marabouts',
        select: 'id, is_verified, abonnement_actif',
        filter: { user_id: authUser.id },
      });
      const { data: existing, error: existingError } = await supabase
        .from('marabouts')
        .select('id, is_verified, abonnement_actif')
        .eq('user_id', authUser.id)
        .maybeSingle();
      console.log('[Supabase] Réponse SELECT marabouts (vérification) :', { data: existing, error: existingError });
      if (existingError) {
        console.error('[Supabase] Erreur SELECT marabouts (vérification) :', {
          code: existingError.code,
          message: existingError.message,
          details: existingError.details,
          hint: existingError.hint,
        });
      }

      if (existing?.is_verified) {
        navigate('/marabout-dashboard');
        return;
      }
      if (existing) {
        setAlreadyPending(true);
      }
      setChecking(false);
    }
    check();
  }, [navigate]);

  function toggleSpecialite(value: string) {
    setSelectedSpecialites((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleLangue(value: string) {
    setSelectedLangues((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  const isDisabled =
    !nomComplet.trim() ||
    !whatsapp.trim() ||
    !ville.trim() ||
    !description.trim() ||
    selectedSpecialites.length === 0 ||
    selectedLangues.length === 0 ||
    !acceptedTerms;

  async function handleSubmit() {
    if (isDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      // --- DIAGNOSTIC AUTH (frontend uniquement, aucune policy touchée) ---
      // Vérification "live" au moment de la soumission, distincte du
      // `user` en state (posé une seule fois au montage par l'effet plus
      // haut) : si la session a expiré entre-temps, ce `user` de state
      // resterait un objet obsolète alors que Supabase le rejetterait déjà.
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('SESSION', sessionData.session);

      const { data: userData } = await supabase.auth.getUser();
      console.log('USER', userData.user);

      if (!userData.user) {
        console.error('[MaraboutInscriptionPage] Aucun utilisateur retourné par getUser() — session absente ou expirée côté Supabase, alors que la page a pu être atteinte avec un `user` de state non-null.');
        setError('Utilisateur non connecté.');
        setSubmitting(false);
        return;
      }

      const authUserId = userData.user.id;
      console.log('USER.ID utilisé pour user_id du payload :', authUserId);

      // Colonnes réelles de la table marabouts (confirmées le 2026-07-20,
      // complétées par 0013_marabouts_add_missing_columns.sql pour
      // langues/tarifs_description/annees_experience) : whatsapp/
      // specialite(s) restent nommées numero_whatsapp/specialite côté
      // base, d'où les renommages ci-dessous.
      const payload = {
        user_id: authUserId,
        nom_complet: nomComplet,
        photo_url: photoUrl || null,
        description,
        specialite: selectedSpecialites ?? [],
        pays,
        ville,
        langues: selectedLangues,
        numero_whatsapp: whatsapp,
        tarifs_description: tarifs || null,
        annees_experience: parseInt(experience) || 0,
        is_verified: false,
        is_active: true,
        abonnement_actif: false,
      };
      console.log(
        'payload.user_id === userData.user.id ?',
        payload.user_id === userData.user.id,
      );
      console.log('PAYLOAD complet envoyé à marabouts.insert() :', payload);

      // Un seul client Supabase existe dans tout le projet (voir
      // src/lib/supabaseClient.ts, seul appel à createClient()) et c'est
      // ce même `supabase` importé en haut de ce fichier qui sert à la
      // fois pour .auth.getSession()/.getUser() ci-dessus et pour
      // .from('marabouts').insert() ci-dessous — donc pas de désynchro
      // possible entre deux instances différentes du client.
      const { data: insertData, error: insertError } = await supabase.from('marabouts').insert(payload).select();
      console.log('INSERT marabouts — data :', insertData);
      console.log('INSERT marabouts — error :', insertError);
      console.log('INSERT marabouts — error (JSON) :', JSON.stringify(insertError, null, 2));
      if (insertError) {
        throw insertError;
      }
      setSubmitted(true);
    } catch (err) {
      console.error('[MaraboutInscriptionPage] Échec de la soumission :', err);
      setError('Erreur lors de la soumission. Réessaie dans quelques instants.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0e2e' }}>
        <p className="text-or">Chargement...</p>
      </div>
    );
  }

  if (alreadyPending && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0e2e' }}>
        <div className="carte rounded-lg text-center max-w-[500px]">
          <p className="text-white">
            Ta demande d'inscription est en attente de validation par l'admin. Tu seras notifié par WhatsApp dès qu'elle sera traitée.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const paymentMessage =
      'Bonjour, je viens de soumettre ma demande d\'inscription comme marabout sur Secret Divin. Je souhaite payer mon abonnement de 5 000 FCFA. Mon email : ' +
      (user?.email ?? '');
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0e2e' }}>
        <div className="carte rounded-lg text-center max-w-[500px]">
          <p className="text-white">
            Ta demande a bien été envoyée. L'admin va valider ton profil et t'activera après confirmation du paiement de 5 000 FCFA.
            Contacte-nous sur WhatsApp pour finaliser l'inscription.
          </p>
          <button
            onClick={() => window.open(whatsappContactUrl(WHATSAPP_NUMBER, paymentMessage), '_blank', 'noopener,noreferrer')}
            className="rounded font-bold py-3 px-6 mt-5"
            style={{ background: '#25D366', color: 'white' }}
          >
            Finaliser le paiement WhatsApp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Devenir Marabout sur Secret Divin</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Rejoins notre plateforme et trouve de nouveaux clients
        </p>

        <Separateur />

        <div className="rounded-lg p-8 max-w-[400px] mx-auto text-center" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
          <p className="text-or font-bold">Abonnement Marabout</p>
          <p className="text-or font-bold text-[2.5rem] mt-2">{ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA / mois</p>
          <div className="flex flex-col gap-2 mt-5 text-left">
            {AVANTAGES.map((a) => (
              <p key={a} className="text-white text-sm">✦ {a}</p>
            ))}
          </div>
          <p className="italic text-sm mt-5" style={{ color: '#b0b8d4' }}>
            Paiement mensuel via WhatsApp. Profil activé après validation de l'admin et confirmation du paiement.
          </p>
        </div>

        <Separateur />

        <div className="carte rounded-lg flex flex-col gap-5">
          {error && (
            <div className="rounded-lg p-3" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Nom complet</label>
            <input value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Numéro WhatsApp</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Format international sans + ni espaces, ex: 221771234567"
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Pays</label>
              <select value={pays} onChange={(e) => setPays(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
                {PAYS_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Ville</label>
              <input value={ville} onChange={(e) => setVille(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Années d'expérience</label>
            <input
              type="number"
              min={0}
              max={60}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Vos spécialités</label>
            <CheckboxGroup options={SPECIALITES} selected={selectedSpecialites} onToggle={toggleSpecialite} />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Langues parlées</label>
            <CheckboxGroup options={LANGUES} selected={selectedLangues} onToggle={toggleLangue} />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Description de vos services</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Tarifs indicatifs</label>
            <textarea
              rows={2}
              value={tarifs}
              onChange={(e) => setTarifs(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-center" style={{ color: '#b0b8d4' }}>Votre photo (optionnelle)</label>
            <PhotoUpload
              userId={user?.id ?? ''}
              currentPhotoUrl={photoUrl}
              onUploadSuccess={(url) => setPhotoUrl(url)}
            />
          </div>

          <label className="flex items-start gap-2">
            <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" />
            <span className="text-sm text-white">
              J'accepte les conditions d'utilisation de Secret Divin. Je certifie être un professionnel des sciences mystiques
              islamiques. Je m'engage à respecter les clients et à fournir des services sérieux et éthiques. Secret Divin n'est
              pas responsable des transactions entre marabouts et clients.
            </span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={isDisabled || submitting}
            className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Envoi...' : 'SOUMETTRE MA DEMANDE'}
          </button>
        </div>
      </div>
    </div>
  );
}
