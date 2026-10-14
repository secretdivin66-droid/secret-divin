import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';
import { calculateWeight, GENDER_BONUS } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';

type Gender = 'homme' | 'femme';

const OBJECTIFS = [
  'Mariage',
  'Amour / Rapprochement',
  'Travail / Emploi',
  'Argent / Richesse',
  'Voyage',
  'Crédit / Prêt',
  'Assistance / Aide',
  'Réconciliation',
  'Protection',
  'Autre',
];

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface DivineNameInfo {
  arabic: string;
  withYa: string;
  transliteration: string;
  meaning: string;
}

interface AttraperData {
  divineNames: {
    name1: DivineNameInfo;
    name2: DivineNameInfo;
    combined: string;
    reason: string;
  };
  verse: { arabic: string; arabicWithHarakat: string; surah: string; ayah: string; meaning: string; reason: string };
  invocation: {
    arabicNoHarakat: string;
    arabicWithHarakat: string;
    meaning: string;
  };
  talisman: {
    // Restreint à 3x3/4x4 (voir RÈGLES TALISMAN) : ce sont les deux seuls
    // formats pour lesquels l'étape "écrire le carré" a une règle de
    // répétition définie (3 fois / 4 fois).
    squareType: string;
    // Nombre de jours du lavage (Étape 7), contraint entre 7 et 14 —
    // demandé en nombre plutôt qu'en texte libre pour un affichage fiable
    // et pour que le Zikr quotidien (même durée) puisse le réutiliser
    // directement sans le reparser.
    ritualDurationDays: number;
  };
  // Juste les noms, intégrés en texte dans l'Étape 6 — plus de cartes
  // dédiées, donc plus besoin du nom scientifique/bambara/lien Wikipedia.
  plants: { nomFrancais: string }[];
  sacrifice: {
    isRecommended: boolean;
    reason: string;
    offerings: { item: string; quantity: string; meaning: string }[];
    recipient: string;
    timing: string;
    instructions: string;
  };
  warnings: string[];
  conclusion: string;
}

interface CachedResult {
  data: AttraperData;
  PMuser: number;
  PMtarget: number;
  userNameArabic: string;
  userMotherArabic: string;
  targetNameArabic: string;
  targetMotherArabic: string;
  // Poids de l'invocation (méthode de calcul inchangée : calculateWeight
  // sur invocation.arabicNoHarakat) — ne sert plus à générer un carré
  // localement, mais à le transmettre tel quel à la fonctionnalité Carré
  // Magique via l'URL, pour que l'utilisateur y retrouve EXACTEMENT le
  // même carré qu'avant (même nombre, même somme magique).
  invocationWeight: number;
  squareSize: number;
}

async function callGeminiRaw(
  model: string,
  prompt: string,
  generationConfig: { temperature: number; maxOutputTokens: number }
): Promise<any> {
  const json = await callGeminiProxy(model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  });
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function callGeminiWithRetry(
  model: string,
  prompt: string,
  generationConfig: { temperature: number; maxOutputTokens: number }
): Promise<any> {
  try {
    return await callGeminiRaw(model, prompt, generationConfig);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return await callGeminiRaw(model, prompt, generationConfig);
    }
    throw err;
  }
}

async function translateName(name: string): Promise<GeminiNameResult> {
  const prompt = `Translittère ce nom en arabe SANS harakat.
Retourne UNIQUEMENT du JSON :
{ "arabic": "النص", "weight": 0 }
Nom : ${name}`;
  return callGeminiWithRetry('gemini-3.1-flash-lite', prompt, { temperature: 0.1, maxOutputTokens: 200 });
}

