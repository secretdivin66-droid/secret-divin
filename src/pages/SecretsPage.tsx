import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { calculateWeight, GENDER_BONUS, generateSquare } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';
import { callGeminiProxy } from '../lib/geminiProxy';

type Gender = 'homme' | 'femme';

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface DivineName {
  arabic: string;
  withYa: string;
  transliteration: string;
  meaning: string;
  weight: number;
}

interface ZikrStep {
  order: number;
  title: string;
  arabic: string;
  repetitions: number;
  note: string | null;
}

interface SecretsData {
  secretNumber: { value: number; hidden: string; power: string };
  hiddenMeaning: { nameSecret: string; motherSecret: string; combinedPower: string };
  divineNames: { name1: DivineName; name2: DivineName; combined: string; reason: string };
  verse: {
    arabic: string;
    surah: string;
    ayah: string;
    meaning: string;
    reason: string;
    writingInstructions: string;
  };
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
  };
  zikr: {
    steps: ZikrStep[];
    bestTime: string;
    duration: string;
  };
  plant: {
    nomFrancais: string;
    nomBambara: string;
    nomScientifique: string;
    lienWikipedia: string;
    partie: string;
    preparation: string;
    reason: string;
  };
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
  data: SecretsData;
  nameArabic: string;
  motherArabic: string;
  PM: number;
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

