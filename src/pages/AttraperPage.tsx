import { useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';
import { calculateWeight, GENDER_BONUS, generateSquare, LAYOUTS, toArabicIndic } from '../utils/mystique';
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

const CELL_SIZES: Record<number, number> = { 3: 64, 4: 56, 5: 48 };

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

interface ZikrStep {
  order: number;
  title: string;
  arabic: string;
  arabicWithHarakat: string;
  repetitions: number;
  note: string | null;
}

interface AttraperData {
  divineNames: {
    name1: DivineNameInfo;
    name2: DivineNameInfo;
    combined: string;
    reason: string;
  };
  verse: { arabic: string; surah: string; ayah: string; meaning: string; reason: string };
  invocation: {
    arabicNoHarakat: string;
    arabicWithHarakat: string;
    meaning: string;
    repetitions: number;
  };
  talisman: {
    squareType: string;
    choiceReason: string;
    writingOrder: string[];
    bathInstructions: string;
    ritualDuration: string;
    bestDayToStart: string;
  };
  zikr: {
    steps: ZikrStep[];
    bestTime: string;
    duration: string;
    important: string;
  };
  plants: { nomFrancais: string; nomBambara: string; nomScientifique: string; lienWikipedia: string; partie: string; preparation: string }[];
  perfume: { name: string; description: string; availability: string; usage: string };
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
  invocationWeight: number;
  cells: number[];
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
  return callGeminiWithRetry('gemini-2.0-flash', prompt, { temperature: 0.1, maxOutputTokens: 200 });
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
    "surah": "nom sourate français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour cet objectif."
  },
  "invocation": {
    "arabicNoHarakat": "invocation complète SANS harakat contenant : يا nom1 + يا nom2 + prénom arabe utilisateur + ibn/bint + prénom arabe mère utilisateur + prénom arabe cible + ibn/bint + prénom arabe mère cible + verset",
    "arabicWithHarakat": "même invocation AVEC tous les harakat pour le zikr quotidien",
    "meaning": "traduction française complète de l'invocation",
    "repetitions": 41
  },
  "talisman": {
    "squareType": "3x3 ou 4x4 ou 5x5",
    "choiceReason": "Pourquoi ce type de carré pour cet objectif et ces PM.",
    "writingOrder": ["Bismillah en haut de la tablette","Salat sur le Prophète","Les 2 noms divins avec يا","Le verset coranique","Le carré magique","Les noms arabes des 2 personnes"],
    "bathInstructions": "Instructions complètes pour laver la tablette et préparer le bain rituel.",
    "ritualDuration": "7 jours",
    "bestDayToStart": "Quel jour commencer ce rituel"
  },
  "zikr": {
    "steps": [
      { "order": 1, "title": "Bismillah", "arabic": "بسم الله الرحمن الرحيم", "arabicWithHarakat": "بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ", "repetitions": 1, "note": "Toujours commencer par Bismillah" },
      { "order": 2, "title": "Astaghfirullah", "arabic": "أستغفر الله", "arabicWithHarakat": "أَسْتَغْفِرُ اللهَ", "repetitions": 100, "note": null },
      { "order": 3, "title": "Salat sur le Prophète", "arabic": "اللهم صل على سيدنا محمد", "arabicWithHarakat": "اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ", "repetitions": 100, "note": null },
      { "order": 4, "title": "Les 2 Noms Divins", "arabic": "[divineNames.combined]", "arabicWithHarakat": "[avec harakat complets]", "repetitions": 99, "note": "يا sans ال obligatoire. Jamais يا الودود." },
      { "order": 5, "title": "Le Verset Coranique", "arabic": "[verse.arabic]", "arabicWithHarakat": "[verset avec harakat]", "repetitions": 7, "note": null },
      { "order": 6, "title": "L'Invocation Complète", "arabic": "[invocation.arabicWithHarakat]", "arabicWithHarakat": "[invocation.arabicWithHarakat]", "repetitions": 41, "note": "Réciter lentement et avec concentration. Penser à ${targetName} pendant la récitation." },
      { "order": 7, "title": "Clôture Salat", "arabic": "اللهم صل على سيدنا محمد", "arabicWithHarakat": "اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ", "repetitions": 3, "note": "Terminer par Al-Hamdulillah." }
    ],
    "bestTime": "Après Fajr ou avant de dormir",
    "duration": "[talisman.ritualDuration]",
    "important": "Ne pas interrompre le rituel en cours de route. Faire le zikr chaque jour sans interruption."
  },
  "plants": [
    { "nomFrancais": "nom français", "nomBambara": "nom bambara", "nomScientifique": "nom scientifique exact", "lienWikipedia": "https://fr.wikipedia.org/wiki/...", "partie": "feuilles/écorce/racines", "preparation": "Comment préparer et utiliser avec le bain rituel." },
    { "nomFrancais": "deuxième plante", "nomBambara": "nom bambara", "nomScientifique": "nom scientifique exact", "lienWikipedia": "https://fr.wikipedia.org/wiki/...", "partie": "partie utilisée", "preparation": "Instructions de préparation." }
  ],
  "perfume": {
    "name": "nom du parfum",
    "description": "Pourquoi ce parfum pour cet objectif.",
    "availability": "Où trouver en Afrique de l'Ouest.",
    "usage": "Comment utiliser ce parfum dans le rituel."
  },
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
  "conclusion": "Message final chaleureux adressé à ${userName}. 3 phrases encourageantes. Termine par InchaAllah."
}

