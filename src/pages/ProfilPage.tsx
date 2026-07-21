import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { callGeminiProxy } from '../lib/geminiProxy';
import { calculateWeight, GENDER_BONUS } from '../utils/mystique';
import { buildFullName } from '../utils/auth';
import { isValidName, isValidPhone } from '../utils/security';
import { AvatarUploader } from '../components/AvatarUploader';
import { deleteMaraboutPhoto } from '../utils/upload';

type Gender = 'homme' | 'femme';

interface Profile {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  country: string | null;
  mother_name: string | null;
  gender: Gender | null;
  religion: string | null;
  language: string | null;
}

interface CreditsInfo {
  balance: number;
  total_purchased: number;
}

interface Subscription {
  expires_at: string;
}

interface Consultation {
  id: string;
  title: string;
  content: unknown;
  page_source: string;
  created_at: string;
}

interface FormationModuleRow {
  module_id: number;
  is_completed: boolean;
  best_score: number;
}

interface PMData {
  nameArabic: string;
  nameW: number;
  motherArabic: string;
  motherW: number;
  PM: number;
  element: string;
  elementColor: string;
}

const RELIGIONS = ['Islam', 'Christianisme', 'Traditionnel africain', 'Autre'];

async function callGeminiRaw(prompt: string): Promise<{ arabic: string }> {
  const json = await callGeminiProxy('gemini-2.0-flash', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
  });
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function translateName(name: string): Promise<{ arabic: string }> {
  const prompt = `Translittère ce nom en arabe SANS harakat.
Retourne UNIQUEMENT du JSON :
{ "arabic": "النص" }
Nom : ${name}`;
  try {
    return await callGeminiRaw(prompt);
  } catch (err) {
    if (err instanceof SyntaxError) return await callGeminiRaw(prompt);
    throw err;
  }
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} à ${hours}:${minutes}`;
}

function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function sourceColor(source: string): { bg: string; text: string } {
  switch (source) {
    case 'destin': return { bg: '#0d2340', text: '#1565c0' };
    case 'secrets': return { bg: '#2a1b3d', text: '#7b1fa2' };
    case 'geomancie': return { bg: '#1E3A8A', text: '#f5c842' };
    case 'reves': return { bg: '#12123a', text: '#5c6bc0' };
    case 'plantes': return { bg: '#1b3a1f', text: '#4caf50' };
    case 'attraper': return { bg: '#3a1b1b', text: '#e53935' };
    case 'compatibilite': return { bg: '#3a1b2e', text: '#e91e63' };
    case 'jours': return { bg: '#3a2410', text: '#ff9800' };
    default: return { bg: '#1a1a2e', text: '#a0aec0' };
  }
}

function ConsultationSummary({ consultation }: { consultation: Consultation }) {
  const c = consultation.content as Record<string, any> | null;
  if (!c) return null;

  const rows: { label: string; value: string }[] = [];
  switch (consultation.page_source) {
    case 'destin':
      if (c.PM !== undefined) rows.push({ label: 'PM', value: String(c.PM) });
      if (c.element) rows.push({ label: 'Élément', value: c.element });
      if (c.divineName?.withYa) rows.push({ label: 'Nom divin', value: c.divineName.withYa });
      break;
    case 'reves':
      if (c.title) rows.push({ label: 'Titre', value: c.title });
      if (c.nature?.type) rows.push({ label: 'Nature', value: c.nature.type });
      if (c.interpretation?.message) rows.push({ label: 'Message', value: c.interpretation.message });
      break;
    case 'geomancie':
      if (c.theme?.dominantFigure) rows.push({ label: 'Figure dominante', value: c.theme.dominantFigure });
      if (c.theme?.dominantHouse) rows.push({ label: 'Maison dominante', value: c.theme.dominantHouse });
      break;
    default:
      break;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <p key={i} className="text-white text-sm">
          <span className="font-bold text-or">{r.label} : </span>
          {r.value}
        </p>
      ))}
      <details className="mt-2">
        <summary className="text-xs cursor-pointer" style={{ color: '#a0aec0' }}>Voir les données complètes</summary>
        <pre className="text-xs mt-2 p-3 rounded overflow-x-auto" style={{ background: '#0a0f2e', color: '#a0aec0' }}>
          {JSON.stringify(c, null, 2)}
        </pre>
      </details>
    </div>
  );
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

export function ProfilPage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [formationModules, setFormationModules] = useState<FormationModuleRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [religion, setReligion] = useState(RELIGIONS[0]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [language, setLanguage] = useState('fr');
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);

  const [pmData, setPmData] = useState<PMData | null>(null);
  const [pmLoading, setPmLoading] = useState(false);

  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('no-user');
      setAuthUser(user);

      const [{ data: profileData }, { data: creditsData }, { data: subData }, { data: consultationsData }, { data: modulesData }] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_credits').select('balance, total_purchased').eq('user_id', user.id).maybeSingle(),
          supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle(),
          supabase.from('saved_rituals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('formation_modules').select('*').eq('user_id', user.id),
        ]);

      setProfile(profileData ?? null);
      setCredits(creditsData ?? { balance: 0, total_purchased: 0 });
      setSubscription(subData ?? null);
      setConsultations(consultationsData ?? []);
      setFormationModules(modulesData ?? []);

      setDisplayName(profileData?.display_name ?? '');
      setFirstName(profileData?.first_name ?? '');
      setLastName(profileData?.last_name ?? '');
      setPhone(profileData?.phone ?? '');
      setCountry(profileData?.country ?? '');
      setMotherName(profileData?.mother_name ?? '');
      setGender(profileData?.gender ?? 'homme');
      setReligion(profileData?.religion ?? RELIGIONS[0]);
      setLanguage(profileData?.language ?? 'fr');

      if (profileData?.first_name && profileData?.mother_name) {
        loadPM(profileData.first_name, profileData.mother_name, profileData.gender ?? 'homme');
      }
    } catch {
      setError('Erreur de chargement du profil.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPM(fName: string, mName: string, g: Gender) {
    const cacheKey = `profil_pm_${fName}_${mName}_${g}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setPmData(JSON.parse(cached));
      return;
    }

    setPmLoading(true);
    try {
      const [nameResult, motherResult] = await Promise.all([translateName(fName), translateName(mName)]);
      const nameW = calculateWeight(nameResult.arabic);
      const motherW = calculateWeight(motherResult.arabic);
      const PM = nameW + motherW + GENDER_BONUS[g];

      const rem = PM % 4;
      const element = rem === 1 ? 'Feu' : rem === 2 ? 'Terre' : rem === 3 ? 'Air' : 'Eau';
      const elementColor = rem === 1 ? '#e53935' : rem === 2 ? '#795548' : rem === 3 ? '#64b5f6' : '#1565c0';

      const newPmData: PMData = { nameArabic: nameResult.arabic, nameW, motherArabic: motherResult.arabic, motherW, PM, element, elementColor };
      sessionStorage.setItem(cacheKey, JSON.stringify(newPmData));
      setPmData(newPmData);
    } catch {
      // Le poids mystique est secondaire sur cette page ; en cas d'échec on laisse simplement le bloc masqué.
    } finally {
      setPmLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!authUser) return;
    setSaveError(null);

    if (!isValidName(firstName)) {
      setSaveError('Prénom invalide (2 à 100 caractères).');
      return;
    }
    if (!isValidName(lastName)) {
      setSaveError('Nom invalide (2 à 100 caractères).');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      setSaveError('Numéro de téléphone invalide.');
      return;
    }
    if (country.trim() && !isValidName(country)) {
      setSaveError('Pays invalide.');
      return;
    }

    setSaving(true);
    try {
      // onConflict non précisé = la contrainte par défaut de la table est
      // utilisée pour résoudre le upsert. Ici c'est correct : `profiles`
      // n'a pas de colonne `id` du tout, sa clé primaire EST `user_id`
      // (voir schema.sql) — d'où l'absence volontaire de `onConflict`.
      const payload = {
        user_id: authUser.id,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        phone: phone.trim() || null,
        country: country.trim() || null,
        mother_name: motherName,
        gender,
        religion,
        updated_at: new Date().toISOString(),
      };
      console.log('payload:', payload);
      const { error } = await supabase.from('profiles').upsert(payload);
      console.log('error:', error);
      if (error) throw error;
      setProfile((prev) => ({
        ...(prev ?? { language: 'fr' } as Profile),
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        phone: phone.trim() || null,
        country: country.trim() || null,
        mother_name: motherName,
        gender,
        religion,
      }));
      setEditMode(false);
      setSaveMessage('Profil mis à jour avec succès');
      setTimeout(() => setSaveMessage(null), 3000);
      if (firstName && motherName) loadPM(firstName, motherName, gender);
    } catch (err) {
      console.error('[ProfilPage] Échec de handleSaveProfile :', err);
      setSaveError('Erreur lors de la sauvegarde. Réessaie dans quelques instants.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setDisplayName(profile?.display_name ?? '');
    setFirstName(profile?.first_name ?? '');
    setLastName(profile?.last_name ?? '');
    setPhone(profile?.phone ?? '');
    setCountry(profile?.country ?? '');
    setMotherName(profile?.mother_name ?? '');
    setGender(profile?.gender ?? 'homme');
    setReligion(profile?.religion ?? RELIGIONS[0]);
    setEditMode(false);
  }

  async function handleSavePreferences() {
    if (!authUser) return;
    setPrefsSaving(true);
    try {
      const payload = {
        user_id: authUser.id,
        language,
        updated_at: new Date().toISOString(),
      };
      console.log('payload:', payload);
      const { error } = await supabase.from('profiles').upsert(payload);
      console.log('error:', error);
      if (error) throw error;
      setPrefsMessage('Préférences enregistrées');
      setTimeout(() => setPrefsMessage(null), 3000);
    } catch (err) {
      console.error('[ProfilPage] Échec de handleSavePreferences :', err);
      setPrefsMessage('Erreur lors de la sauvegarde.');
    } finally {
      setPrefsSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      // Le Storage n'est pas couvert par le ON DELETE CASCADE des tables
      // (voir juste en dessous) : sans cet appel, une photo marabout
      // resterait orpheline dans le bucket "marabout-photos". Sans risque
      // pour un compte non-marabout : le dossier est simplement vide.
      if (authUser) {
        await deleteMaraboutPhoto(authUser.id);
      }

      // Supprime le compte auth.users lui-même via une fonction serveur :
      // toutes les tables applicatives référencent auth.users(id)
      // ON DELETE CASCADE, donc cette seule opération nettoie tout et
      // supprime réellement le compte (pas seulement ses données).
      await supabase.rpc('delete_own_account');
      await supabase.auth.signOut();
      navigate('/auth');
    } finally {
      setDeleting(false);
    }
  }

  const completedModules = formationModules.filter((m) => m.is_completed);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
          <p className="text-or">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <div className="carte rounded-lg text-center" style={{ border: '1px solid #e53935' }}>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={loadAll} className="btn-principal rounded">Réessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-[800px] mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Mon Profil</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>Gère tes informations et préférences</p>

        <Separateur />

        {/* SECTION 3 — CARTE RÉSUMÉ */}
        <div
          className="rounded-lg text-center p-8 max-w-[600px] mx-auto"
          style={{ background: 'linear-gradient(160deg, #0d1545, #0d1545)', border: '1px solid #f5c842' }}
        >
          {authUser && (
            <AvatarUploader
              userId={authUser.id}
              avatarUrl={profile?.avatar_url ?? null}
              fallbackLabel={buildFullName(profile?.first_name, profile?.last_name) || profile?.display_name || authUser.email || '?'}
              onChange={(url) => setProfile((prev) => (prev ? { ...prev, avatar_url: url } : prev))}
            />
          )}
          <p className="text-or font-bold mt-4">{buildFullName(profile?.first_name, profile?.last_name) || profile?.display_name || authUser?.email}</p>
          <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>{authUser?.email}</p>

          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            {subscription ? (
              <>
                <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">Illimité</span>
                <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                  Expire le {formatDateShort(subscription.expires_at)}
                </span>
              </>
            ) : (
              <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">{credits?.balance ?? 0} crédits</span>
            )}
          </div>
          <p className="text-xs mt-3" style={{ color: '#a0aec0' }}>
            Membre depuis {formatDateShort(authUser?.created_at)}
          </p>
        </div>

        <Separateur />

        {/* SECTION 4 — INFORMATIONS PERSONNELLES */}
        <div className="carte rounded-lg" ref={formRef}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-or font-bold">Mes Informations</h2>
            {!editMode && (
              <button onClick={() => setEditMode(true)} className="btn-secondaire rounded text-sm px-3 py-1">
                Modifier
              </button>
            )}
          </div>

          {saveMessage && (
            <div className="rounded-lg p-3 mb-4" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
              <p className="text-green-400 text-sm">{saveMessage}</p>
            </div>
          )}
          {saveError && (
            <div className="rounded-lg p-3 mb-4" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
              <p className="text-red-400 text-sm">{saveError}</p>
            </div>
          )}

          {!editMode ? (
            <div className="flex flex-col gap-3">
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Nom affiché : </span>{profile?.display_name || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Prénom : </span>{profile?.first_name || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Nom : </span>{profile?.last_name || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Téléphone : </span>{profile?.phone || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Pays : </span>{profile?.country || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Prénom de ta mère : </span>{profile?.mother_name || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Sexe : </span>{profile?.gender === 'femme' ? 'Femme' : 'Homme'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Religion : </span>{profile?.religion || '—'}</p>
              <p className="text-white"><span className="font-bold" style={{ color: '#a0aec0' }}>Email : </span>{authUser?.email}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Nom affiché</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Ton prénom</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Ton nom</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Téléphone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 00 00 00 00" className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Pays</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Prénom de ta mère</label>
                <input value={motherName} onChange={(e) => setMotherName(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or" />
              </div>
              <div>
                <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Ton sexe</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setGender('homme')} className={`flex-1 py-2 rounded font-bold transition ${gender === 'homme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}>Homme</button>
                  <button type="button" onClick={() => setGender('femme')} className={`flex-1 py-2 rounded font-bold transition ${gender === 'femme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}>Femme</button>
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Ta religion</label>
                <select value={religion} onChange={(e) => setReligion(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
                  {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Email</label>
                <input value={authUser?.email ?? ''} disabled className="w-full bg-bleu border border-or/10 rounded px-3 py-2 text-white opacity-60 cursor-not-allowed" />
                <p className="text-xs mt-1" style={{ color: '#a0aec0' }}>(non modifiable)</p>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <button onClick={handleSaveProfile} disabled={saving} className="btn-principal rounded w-full md:flex-1 disabled:opacity-50">
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button onClick={handleCancelEdit} className="btn-secondaire rounded w-full md:flex-1">Annuler</button>
              </div>
            </div>
          )}
        </div>

        <Separateur />

        {/* SECTION 5 — MON POIDS MYSTIQUE */}
        <div>
          <h2 className="text-or font-bold mb-5">Mon Poids Mystique</h2>

          {profile?.first_name && profile?.mother_name ? (
            pmLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-or border-t-transparent rounded-full animate-spin" />
                <p className="text-or text-sm">Calcul en cours...</p>
              </div>
            ) : pmData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{profile.first_name}</p>
                    <p className="arabic text-or mt-1">{pmData.nameArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Poids : {pmData.nameW}</p>
                  </div>
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{profile.mother_name}</p>
                    <p className="arabic text-or mt-1">{pmData.motherArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Poids : {pmData.motherW}</p>
                  </div>
                </div>

                <div className="carte rounded-lg text-center mt-5">
                  <p className="text-sm" style={{ color: '#a0aec0' }}>Ton Poids Mystique</p>
                  <p className="text-or font-bold text-[4rem]">{pmData.PM}</p>
                  <p className="font-bold text-[1.5rem]" style={{ color: pmData.elementColor }}>{pmData.element}</p>
                  <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>
                    {pmData.nameW} + {pmData.motherW} + {GENDER_BONUS[gender]} = {pmData.PM}
                  </p>
                  <Link to="/destin" className="btn-principal rounded mt-5 inline-block">Découvrir mon destin complet</Link>
                </div>
              </>
            ) : null
          ) : (
            <div className="rounded-lg p-5 text-center" style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid #f5c842' }}>
              <p className="text-white">
                Complète ton prénom et le prénom de ta mère pour voir ton poids mystique automatiquement.
              </p>
              <button
                onClick={() => { setEditMode(true); formRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="btn-principal rounded mt-4"
              >
                Compléter mon profil
              </button>
            </div>
          )}
        </div>

        <Separateur />

        {/* SECTION 6 — MES PRÉFÉRENCES */}
        <div className="carte rounded-lg">
          <h2 className="text-or font-bold mb-5">Mes Préférences</h2>
          <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Langue</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or">
            <option value="fr">Français</option>
            <option value="en" disabled>English (bientôt disponible)</option>
            <option value="ar" disabled>العربية (bientôt disponible)</option>
          </select>
          {prefsMessage && <p className="text-sm mt-2 text-green-400">{prefsMessage}</p>}
          <button onClick={handleSavePreferences} disabled={prefsSaving} className="btn-principal rounded mt-4 disabled:opacity-50">
            {prefsSaving ? 'Enregistrement...' : 'Enregistrer les préférences'}
          </button>
        </div>

        <Separateur />

        {/* SECTION 7 — MES DERNIÈRES CONSULTATIONS */}
        <div>
          <h2 className="text-or font-bold mb-5">Mes Dernières Consultations</h2>
          {consultations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {consultations.map((c) => {
                const colors = sourceColor(c.page_source);
                return (
                  <div key={c.id} className="rounded-lg p-4" style={{ background: '#0d1545' }}>
                    <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: colors.bg, color: colors.text }}>
                      {c.page_source}
                    </span>
                    <p className="text-white font-bold mt-2">{c.title}</p>
                    <p className="text-xs mt-1" style={{ color: '#a0aec0' }}>{formatDate(c.created_at)}</p>
                    <button onClick={() => setSelectedConsultation(c)} className="btn-secondaire rounded text-sm px-3 py-1 mt-3">
                      Voir cette consultation
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg p-5 text-center" style={{ background: '#0d1545' }}>
              <p className="text-white">Tu n'as pas encore de consultations sauvegardées.</p>
              <Link to="/destin" className="btn-principal rounded mt-4 inline-block">Commencer une consultation</Link>
            </div>
          )}
        </div>

        <Separateur />

        {/* SECTION 8 — MA PROGRESSION FORMATION */}
        <div>
          <h2 className="text-or font-bold mb-5">Ma Progression dans la Formation</h2>
          <p className="text-white text-sm mb-2">{completedModules.length} / 9 modules</p>
          <div className="w-full rounded-full overflow-hidden mb-5" style={{ height: 12, background: '#1a1a2e' }}>
            <div className="h-full transition-all" style={{ width: `${(completedModules.length / 9) * 100}%`, background: '#f5c842' }} />
          </div>

          {completedModules.length > 0 ? (
            <>
              <p className="font-bold mb-3" style={{ color: '#a0aec0' }}>Modules complétés :</p>
              <div className="flex flex-col gap-2 mb-5">
                {completedModules.map((m) => (
                  <span key={m.module_id} className="px-3 py-2 rounded-full text-sm font-bold w-fit" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                    Module {m.module_id} — Score : {m.best_score}/100
                  </span>
                ))}
              </div>
              <Link to="/formation" className="btn-principal rounded inline-block">Continuer ma formation</Link>
            </>
          ) : (
            <>
              <p className="text-white mb-4">Tu n'as pas encore commencé la formation.</p>
              <Link to="/formation" className="btn-principal rounded inline-block">Commencer la formation</Link>
            </>
          )}
        </div>

        <Separateur />

        {/* SECTION 9 — PARAMÈTRES DU COMPTE */}
        <div className="carte rounded-lg flex flex-col gap-2">
          <h2 className="text-or font-bold mb-3">Paramètres du Compte</h2>
          <p className="text-white text-sm">Email : {authUser?.email}</p>
          <p className="text-white text-sm">Membre depuis : {formatDate(authUser?.created_at)}</p>
          <p className="text-white text-sm">Dernier accès : {formatDate(authUser?.last_sign_in_at)}</p>
          <p className="text-white text-sm">Crédits achetés au total : {credits?.total_purchased ?? 0}</p>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => setShowSignOutModal(true)} className="rounded px-6 py-2 font-bold" style={{ border: '1px solid #e53935', color: '#e53935', background: 'transparent' }}>
            Se déconnecter
          </button>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => setShowDeleteModal(true)} className="text-red-400 text-sm underline">
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* MODAL CONSULTATION */}
      {selectedConsultation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#0d1545', border: '1px solid #f5c842', borderRadius: '8px', padding: '28px', maxWidth: '500px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className="text-or font-bold text-lg mb-4">{selectedConsultation.title}</h2>
            <ConsultationSummary consultation={selectedConsultation} />
            <button onClick={() => setSelectedConsultation(null)} className="btn-secondaire rounded w-full mt-5">Fermer</button>
          </div>
        </div>
      )}

      {/* MODAL DÉCONNEXION */}
      {showSignOutModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#0d1545', border: '1px solid #f5c842', borderRadius: '8px', padding: '28px', maxWidth: '400px', width: '100%' }} className="text-center">
            <p className="text-white mb-5">Es-tu sûr de vouloir te déconnecter ?</p>
            <div className="flex flex-col gap-3">
              <button onClick={handleSignOut} className="rounded py-2 font-bold" style={{ background: '#e53935', color: 'white' }}>Confirmer</button>
              <button onClick={() => setShowSignOutModal(false)} className="btn-secondaire rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUPPRESSION COMPTE */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#0d1545', border: '1px solid #e53935', borderRadius: '8px', padding: '28px', maxWidth: '450px', width: '100%' }}>
            <h2 className="text-red-400 font-bold text-lg mb-3">Suppression du compte</h2>
            <p className="text-white text-sm mb-4">
              Cette action est irréversible. Toutes tes données seront supprimées définitivement : profil, crédits, consultations et progression.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Tape DELETE pour confirmer"
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or mb-4"
            />
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="rounded py-2 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#e53935', color: 'white' }}
              >
                {deleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }} className="btn-secondaire rounded">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