function buildAttraperPrompt(params: {
  userName: string; userMother: string; userNameArabic: string; userMotherArabic: string; userGender: Gender; PMuser: number;
  targetName: string; targetMother: string; targetNameArabic: string; targetMotherArabic: string; targetGender: Gender; PMtarget: number;
  objectif: string;
}): string {
  const { userName, userMother, userNameArabic, userMotherArabic, userGender, PMuser, targetName, targetMother, targetNameArabic, targetMotherArabic, targetGender, PMtarget, objectif } = params;
  return `Tu es un maître de la mystique islamique ouest-africaine et de la science des lettres.

Utilisateur :
Prénom : ${userName} / Mère : ${userMother}
Arabe : ${userNameArabic} / ${userMotherArabic}
Sexe : ${userGender} / PM : ${PMuser}

Cible :
Prénom : ${targetName} / Mère : ${targetMother}
Arabe : ${targetNameArabic} / ${targetMotherArabic}
Sexe : ${targetGender} / PM : ${PMtarget}

Objectif : ${objectif}

Utilise ces valeurs Abjad :
ا=1 ب=2 ج=3 د=4 ه=5 ة=5 و=6 ز=7 ح=8 ط=9
ي=10 ك=20 ل=30 م=40 ن=50 ص=60 ع=70 ف=80
ض=90 ق=100 ر=200 س=300 ت=400 ث=500 خ=600
ذ=700 ظ=800 غ=900 ش=1000

LIMITE DE LONGUEUR : la somme de tous les textes du JSON (toutes les valeurs confondues) ne doit jamais dépasser 450 mots au total. Reste concis sur chaque champ tout en gardant de la profondeur.

Retourne UNIQUEMENT du JSON valide :

{
  "divineNames": {
    "name1": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification" },
    "name2": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification" },
    "combined": "يا nom1 يا nom2",
    "reason": "Pourquoi ces 2 noms divins pour cet objectif et ces 2 personnes."
  },
  "verse": {
    "arabic": "verset SANS harakat",
    "arabicWithHarakat": "même verset AVEC tous les harakat",
    "surah": "nom sourate français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour cet objectif."
  },
  "invocation": {
    "arabicNoHarakat": "invocation complète SANS harakat contenant : يا nom1 + يا nom2 + prénom arabe utilisateur + ibn/bint + prénom arabe mère utilisateur + prénom arabe cible + ibn/bint + prénom arabe mère cible + verset",
    "arabicWithHarakat": "même invocation AVEC tous les harakat",
    "meaning": "traduction française complète de l'invocation"
  },
  "talisman": {
    "squareType": "3x3 ou 4x4",
    "ritualDurationDays": 7
  },
  "plants": [
    { "nomFrancais": "nom français" },
    { "nomFrancais": "deuxième plante" }
  ],
  "sacrifice": {
    "isRecommended": true,
    "reason": "Pourquoi ce sacrifice accompagne ce rituel.",
    "offerings": [
      { "item": "offrande 1", "quantity": "nombre", "meaning": "signification" },
      { "item": "offrande 2", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner",
    "timing": "Quel jour et heure",
    "instructions": "Instructions complètes du sacrifice."
  },
  "warnings": ["Précaution importante 1","Précaution importante 2"],
  "conclusion": "Message final chaleureux adressé à ${userName}. 1 phrase encourageantes. Termine par InchaAllah."
}

RÈGLES NOMS DIVINS :
TOUJOURS sans ال. TOUJOURS avec يا.
Correct : يا ودود يا جامع
Incorrect : يا الودود يا الجامع

RÈGLES PLANTES :
2 à 3 plantes africaines réelles, uniquement leur nom français (pas de
nom scientifique ni de lien ici, ces plantes sont juste citées dans le
texte de l'étape de préparation du mélange).

RÈGLES TALISMAN :
"squareType" doit être EXACTEMENT "3x3" ou "4x4" (jamais 5x5 ni un autre
format) : ce sont les deux seuls formats utilisés par cette page.
"ritualDurationDays" doit être un nombre entier entre 7 et 14 inclus.`;
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

function FadeIn({ children }: { children: ReactNode }) {
  return <div className="transition-opacity duration-700 opacity-100">{children}</div>;
}

function BlocTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-or font-bold text-center mb-4">{children}</h2>;
}

