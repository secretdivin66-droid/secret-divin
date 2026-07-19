import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';
import type { SpendCreditsResult } from '../utils/mystique';

const CATEGORIES = [
  'Guérison / Santé',
  'Protection / Désenvoutement',
  'Amour / Mariage',
  'Argent / Richesse',
  'Travail / Réussite',
  'Élévation spirituelle',
  'Chance / Bénédiction',
  'Autre',
];

interface PlantData {
  number: number;
  nomFrancais: string;
  nomBambara: string;
  nomScientifique: string;
  lienWikipedia: string;
  partie: string;
  quantite: string;
  properties: string;
  why: string;
}

interface VerseData {
  arabic: string;
  surah: string;
  ayah: string;
  meaning: string;
  why: string;
  writingInstructions: string;
}

interface PlantesData {
  isGuerisson: boolean;
  objectiveSummary: string;
  introduction: string;
  plants: PlantData[];
  verses: VerseData[];
  preparation: {
    materials: string[];
    talismanPreparation: { step1: string; step2: string; step3: string; talismanWaterUse: string };
    plantPreparation: { step1: string; step2: string; step3: string; step4: string; fumigationInstructions: string };
    mixing: string;
  };
  ritual: {
    isGuerisson: boolean;
    washingInstructions: string;
    drinkingInstructions: string | null;
    fumigationInstructions: string;
    duration: string;
    bestTime: string;
    daysToAvoid: string | null;
    dailyRitual: string[];
    importantNotes: string[];
  };
  prayer: {
    opening: string;
    openingMeaning: string;
    mainPrayer: string;
    mainPrayerMeaning: string;
    repetitions: number;
    when: string;
  };
  divineName: {
    arabic: string;
    withYa: string;
    transliteration: string;
    meaning: string;
    repetitions: number;
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

function buildPlantesPrompt(objectiveText: string, category: string): string {
  return `Tu es un maître herboriste de la tradition mystique islamique ouest-africaine. Tu combines la phytothérapie traditionnelle africaine avec la science des versets coraniques. Tu parles avec 'tu' en français. Ton ton est chaleureux, sage et professionnel.

Objectif décrit : ${objectiveText}
Catégorie : ${category}

RÈGLE nombre de plantes :
Objectif simple (1 problème clair) : 1 à 3 plantes.
Objectif complexe (plusieurs problèmes) : 4 à 5 plantes.
Objectif très complexe : 6 à 7 plantes.
Maximum absolu : 7 plantes.

RÈGLE guérison :
Si catégorie = 'Guérison / Santé' OU si le texte mentionne une maladie, une douleur ou un problème de santé : isGuerisson = true.
Dans ce cas le patient doit SE LAVER ET BOIRE la préparation.

Retourne UNIQUEMENT du JSON valide :

{
  "isGuerisson": false,
  "objectiveSummary": "Résumé en une phrase de l'objectif détecté.",
  "introduction": "2-3 phrases d'introduction personnelle. Utilise tu. Explique pourquoi ces plantes ont été choisies pour cet objectif.",
  "plants": [
    {
      "number": 1,
      "nomFrancais": "Nom français",
      "nomBambara": "Nom bambara",
      "nomScientifique": "Nom scientifique exact",
      "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
      "partie": "feuilles/écorce/racines/tout",
      "quantite": "une grosse poignée de feuilles / 3 morceaux d'écorce / ...",
      "properties": "Propriétés spirituelles et physiques pour cet objectif.",
      "why": "Pourquoi cette plante est choisie pour cet objectif spécifique."
    }
  ],
  "verses": [
    {
      "arabic": "verset SANS harakat",
      "surah": "nom sourate français",
      "ayah": "numéro",
      "meaning": "traduction française",
      "why": "Pourquoi ce verset pour cet objectif et ces plantes.",
      "writingInstructions": "Comment écrire ce verset sur la tablette en bois avec encre naturelle."
    }
  ],
  "preparation": {
    "materials": [
      "Une grande marmite propre",
      "Une tablette en bois propre",
      "Encre naturelle (safran, charbon ou encre noire)",
      "Un récipient propre pour recueillir l'eau"
    ],
    "talismanPreparation": {
      "step1": "Écrire le(s) verset(s) sur la tablette en bois avec l'encre naturelle",
      "step2": "Laisser sécher la tablette complètement",
      "step3": "Faire tremper la tablette dans de l'eau propre pendant [durée selon objectif]",
      "talismanWaterUse": "Comment utiliser l'eau du talisman (mélanger avec eau des plantes)"
    },
    "plantPreparation": {
      "step1": "Comment préparer les plantes (laver, couper, séparer les parties...)",
      "step2": "Quantité d'eau à utiliser pour la décoction",
      "step3": "Comment faire bouillir (durée exacte, feu doux ou fort)",
      "step4": "Comment filtrer et laisser refroidir",
      "fumigationInstructions": "Comment faire la fumigation avec les plantes séchées si applicable."
    },
    "mixing": "Comment mélanger l'eau des plantes et l'eau du talisman pour obtenir la préparation finale."
  },
  "ritual": {
    "isGuerisson": false,
    "washingInstructions": "Instructions détaillées pour se laver avec le mélange final.",
    "drinkingInstructions": "Instructions pour boire si isGuerisson=true. Sinon null.",
    "fumigationInstructions": "Instructions complètes pour la fumigation si applicable.",
    "duration": "14 jours",
    "bestTime": "Matin avant le lever du soleil / Après Fajr",
    "daysToAvoid": "Jours à éviter si applicable. Sinon null.",
    "dailyRitual": ["Étape 1 du rituel quotidien","Étape 2","Étape 3","Étape 4"],
    "importantNotes": ["Note importante 1","Note importante 2","Note importante 3"]
  },
  "prayer": {
    "opening": "بسم الله الرحمن الرحيم",
    "openingMeaning": "Au nom d'Allah le Tout Miséricordieux, le Très Miséricordieux",
    "mainPrayer": "Invocation principale en arabe SANS harakat",
    "mainPrayerMeaning": "Signification en français",
    "repetitions": 7,
    "when": "Pendant le bain rituel / Après Fajr / Avant de dormir"
  },
  "divineName": {
    "arabic": "nom SANS ال",
    "withYa": "يا + nom",
    "transliteration": "Ya ...",
    "meaning": "signification",
    "repetitions": 99,
    "reason": "Pourquoi ce nom divin pour cet objectif."
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
  "warnings": ["Précaution importante 1","Précaution importante 2 si nécessaire"],
  "conclusion": "Message final chaleureux et encourageant. 3 phrases adressées directement à la personne avec tu. Termine par InchaAllah."
}

RÈGLES plantes :
Uniquement vraies plantes africaines connues en médecine traditionnelle. Toujours nom bambara. Toujours nom scientifique exact. Toujours lien Wikipedia valide.
Plantes disponibles en Afrique de l'Ouest. Varier les parties utilisées.

RÈGLES versets :
Versets authentiques du Coran. SANS harakat. Compatibles avec l'objectif.
1 verset pour objectif simple.
2-3 versets pour objectif complexe.`;
}

function detectIsGuerisson(data: PlantesData, category: string, objectiveText: string): boolean {
  const lower = objectiveText.toLowerCase();
  return (
    data.isGuerisson === true ||
    category === 'Guérison / Santé' ||
    lower.includes('maladie') ||
    lower.includes('douleur') ||
    lower.includes('santé') ||
    lower.includes('guérir') ||
    lower.includes('malade') ||
    lower.includes('traitement')
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

function FadeIn({ children }: { children: ReactNode }) {
  return <div className="transition-opacity duration-700 opacity-100">{children}</div>;
}

function BlocTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-or font-bold text-center mb-4">{children}</h2>;
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-col gap-3 mb-3" style={{ borderLeft: '2px solid rgba(37,99,235,0.3)', paddingLeft: '1rem' }}>
      {steps.map((step, i) => (
        <div key={i} className="flex gap-3 items-start">
          <span className="w-6 h-6 shrink-0 rounded-full bg-or text-white font-bold flex items-center justify-center text-xs">
            {i + 1}
          </span>
          <p className="text-white text-sm mt-0.5">{step}</p>
        </div>
      ))}
    </div>
  );
}

export function PlantesPage() {
  const [objectiveText, setObjectiveText] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlantesData | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = objectiveText.trim().length < 20;
  const isGuerisson = result ? detectIsGuerisson(result, category, objectiveText) : false;

  async function handleGenerate() {
    if (isDisabled) return;
    setError(null);

    const cacheKey = `plantes_${objectiveText.substring(0, 50)}_${category}`;
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

      const prompt = buildPlantesPrompt(objectiveText, category);
      const data: PlantesData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3000,
      });

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'plantes',
            p_description: 'Plantes mystiques — ' + category,
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

      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      setResult(data);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Plantes — ' + objectiveText.substring(0, 40),
        content: data,
        page_source: 'plantes',
      });
    } catch {
      setError('Une erreur s\'est produite. Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setObjectiveText('');
    setCategory(CATEGORIES[0]);
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('plantes-content');
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

    pdf.save('plantes-secretdivin.pdf');
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Plantes Mystiques</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvre les plantes sacrées africaines
          <br />
          et leurs rituels selon ton objectif
          <br />
          spirituel
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[700px] mx-auto flex flex-col gap-5">
            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Décris ton objectif ou ton problème
              </label>
              <textarea
                value={objectiveText}
                onChange={(e) => setObjectiveText(e.target.value)}
                rows={3}
                placeholder="Ex: Je veux me protéger du mauvais oeil, je cherche à attirer l'amour, je souffre d'une maladie chronique, je veux réussir dans mes affaires, je cherche la paix intérieure..."
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
              <p className="text-right text-xs mt-1" style={{ color: '#b0b8d4' }}>
                {objectiveText.length} caractères
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Catégorie de l'objectif
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              TROUVER MES PLANTES ET MON RITUEL
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Recherche des plantes mystiques pour toi...</p>
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
            <div id="plantes-content">
              <Separateur />

              {/* EN-TÊTE RÉSULTATS */}
              <div className="carte rounded-lg text-center">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                  {result.objectiveSummary}
                </span>
                {isGuerisson && (
                  <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                    <p className="text-green-400 font-bold text-sm">
                      Rituel de Guérison — Tu devras te laver ET boire la préparation chaque jour
                    </p>
                  </div>
                )}
                <p className="italic text-white mt-4">{result.introduction}</p>
              </div>

              <Separateur />

              {/* BLOC 1 — Tes Plantes */}
              <div>
                <BlocTitle>
                  Tes Plantes ({result.plants.length} plante{result.plants.length > 1 ? 's' : ''})
                </BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {result.plants.map((p) => (
                    <div key={p.number} className="rounded-lg overflow-hidden" style={{ border: '1px solid #2563EB' }}>
                      <div className="px-4 py-2 bg-or">
                        <p className="text-white font-bold">
                          Plante {p.number} — {p.nomFrancais}
                        </p>
                      </div>
                      <div className="p-5 text-center" style={{ background: '#0d2b1a' }}>
                        <p className="text-white font-bold">
                          {p.nomBambara} / <span className="italic">{p.nomScientifique}</span>
                        </p>
                        <p className="text-white mt-2 text-sm">Partie : {p.partie}</p>
                        <p className="text-white text-sm">Quantité : {p.quantite}</p>
                        <p className="italic text-white mt-3 text-sm">{p.properties}</p>
                        <p className="text-or font-bold mt-2">{p.why}</p>
                        <button
                          onClick={() => window.open(p.lienWikipedia, '_blank', 'noopener,noreferrer')}
                          className="btn-secondaire rounded mt-4"
                        >
                          En savoir plus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separateur />

              {/* BLOC 2 — Versets */}
              <div className="carte rounded-lg">
                <BlocTitle>{result.verses.length > 1 ? 'Versets Coraniques' : 'Verset Coranique'}</BlocTitle>
                <div className="flex flex-col gap-4">
                  {result.verses.map((v, i) => (
                    <div key={i} className="text-center">
                      <p className="arabic text-or text-[1.8em]">{v.arabic}</p>
                      <p className="mt-2 text-white">
                        Sourate {v.surah} — Verset {v.ayah}
                      </p>
                      <p className="italic mt-1" style={{ color: '#b0b8d4' }}>{v.meaning}</p>
                      <p className="mt-2 text-white">{v.why}</p>
                      <div className="rounded-lg p-4 mt-3" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.4)' }}>
                        <p className="text-sm text-white">{v.writingInstructions}</p>
                      </div>
                      <div className="mt-3 flex justify-center">
                        <AudioButton text={v.arabic} label="Écouter le verset" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Préparation Complète */}
              <div className="carte rounded-lg">
                <BlocTitle>Préparation Complète</BlocTitle>

                <p className="font-bold mb-2" style={{ color: '#b0b8d4' }}>Matériel nécessaire</p>
                <div className="rounded-lg p-4 mb-6" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.3)' }}>
                  {result.preparation.materials.map((m, i) => (
                    <p key={i} className="text-white text-sm">✦ {m}</p>
                  ))}
                </div>

                <p className="text-or font-bold mb-3">Étape A — Prépare le Talisman</p>
                <StepList
                  steps={[
                    result.preparation.talismanPreparation.step1,
                    result.preparation.talismanPreparation.step2,
                    result.preparation.talismanPreparation.step3,
                  ]}
                />
                <div className="rounded-lg p-4 mb-6" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.3)' }}>
                  <p className="text-sm text-white">{result.preparation.talismanPreparation.talismanWaterUse}</p>
                </div>

                <p className="text-or font-bold mb-3">Étape B — Prépare les Plantes</p>
                <StepList
                  steps={[
                    result.preparation.plantPreparation.step1,
                    result.preparation.plantPreparation.step2,
                    result.preparation.plantPreparation.step3,
                    result.preparation.plantPreparation.step4,
                  ]}
                />
                {result.preparation.plantPreparation.fumigationInstructions && (
                  <div className="rounded-lg p-4 mb-6" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.3)' }}>
                    <p className="text-sm text-white">{result.preparation.plantPreparation.fumigationInstructions}</p>
                  </div>
                )}

                <p className="text-or font-bold mb-3">Étape C — Mélange Final</p>
                <div className="rounded-lg p-5" style={{ border: '2px solid #2563EB' }}>
                  <p className="text-white">{result.preparation.mixing}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Le Rituel */}
              <div className="carte rounded-lg">
                <BlocTitle>Le Rituel ({result.ritual.duration})</BlocTitle>
                <p className="text-center text-white">Meilleur moment : {result.ritual.bestTime}</p>

                {isGuerisson && (
                  <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                    <p className="text-green-400 text-sm font-bold text-center">
                      Rituel de Guérison — lavage ET consommation quotidiens
                    </p>
                  </div>
                )}

                <p className="font-bold mt-6 mb-3" style={{ color: '#b0b8d4' }}>Rituel quotidien</p>
                <StepList steps={result.ritual.dailyRitual} />

                <div className="rounded-lg p-4 mt-3" style={{ background: '#0a0e2e', border: '1px solid rgba(37,99,235,0.2)' }}>
                  <p className="text-or font-bold mb-1">Lavage</p>
                  <p className="text-white text-sm">{result.ritual.washingInstructions}</p>
                </div>

                {isGuerisson && result.ritual.drinkingInstructions && (
                  <div className="rounded-lg p-4 mt-3" style={{ background: '#1b3a1f' }}>
                    <p className="text-green-400 font-bold mb-1">Comment boire</p>
                    <p className="text-white text-sm">{result.ritual.drinkingInstructions}</p>
                  </div>
                )}

                {result.ritual.fumigationInstructions && (
                  <div className="rounded-lg p-4 mt-3" style={{ background: '#0a0e2e', border: '1px solid rgba(37,99,235,0.2)' }}>
                    <p className="text-or font-bold mb-1">Fumigation</p>
                    <p className="text-white text-sm">{result.ritual.fumigationInstructions}</p>
                  </div>
                )}

                {result.ritual.daysToAvoid && (
                  <div className="rounded-lg p-4 mt-3" style={{ background: '#3a2410', border: '1px solid #ff9800' }}>
                    <p className="text-orange-300 text-sm">Jours à éviter : {result.ritual.daysToAvoid}</p>
                  </div>
                )}

                {result.ritual.importantNotes.length > 0 && (
                  <div className="flex flex-col gap-2 mt-5">
                    {result.ritual.importantNotes.map((n, i) => (
                      <div key={i} className="rounded p-3" style={{ background: '#1a1a2e' }}>
                        <p className="text-sm" style={{ color: '#b0b8d4' }}>✦ {n}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separateur />

              {/* BLOC 5 — Prière et Invocation */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Prière et Invocation</BlocTitle>
                <p className="arabic text-or text-[1.4em]">{result.prayer.opening}</p>
                <p className="italic text-white mt-1 text-sm">{result.prayer.openingMeaning}</p>
                <div className="my-4 h-px" style={{ background: 'rgba(37,99,235,0.2)' }} />
                <p className="arabic text-or text-[1.8em]">{result.prayer.mainPrayer}</p>
                <p className="italic text-white mt-2">{result.prayer.mainPrayerMeaning}</p>
                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.prayer.repetitions} fois
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">{result.prayer.when}</span>
                </div>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.prayer.mainPrayer} label="Écouter la prière" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Nom Divin */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
                <BlocTitle>Ton Nom Divin</BlocTitle>
                <p className="arabic text-or text-[2.5em]">{result.divineName.withYa}</p>
                <p className="mt-3 text-white">
                  {result.divineName.transliteration} • {result.divineName.meaning}
                </p>
                <div className="flex justify-center mt-4">
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.divineName.repetitions} fois
                  </span>
                </div>
                <p className="italic mt-3" style={{ color: '#b0b8d4' }}>{result.divineName.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.divineName.withYa} label="Écouter le nom divin" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 7 — Sacrifice Recommandé */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifice Recommandé</BlocTitle>
                <p className="text-white text-center">{result.sacrifice.reason}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {result.sacrifice.offerings.map((o, i) => (
                    <p key={i} className="text-sm text-white">
                      {o.item} — {o.quantity} → {o.meaning}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>À donner à : {result.sacrifice.recipient}</p>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>Moment : {result.sacrifice.timing}</p>
                <p className="mt-3 text-white">{result.sacrifice.instructions}</p>
              </div>

              {/* BLOC 8 — Avertissements */}
              {result.warnings.length > 0 && (
                <>
                  <Separateur />
                  <div className="flex flex-col gap-2">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="rounded-lg p-4" style={{ background: '#3a2410', border: '1px solid #ff9800' }}>
                        <p className="text-orange-300 text-sm">✦ {w}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separateur />

              {/* BLOC 9 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton text={`${result.introduction} ${result.conclusion}`} label="Écouter le rituel" />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Décrire un autre objectif
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Plantes Mystiques" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