function buildSecretsPrompt(params: {
  firstName: string;
  nameArabic: string;
  motherName: string;
  motherArabic: string;
  gender: Gender;
  objective: string;
  PM: number;
}): string {
  const { firstName, nameArabic, motherName, motherArabic, gender, objective, PM } = params;
  return `Tu es un maître de la mystique islamique ouest-africaine et de la science des lettres (Ilm al-Huruf). Tu parles avec 'tu' en français. Ton ton est profond, sérieux et rassurant.

Prénom : ${firstName}
Prénom arabe : ${nameArabic}
Mère : ${motherName}
Mère arabe : ${motherArabic}
Sexe : ${gender}
Objectif : ${objective}
PM : ${PM}

Retourne UNIQUEMENT du JSON valide :

{
  "secretNumber": {
    "value": ${PM},
    "hidden": "Le chiffre caché derrière ce PM en 2 phrases.",
    "power": "La puissance mystique de ce nombre en 2 phrases."
  },
  "hiddenMeaning": {
    "nameSecret": "2-3 phrases sur les secrets cachés dans le prénom ${firstName} selon la science des lettres.",
    "motherSecret": "2 phrases sur l'influence du prénom de la mère sur le destin.",
    "combinedPower": "2 phrases sur la puissance combinée des deux prénoms."
  },
  "divineNames": {
    "name1": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification", "weight": 0 },
    "name2": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification", "weight": 0 },
    "combined": "يا nom1 يا nom2",
    "reason": "2 phrases sur pourquoi ces 2 noms divins pour cet objectif."
  },
  "verse": {
    "arabic": "verset SANS harakat",
    "surah": "nom sourate en français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour cet objectif.",
    "writingInstructions": "Comment écrire ce verset sur la tablette en bois avec encre naturelle."
  },
  "invocation": {
    "arabicNoHarakat": "invocation complète SANS harakat contenant : يا + nom1 + يا + nom2 + prénom arabe + ibn/bint + prénom mère arabe + verset",
    "arabicWithHarakat": "même invocation AVEC tous les harakat pour le zikr quotidien",
    "meaning": "traduction française complète",
    "repetitions": 41
  },
  "talisman": {
    "squareType": "3x3 ou 4x4 ou 5x5",
    "choiceReason": "Pourquoi ce type de carré pour cet objectif et ce PM.",
    "writingOrder": ["Étape 1","Étape 2","Étape 3","Étape 4","Étape 5"],
    "bathInstructions": "Instructions complètes pour le bain rituel après avoir lavé la tablette.",
    "ritualDuration": "7 jours"
  },
  "zikr": {
    "steps": [
      { "order": 1, "title": "Bismillah", "arabic": "بسم الله الرحمن الرحيم", "repetitions": 1, "note": "Toujours commencer par Bismillah" },
      { "order": 2, "title": "Salat sur le Prophète", "arabic": "اللهم صل على سيدنا محمد", "repetitions": 3, "note": null },
      { "order": 3, "title": "Les 2 noms divins", "arabic": "[divineNames.combined]", "repetitions": 99, "note": "يا sans ال obligatoire" },
      { "order": 4, "title": "Le verset coranique", "arabic": "[verse.arabic]", "repetitions": 7, "note": null },
      { "order": 5, "title": "L'invocation complète", "arabic": "[invocation.arabicWithHarakat]", "repetitions": 41, "note": "Réciter lentement et avec concentration" },
      { "order": 6, "title": "Clôture salat", "arabic": "اللهم صل على سيدنا محمد", "repetitions": 3, "note": "Terminer par Al-Hamdulillah" }
    ],
    "bestTime": "Après Fajr ou avant de dormir",
    "duration": "[talisman.ritualDuration]"
  },
  "plant": {
    "nomFrancais": "nom français",
    "nomBambara": "nom bambara",
    "nomScientifique": "nom scientifique exact",
    "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
    "partie": "feuilles/écorce/racines",
    "preparation": "comment préparer et utiliser avec le bain",
    "reason": "Pourquoi cette plante pour cet objectif."
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
  "warnings": ["Avertissement 1 important","Avertissement 2 si nécessaire"],
  "conclusion": "Message final chaleureux adressé à ${firstName}. 3 phrases encourageantes. Termine par InchaAllah."
}

RÈGLES NOMS DIVINS :
TOUJOURS sans ال devant le nom.
TOUJOURS avec يا pour affichage.
Correct : يا ودود يا جامع
Incorrect : يا الودود يا الجامع

RÈGLES PLANTE :
Plantes africaines réelles. Nom scientifique exact. Lien Wikipedia valide.`;
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

const OBJECTIVES = [
  'Protection spirituelle',
  'Réussite et succès',
  'Amour et mariage',
  'Richesse et abondance',
  'Santé et guérison',
  'Élévation spirituelle',
  'Chance et bénédiction',
  'Autre',
];

export function SecretsPage() {
  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [objective, setObjective] = useState(OBJECTIVES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !firstName.trim() || !motherName.trim();

  async function handleGenerate() {
    setError(null);

    const cacheKey = `secrets_${firstName}_${motherName}_${gender}_${objective}`;
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

      const { data: credits } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      const balance = credits?.balance ?? 0;

      if (balance < 2) {
        setModalBalance(balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      const [nameResult, motherResult] = await Promise.all([translateName(firstName), translateName(motherName)]);

      const nameWeight = calculateWeight(nameResult.arabic);
      const motherWeight = calculateWeight(motherResult.arabic);
      const PM = nameWeight + motherWeight + GENDER_BONUS[gender];

      const prompt = buildSecretsPrompt({
        firstName,
        nameArabic: nameResult.arabic,
        motherName,
        motherArabic: motherResult.arabic,
        gender,
        objective,
        PM,
      });

      const data: SecretsData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3000,
      });

      const newResult: CachedResult = {
        data,
        nameArabic: nameResult.arabic,
        motherArabic: motherResult.arabic,
        PM,
      };

      // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
      // le client ne peut plus écrire dans user_credits directement.
      const { data: spendData, error: spendError } = await supabase
        .rpc('spend_credits', {
          p_tool: 'secrets',
          p_description: 'Secrets mystiques — ' + firstName,
        })
        .single();
      const spend = spendData as SpendCreditsResult | null;

      if (spendError || !spend?.success) {
        setModalBalance(spend?.balance ?? balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Secrets de ' + firstName,
        content: data,
        page_source: 'secrets',
      });
    } catch {
      setError('Erreur de connexion. Vérifie ta clé API et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFirstName('');
    setMotherName('');
    setGender('homme');
    setObjective(OBJECTIVES[0]);
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('secrets-content');
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

    pdf.save(`secrets-${firstName}-secretdivin.pdf`);
  }

  const squareSize = result
    ? result.data.talisman.squareType === '3x3'
      ? 3
      : result.data.talisman.squareType === '4x4'
      ? 4
      : 5
    : 3;
  const talismanCells = result ? generateSquare(result.PM, squareSize) : [];

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Secrets Mystiques Cachés</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Révèle les secrets spirituels de ton
          <br />
          prénom et reçois ton invocation
          <br />
          personnalisée
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                Ton prénom (en français)
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                Prénom de ta mère (en français)
              </label>
              <input
                type="text"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                required
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Ton sexe
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setGender('homme')}
                  className={`flex-1 py-2 rounded font-bold transition ${
                    gender === 'homme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
                  }`}
                >
                  Homme
                </button>
                <button
                  type="button"
                  onClick={() => setGender('femme')}
                  className={`flex-1 py-2 rounded font-bold transition ${
                    gender === 'femme' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
                  }`}
                >
                  Femme
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                Ton objectif principal
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {OBJECTIVES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              RÉVÉLER MES SECRETS MYSTIQUES
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#b0b8d4' }}>Révélation de tes secrets...</p>
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
            <div id="secrets-content">
              <Separateur />

              {/* BLOC 1 — Identité Mystique */}
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-[2rem]">{firstName}</p>
                <p className="arabic text-or mt-2">
                  {result.nameArabic} بن/بنت {result.motherArabic}
                </p>
                <p className="text-white mt-3">PM : {result.PM}</p>
              </div>

              <Separateur />

              {/* BLOC 2 — Les Secrets Cachés */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="carte rounded-lg">
                  <p className="text-or font-bold mb-2">Secret de {firstName}</p>
                  <p className="text-white text-sm">{result.data.hiddenMeaning.nameSecret}</p>
                </div>
                <div className="carte rounded-lg">
                  <p className="text-or font-bold mb-2">Influence de ta mère</p>
                  <p className="text-white text-sm">{result.data.hiddenMeaning.motherSecret}</p>
                </div>
                <div className="carte rounded-lg">
                  <p className="text-or font-bold mb-2">Puissance combinée</p>
                  <p className="text-white text-sm">{result.data.hiddenMeaning.combinedPower}</p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold mb-2">Le nombre secret</p>
                  <p className="text-or font-bold text-[3rem]">{result.PM}</p>
                  <p className="text-white text-sm mt-2">{result.data.secretNumber.hidden}</p>
                  <p className="text-white text-sm mt-1">{result.data.secretNumber.power}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Les 2 Noms Divins */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Les 2 Noms Divins</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name1.withYa}</p>
                    <p className="text-sm mt-2 text-white">
                      {result.data.divineNames.name1.transliteration} / {result.data.divineNames.name1.meaning}
                    </p>
                  </div>
                  <div>
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name2.withYa}</p>
                    <p className="text-sm mt-2 text-white">
                      {result.data.divineNames.name2.transliteration} / {result.data.divineNames.name2.meaning}
                    </p>
                  </div>
                </div>
                <p className="arabic text-or text-[1.8em] mt-5">{result.data.divineNames.combined}</p>
                <p className="italic mt-3" style={{ color: '#b0b8d4' }}>
                  {result.data.divineNames.reason}
                </p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.divineNames.combined} label="Écouter les noms divins" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Verset Coranique */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Verset Coranique</BlocTitle>
                <p className="arabic text-or text-[1.8em]">{result.data.verse.arabic}</p>
                <p className="mt-3 text-white">
                  Sourate {result.data.verse.surah} — Verset {result.data.verse.ayah}
                </p>
                <p className="italic mt-2" style={{ color: '#b0b8d4' }}>
                  {result.data.verse.meaning}
                </p>
                <p className="mt-2 text-white">{result.data.verse.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.verse.arabic} label="Écouter le verset" />
                </div>
                <div className="rounded-lg text-left p-4 mt-5" style={{ background: '#0a0e2e' }}>
                  <p className="text-or font-bold mb-2">Comment écrire sur la tablette</p>
                  <p className="text-white text-sm">{result.data.verse.writingInstructions}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 5 — Invocation Personnalisée */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Invocation Personnalisée</BlocTitle>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>
                  Version pour écrire (sans harakat)
                </p>
                <p className="arabic text-or text-[1.5em] mt-2">{result.data.invocation.arabicNoHarakat}</p>
                <p className="italic mt-3 text-white">{result.data.invocation.meaning}</p>
                <div className="flex justify-center mt-4">
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.data.invocation.repetitions} fois
                  </span>
                </div>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.invocation.arabicWithHarakat} label="Écouter l'invocation" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Carré Magique Talisman */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Carré Magique Talisman</BlocTitle>
                <p className="italic text-white">{result.data.talisman.choiceReason}</p>

                <div
                  className="mx-auto mt-5"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${squareSize}, 44px)`,
                    gap: '2px',
                    justifyContent: 'center',
                  }}
                >
                  {talismanCells.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center font-bold"
                      style={{
                        width: 44,
                        height: 44,
                        background: '#ffffff',
                        border: '2px solid #2563EB',
                        color: '#1a237e',
                      }}
                    >
                      {v}
                    </div>
                  ))}
                </div>

                <div className="flex justify-center mt-4">
                  <span
                    className="px-4 py-2 rounded-full text-sm font-bold"
                    style={{ background: '#1b3a1f', color: '#4caf50' }}
                  >
                    ✓ Somme = {result.PM}
                  </span>
                </div>

                <div className="mt-5 flex flex-col gap-2 text-left">
                  {result.data.talisman.writingOrder.map((step, i) => (
                    <p key={i} className="text-sm text-white">
                      {i + 1}. {step}
                    </p>
                  ))}
                </div>

                <div className="flex justify-center mt-4">
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    Durée du rituel : {result.data.talisman.ritualDuration}
                  </span>
                </div>
              </div>

              <Separateur />

              {/* BLOC 7 — Zikr Quotidien */}
              <div className="carte rounded-lg">
                <BlocTitle>Zikr Quotidien</BlocTitle>
                <p className="text-center text-white">
                  Meilleur moment : {result.data.zikr.bestTime} — Durée : {result.data.zikr.duration}
                </p>

                <div className="flex flex-col gap-4 mt-5">
                  {result.data.zikr.steps.map((step) => (
                    <div key={step.order} className="rounded-lg p-4" style={{ background: '#0a0e2e' }}>
                      <p className="text-or font-bold">
                        {step.order}. {step.title}
                      </p>
                      <p className="arabic text-or mt-2">{step.arabic}</p>
                      <div className="flex justify-center mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                          {step.repetitions} fois
                        </span>
                      </div>
                      {step.note && (
                        <p className="text-sm mt-2 text-center" style={{ color: '#b0b8d4' }}>
                          {step.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5 text-center" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-or text-sm">
                    Commencer par Bismillah. Terminer par Al-Hamdulillah. Faire ce zikr sans interruption pendant{' '}
                    {result.data.talisman.ritualDuration}.
                  </p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 8 — Plante Mystique */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                <BlocTitle>Plante Mystique</BlocTitle>
                <p className="text-white font-bold">
                  {result.data.plant.nomFrancais} / {result.data.plant.nomBambara} /{' '}
                  <span className="italic">{result.data.plant.nomScientifique}</span>
                </p>
                <p className="mt-2 text-white">Partie utilisée : {result.data.plant.partie}</p>
                <p className="mt-1 text-white">{result.data.plant.preparation}</p>
                <p className="mt-2" style={{ color: '#b0b8d4' }}>
                  {result.data.plant.reason}
                </p>
                <button
                  onClick={() => window.open(result.data.plant.lienWikipedia, '_blank', 'noopener,noreferrer')}
                  className="btn-secondaire rounded mt-4"
                >
                  En savoir plus
                </button>
              </div>

              <Separateur />

              {/* BLOC 9 — Instructions Bain Rituel */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
                <BlocTitle>Instructions Bain Rituel</BlocTitle>
                <p className="text-white">{result.data.talisman.bathInstructions}</p>
              </div>

              <Separateur />

              {/* BLOC 10 — Sacrifice */}
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
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>
                  À donner à : {result.data.sacrifice.recipient}
                </p>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>
                  Moment : {result.data.sacrifice.timing}
                </p>
                <p className="mt-3 text-white">{result.data.sacrifice.instructions}</p>
              </div>

              <Separateur />

              {/* BLOC 11 — Avertissements */}
              <div className="flex flex-col gap-3">
                {result.data.warnings.map((w, i) => (
                  <div key={i} className="rounded-lg p-4 text-center" style={{ border: '1px solid #f57c00' }}>
                    <p style={{ color: '#f57c00' }}>⚠ {w}</p>
                  </div>
                ))}
              </div>

              <Separateur />

              {/* BLOC 12 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.data.hiddenMeaning.nameSecret} ${result.data.divineNames.reason} ${result.data.conclusion}`}
                label="Écouter mes secrets"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Nouvelle consultation
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Secrets" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