export function AttraperPage() {
  const [userName, setUserName] = useState('');
  const [userMother, setUserMother] = useState('');
  const [userGender, setUserGender] = useState<Gender>('homme');

  const [targetName, setTargetName] = useState('');
  const [targetMother, setTargetMother] = useState('');
  const [targetGender, setTargetGender] = useState<Gender>('homme');

  const [objective, setObjective] = useState(OBJECTIFS[0]);
  const [customObjective, setCustomObjective] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const objectif = objective === 'Autre' ? customObjective : objective;

  const isDisabled =
    !userName.trim() ||
    !userMother.trim() ||
    !targetName.trim() ||
    !targetMother.trim() ||
    (objective === 'Autre' && !customObjective.trim());

  async function handleGenerate() {
    if (isDisabled) return;
    setError(null);

    const cacheKey = `attraper_${userName}_${userMother}_${targetName}_${targetMother}_${objectif}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setResult(JSON.parse(cached));
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('no-user');

      const isAdmin = await isAdminUser(user.id);

      const { data: credits } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      const balance = credits?.balance ?? 0;

      if (!isAdmin && balance < 2) {
        setModalBalance(balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      const [userNameResult, userMotherResult, targetNameResult, targetMotherResult] = await Promise.all([
        translateName(userName),
        translateName(userMother),
        translateName(targetName),
        translateName(targetMother),
      ]);

      const userNameW = calculateWeight(userNameResult.arabic);
      const userMotherW = calculateWeight(userMotherResult.arabic);
      const PMuser = userNameW + userMotherW + GENDER_BONUS[userGender];

      const targetNameW = calculateWeight(targetNameResult.arabic);
      const targetMotherW = calculateWeight(targetMotherResult.arabic);
      const PMtarget = targetNameW + targetMotherW + GENDER_BONUS[targetGender];

      const prompt = buildAttraperPrompt({
        userName, userMother, userNameArabic: userNameResult.arabic, userMotherArabic: userMotherResult.arabic, userGender, PMuser,
        targetName, targetMother, targetNameArabic: targetNameResult.arabic, targetMotherArabic: targetMotherResult.arabic, targetGender, PMtarget,
        objectif,
      });

      const data: AttraperData = await callGeminiWithRetry('gemini-3.1-flash-lite', prompt, {
        temperature: 0.7,
        maxOutputTokens: 2600,
      });

      // Carré non généré ici : la page renvoie vers la fonctionnalité Carré
      // Magique (squareSize sert à présélectionner le bon format là-bas).
      const squareSize = data.talisman.squareType === '4x4' ? 4 : 3;
      const invocationWeight = calculateWeight(data.invocation.arabicNoHarakat);

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'attraper',
            p_description: 'Talisman attraper — ' + userName + ' → ' + targetName,
          })
          .single();
        const spend = spendData as SpendCreditsResult | null;

        if (spendError || !spend?.success) {
          setModalBalance(spend?.balance ?? balance);
          setShowCreditModal(true);
          setLoading(false);
          return;
        }
      }

      const newResult: CachedResult = {
        data,
        PMuser,
        PMtarget,
        userNameArabic: userNameResult.arabic,
        userMotherArabic: userMotherResult.arabic,
        targetNameArabic: targetNameResult.arabic,
        targetMotherArabic: targetMotherResult.arabic,
        invocationWeight,
        squareSize,
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Talisman — ' + userName + ' → ' + targetName,
        content: data,
        page_source: 'attraper',
      });
    } catch {
      setError('Une erreur s\'est produite. Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setUserName('');
    setUserMother('');
    setUserGender('homme');
    setTargetName('');
    setTargetMother('');
    setTargetGender('homme');
    setObjective(OBJECTIFS[0]);
    setCustomObjective('');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('attraper-content');
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: '#0a0f2e' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`talisman-${userName}-${targetName}-secretdivin.pdf`);
  }

  function GenderToggle({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
    return (
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange('homme')}
          className={`flex-1 py-2 rounded font-bold transition ${
            value === 'homme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
          }`}
        >
          Homme
        </button>
        <button
          type="button"
          onClick={() => onChange('femme')}
          className={`flex-1 py-2 rounded font-bold transition ${
            value === 'femme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
          }`}
        >
          Femme
        </button>
      </div>
    );
  }

  // Nombre de répétitions des noms divins à l'écriture (Étape 3) = somme des
  // deux poids mystiques, tel que demandé — une simple addition de valeurs
  // déjà calculées, pas une nouvelle méthode de calcul.
  const combinedPM = result ? result.PMuser + result.PMtarget : 0;
  // Durée du lavage (Étape 7 et Zikr quotidien, qui doit couvrir exactement
  // la même période) : on garde le nombre calculé par le système s'il
  // existe, sinon on retombe sur la plage "7 à 14" demandée.
  const ritualDays = result?.data.talisman.ritualDurationDays;
  const ritualDaysText = ritualDays ? String(ritualDays) : '7 à 14';
  const plantsListText = result ? result.data.plants.map((p) => p.nomFrancais).join(', ') : '';

  // Zikr quotidien en 7 étapes fixes (formules/répétitions/horaires déjà
  // standards du système, voir Jours de Naissance pour le même principe) —
  // les étapes 4/5/6 réutilisent directement les Noms Divins/Verset/
  // Invocation déjà générés plus haut au lieu de demander à Gemini de se
  // recopier lui-même : c'est cette auto-référence qui causait l'affichage
  // brut de "invocation.arabicWithHarakat" à l'écran.
  const zikrSteps = result
    ? [
        { order: 1, title: 'Bismillah', arabic: 'بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ', repetitions: 1, note: 'Toujours commencer par Bismillah.' },
        { order: 2, title: 'Astaghfirullah', arabic: 'أَسْتَغْفِرُ اللهَ', repetitions: 100, note: null as string | null },
        { order: 3, title: 'Salat sur le Prophète', arabic: 'اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ', repetitions: 100, note: null as string | null },
        { order: 4, title: 'Les 2 Noms Divins', arabic: result.data.divineNames.combined, repetitions: 99, note: 'يا sans ال obligatoire. Jamais يا الودود.' },
        { order: 5, title: 'Le Verset Coranique', arabic: result.data.verse.arabicWithHarakat || result.data.verse.arabic, repetitions: 7, note: null as string | null },
        { order: 6, title: "L'Invocation Complète", arabic: result.data.invocation.arabicWithHarakat, repetitions: 41, note: `Réciter lentement et avec concentration. Penser à ${targetName} pendant la récitation.` },
        { order: 7, title: 'Clôture Salat', arabic: 'اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ', repetitions: 3, note: 'Terminer par Al-Hamdulillah.' },
      ]
    : [];

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Pour Attraper</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Génère ton talisman personnalisé basé sur
          <br />
          les noms arabes des deux personnes pour
          <br />
          atteindre ton objectif
        </p>

        <Separateur />

        <div className="flex justify-center mb-4">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="carte rounded-lg flex flex-col gap-4">
                <p className="text-or font-bold text-center">Toi</p>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Ton prénom</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Prénom de ta mère</label>
                  <input
                    type="text"
                    value={userMother}
                    onChange={(e) => setUserMother(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Ton sexe</label>
                  <GenderToggle value={userGender} onChange={setUserGender} />
                </div>
              </div>

              <div className="carte rounded-lg flex flex-col gap-4">
                <p className="text-or font-bold text-center">Ta Cible</p>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Prénom de ta cible</label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Prénom de sa mère</label>
                  <input
                    type="text"
                    value={targetMother}
                    onChange={(e) => setTargetMother(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Son sexe</label>
                  <GenderToggle value={targetGender} onChange={setTargetGender} />
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>Ton objectif</label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {OBJECTIFS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {objective === 'Autre' && (
                <input
                  type="text"
                  value={customObjective}
                  onChange={(e) => setCustomObjective(e.target.value)}
                  placeholder="Décris ton objectif"
                  className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or mt-3"
                />
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              GÉNÉRER MON TALISMAN
            </button>
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Le talisman se prépare pour toi...</p>
          </div>
        )}

        {error && (
          <div className="carte rounded-lg mt-4 text-center" style={{ border: '1px solid #e53935' }}>
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={handleGenerate} className="btn-principal rounded">
              Réessayer
            </button>
          </div>
        )}

        {result && (
          <FadeIn>
            <div id="attraper-content">
              <Separateur />

              {/* BLOC 1 — Résumé Profils */}
              <div>
                <p className="text-or font-bold text-[2rem] text-center">Ton Talisman Personnalisé</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{userName}</p>
                    <p className="arabic text-or mt-1">{result.userNameArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Mère : {userMother}</p>
                    <p className="text-or font-bold mt-2">PM : {result.PMuser}</p>
                  </div>
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{targetName}</p>
                    <p className="arabic text-or mt-1">{result.targetNameArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Mère : {targetMother}</p>
                    <p className="text-or font-bold mt-2">PM : {result.PMtarget}</p>
                  </div>
                </div>
                <div className="flex justify-center mt-5">
                  <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">{objectif}</span>
                </div>
              </div>

              <Separateur />

              {/* BLOC 2 — Les 2 Noms Divins */}
              <div>
                <BlocTitle>Les 2 Noms Divins</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="carte rounded-lg text-center">
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name1.withYa}</p>
                    <p className="text-white mt-2">
                      {result.data.divineNames.name1.transliteration} — {result.data.divineNames.name1.meaning}
                    </p>
                  </div>
                  <div className="carte rounded-lg text-center">
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name2.withYa}</p>
                    <p className="text-white mt-2">
                      {result.data.divineNames.name2.transliteration} — {result.data.divineNames.name2.meaning}
                    </p>
                  </div>
                </div>
                <div className="text-center mt-4">
                  <p className="arabic text-or text-[1.8em]">{result.data.divineNames.combined}</p>
                  <p className="text-white italic mt-2">{result.data.divineNames.reason}</p>
                  <div className="mt-3 flex justify-center">
                    <AudioButton text={result.data.divineNames.combined} label="Écouter les noms divins" />
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Verset Coranique */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Verset Coranique</BlocTitle>
                <p className="arabic text-or text-[1.8em]">{result.data.verse.arabicWithHarakat || result.data.verse.arabic}</p>
                <p className="mt-3 text-white">
                  Sourate {result.data.verse.surah} — Verset {result.data.verse.ayah}
                </p>
                <p className="italic mt-2" style={{ color: '#a0aec0' }}>{result.data.verse.meaning}</p>
                <p className="mt-2 text-white">{result.data.verse.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.verse.arabic} label="Écouter le verset" />
                </div>
              </div>

              <Separateur />

              {/* BLOC — Comment écrire ton talisman : 7 étapes fixes.
                  Le carré magique (Étape 5) n'est plus généré ni affiché ici
                  — on renvoie vers la fonctionnalité Carré Magique, avec le
                  même poids (invocationWeight, calcul inchangé) et le même
                  format (squareSize) pré-remplis via l'URL, pour que
                  l'utilisateur y retrouve exactement le même carré. */}
              <div className="carte rounded-lg">
                <BlocTitle>Comment écrire ton talisman</BlocTitle>
                <div className="flex flex-col gap-5 text-left">
                  <div>
                    <p className="text-white font-bold">Étape 1 — Bismillah</p>
                    <p className="arabic text-or text-[1.6em] mt-1">بسم الله الرحمن الرحيم</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris Bismillah 1 fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 2 — Salat</p>
                    <p className="arabic text-or text-[1.6em] mt-1">اللهم صل على سيدنا محمد</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris la salat 1 fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 3 — Noms divins</p>
                    <p className="arabic text-or text-[1.6em] mt-1">{result.data.divineNames.combined}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris ces noms divins {combinedPM} fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 4 — Verset coranique</p>
                    <p className="arabic text-or text-[1.6em] mt-1">{result.data.verse.arabicWithHarakat || result.data.verse.arabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris ce verset 14 fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 5 — Carré magique</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                      Écris le carré magique {result.data.talisman.squareType} — {result.squareSize} fois.
                    </p>
                    <Link
                      to={`/carres-magiques?pm=${result.invocationWeight}&size=${result.squareSize}`}
                      className="btn-secondaire rounded inline-block mt-2"
                    >
                      Générer mon carré magique ({result.data.talisman.squareType})
                    </Link>
                    <p className="text-sm mt-3 text-white">
                      Lave l'écriture avec de l'eau propre, puis conserve-la dans un récipient propre.
                    </p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 6 — Préparer le mélange</p>
                    <p className="text-sm mt-1 text-white">
                      Choisis un parfum sans alcool. Fais bouillir les plantes recommandées pour ton talisman
                      ({plantsListText}), puis prépare une infusion. Mélange cette infusion au parfum et ajoute le
                      talisman que tu as écrit.
                    </p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 7 — Lavage</p>
                    <p className="text-sm mt-1 text-white">
                      Se laver avec le mélange préparé pendant {ritualDaysText} jours consécutifs, sans interruption.
                    </p>
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC — Zikr Quotidien : reprend directement les Noms
                  Divins/Verset/Invocation déjà générés plus haut (voir
                  zikrSteps) ; la durée reste identique à celle du lavage
                  ci-dessus (ritualDaysText), une seule source de vérité. */}
              <div className="carte rounded-lg">
                <BlocTitle>Zikr Quotidien</BlocTitle>
                <p className="text-center text-white text-sm">
                  Meilleur moment : Après Fajr ou avant de dormir — Durée : {ritualDaysText} jours
                </p>

                <div className="flex flex-col gap-4 mt-5">
                  {zikrSteps.map((step) => (
                    <div key={step.order} className="rounded-lg p-4" style={{ background: '#0a0f2e', border: '1px solid rgba(245,200,66,0.2)' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-7 h-7 shrink-0 rounded-full bg-or text-white font-bold flex items-center justify-center text-sm">
                          {step.order}
                        </span>
                        <p className="text-or font-bold">{step.title}</p>
                      </div>
                      <p className="arabic text-or text-[1.5em] text-center">{step.arabic}</p>
                      <div className="flex justify-center mt-3">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                          {step.repetitions} fois
                        </span>
                      </div>
                      {step.note && (
                        <p className="text-sm italic mt-2 text-center" style={{ color: '#a0aec0' }}>{step.note}</p>
                      )}
                      <div className="mt-3 flex justify-center">
                        <AudioButton text={step.arabic} label="Écouter" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5" style={{ border: '1px solid #f5c842' }}>
                  <p className="text-white text-sm">Ne pas interrompre le rituel en cours de route. Faire le zikr chaque jour sans interruption.</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC — Invocation Personnalisée (déplacée après le Zikr) */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Invocation Personnalisée</BlocTitle>
                <p className="text-sm" style={{ color: '#a0aec0' }}>Version pour écrire (sans harakat)</p>
                <p className="arabic text-or text-[1.5em] mt-2">{result.data.invocation.arabicNoHarakat}</p>
                <p className="italic mt-3 text-white">{result.data.invocation.meaning}</p>
                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    Poids de l'invocation : {result.invocationWeight}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    Carré : {result.data.talisman.squareType}
                  </span>
                </div>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.invocation.arabicWithHarakat} label="Écouter l'invocation" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 9 — Sacrifice */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifice</BlocTitle>
                <p className="text-white text-center">{result.data.sacrifice.reason}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {result.data.sacrifice.offerings.map((o, i) => (
                    <p key={i} className="text-sm text-white">
                      {o.item} — {o.quantity} → {o.meaning}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-sm" style={{ color: '#a0aec0' }}>À donner à : {result.data.sacrifice.recipient}</p>
                <p className="text-sm" style={{ color: '#a0aec0' }}>Moment : {result.data.sacrifice.timing}</p>
                <p className="mt-3 text-white">{result.data.sacrifice.instructions}</p>
              </div>

              {/* BLOC 10 — Avertissements */}
              {result.data.warnings.length > 0 && (
                <>
                  <Separateur />
                  <div className="flex flex-col gap-2">
                    {result.data.warnings.map((w, i) => (
                      <div key={i} className="rounded-lg p-4" style={{ background: '#3a2410', border: '1px solid #ff9800' }}>
                        <p className="text-orange-300 text-sm">✦ {w}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separateur />

              {/* BLOC 11 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger mon talisman en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Créer un nouveau talisman
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Attraper la Chance" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