RÈGLES NOMS DIVINS :
TOUJOURS sans ال. TOUJOURS avec يا.
Correct : يا ودود يا جامع
Incorrect : يا الودود يا الجامع

RÈGLES PLANTES :
2 à 3 plantes africaines réelles.
Nom scientifique exact. Lien Wikipedia valide.`;
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

function TalismanGrid({ values, size, variant }: { values: (number | string)[]; size: number; variant: 'base' | 'french' | 'arabic' }) {
  const cellClass = variant === 'arabic' ? 'font-bold arabic' : 'font-bold';
  const cellStyle: CSSProperties =
    variant === 'base'
      ? { background: '#f5f5f5', color: '#1a237e', border: '1px solid #e0e0e0' }
      : variant === 'french'
      ? { background: '#ffffff', color: '#1a237e', border: '2px solid #2563EB' }
      : { background: '#1a237e', color: '#2563EB', direction: 'rtl' };

  return (
    <div className="att-grid mx-auto" style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, auto)`, gap: '2px', justifyContent: 'center' }}>
      {values.map((v, i) => (
        <div key={i} className={`att-cell flex items-center justify-center ${cellClass}`} style={{ ...cellStyle, fontSize: '0.9em' }}>
          {v}
        </div>
      ))}
    </div>
  );
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

      const data: AttraperData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.7,
        maxOutputTokens: 3000,
      });

      const squareSize = data.talisman.squareType === '3x3' ? 3 : data.talisman.squareType === '4x4' ? 4 : 5;
      const invocationWeight = calculateWeight(data.invocation.arabicNoHarakat);
      const cells = generateSquare(invocationWeight, squareSize);

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
        cells,
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
    const canvas = await html2canvas(el, { backgroundColor: '#0a0e2e' });
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

  const desktopCellSize = CELL_SIZES[result?.squareSize ?? 3];

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <style>{`
        .att-cell { width: 40px; height: 40px; }
        @media (min-width: 768px) {
          .att-cell { width: ${desktopCellSize}px; height: ${desktopCellSize}px; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Pour Attraper</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Génère ton talisman personnalisé basé sur
          <br />
          les noms arabes des deux personnes pour
          <br />
          atteindre ton objectif
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
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
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Ton prénom</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de ta mère</label>
                  <input
                    type="text"
                    value={userMother}
                    onChange={(e) => setUserMother(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Ton sexe</label>
                  <GenderToggle value={userGender} onChange={setUserGender} />
                </div>
              </div>

              <div className="carte rounded-lg flex flex-col gap-4">
                <p className="text-or font-bold text-center">Ta Cible</p>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de ta cible</label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de sa mère</label>
                  <input
                    type="text"
                    value={targetMother}
                    onChange={(e) => setTargetMother(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Son sexe</label>
                  <GenderToggle value={targetGender} onChange={setTargetGender} />
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Ton objectif</label>
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
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Le talisman se prépare pour toi...</p>
          </div>
        )}

        {error && (
          <div className="carte rounded-lg mt-6 text-center" style={{ border: '1px solid #e53935' }}>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{userName}</p>
                    <p className="arabic text-or mt-1">{result.userNameArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>Mère : {userMother}</p>
                    <p className="text-or font-bold mt-2">PM : {result.PMuser}</p>
                  </div>
                  <div className="carte rounded-lg text-center">
                    <p className="text-white font-bold">{targetName}</p>
                    <p className="arabic text-or mt-1">{result.targetNameArabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>Mère : {targetMother}</p>
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
                <div className="text-center mt-6">
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
                <p className="arabic text-or text-[1.8em]">{result.data.verse.arabic}</p>
                <p className="mt-3 text-white">
                  Sourate {result.data.verse.surah} — Verset {result.data.verse.ayah}
                </p>
                <p className="italic mt-2" style={{ color: '#b0b8d4' }}>{result.data.verse.meaning}</p>
                <p className="mt-2 text-white">{result.data.verse.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.verse.arabic} label="Écouter le verset" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Invocation Personnalisée */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Invocation Personnalisée</BlocTitle>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>Version pour écrire (sans harakat)</p>
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

              {/* BLOC 5 — Carré Magique */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Carré Magique</BlocTitle>
                <p className="text-white">{result.data.talisman.choiceReason}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
                  <div>
                    <p className="text-sm mb-2" style={{ color: '#b0b8d4' }}>Base</p>
                    <TalismanGrid values={LAYOUTS[result.squareSize]} size={result.squareSize} variant="base" />
                  </div>
                  <div>
                    <p className="text-sm mb-2" style={{ color: '#b0b8d4' }}>Français</p>
                    <TalismanGrid values={result.cells} size={result.squareSize} variant="french" />
                  </div>
                  <div>
                    <p className="text-sm mb-2" style={{ color: '#b0b8d4' }}>Arabe</p>
                    <TalismanGrid values={result.cells.map((v) => toArabicIndic(v))} size={result.squareSize} variant="arabic" />
                  </div>
                </div>

                <div className="flex justify-center mt-6">
                  <span className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                    ✓ Somme = {result.invocationWeight}
                  </span>
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Comment Écrire le Talisman */}
              <div className="carte rounded-lg">
                <BlocTitle>Comment Écrire le Talisman</BlocTitle>
                <div className="flex flex-col gap-3" style={{ borderLeft: '2px solid rgba(37,99,235,0.3)', paddingLeft: '1rem' }}>
                  {result.data.talisman.writingOrder.map((step, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-or text-white font-bold flex items-center justify-center text-xs">
                        {i + 1}
                      </span>
                      <p className="text-white text-sm mt-0.5">{step}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.3)' }}>
                  <p className="text-sm text-white">{result.data.talisman.bathInstructions}</p>
                </div>

                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    Commencer un {result.data.talisman.bestDayToStart}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    Durée : {result.data.talisman.ritualDuration}
                  </span>
                </div>
              </div>

              <Separateur />

              {/* BLOC 7 — Plantes et Parfum */}
              <div>
                <BlocTitle>Plantes et Parfum</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {result.data.plants.map((p, i) => (
                    <div key={i} className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                      <p className="text-white font-bold">
                        {p.nomFrancais} / {p.nomBambara} / <span className="italic">{p.nomScientifique}</span>
                      </p>
                      <p className="mt-2 text-white text-sm">Partie : {p.partie}</p>
                      <p className="text-white text-sm">{p.preparation}</p>
                      <button
                        onClick={() => window.open(p.lienWikipedia, '_blank', 'noopener,noreferrer')}
                        className="btn-secondaire rounded mt-4"
                      >
                        En savoir plus
                      </button>
                    </div>
                  ))}
                </div>

                <div className="carte rounded-lg text-center mt-5" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-or font-bold">{result.data.perfume.name}</p>
                  <p className="text-white mt-2">{result.data.perfume.description}</p>
                  <p className="text-white mt-2 text-sm">Utilisation : {result.data.perfume.usage}</p>
                  <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>Disponibilité : {result.data.perfume.availability}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 8 — Zikr Quotidien */}
              <div className="carte rounded-lg">
                <BlocTitle>Zikr Quotidien</BlocTitle>
                <p className="text-center text-white text-sm">
                  Meilleur moment : {result.data.zikr.bestTime} — Durée : {result.data.zikr.duration}
                </p>

                <div className="flex flex-col gap-4 mt-5">
                  {result.data.zikr.steps.map((step) => (
                    <div key={step.order} className="rounded-lg p-4" style={{ background: '#0a0e2e', border: '1px solid rgba(37,99,235,0.2)' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-7 h-7 shrink-0 rounded-full bg-or text-white font-bold flex items-center justify-center text-sm">
                          {step.order}
                        </span>
                        <p className="text-or font-bold">{step.title}</p>
                      </div>
                      <p className="arabic text-or text-[1.5em] text-center">{step.arabicWithHarakat}</p>
                      <div className="flex justify-center mt-3">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                          {step.repetitions} fois
                        </span>
                      </div>
                      {step.note && (
                        <p className="text-sm italic mt-2 text-center" style={{ color: '#b0b8d4' }}>{step.note}</p>
                      )}
                      <div className="mt-3 flex justify-center">
                        <AudioButton text={step.arabicWithHarakat} label="Écouter" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-white text-sm">{result.data.zikr.important}</p>
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
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>À donner à : {result.data.sacrifice.recipient}</p>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>Moment : {result.data.sacrifice.timing}</p>
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
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
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
