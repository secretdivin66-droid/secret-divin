import { useState } from 'react';
import type { ReactNode } from 'react';
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

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

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
}

interface PlantesData {
  isGuerisson: boolean;
  objectiveSummary: string;
  introduction: string;
  plants: PlantData[];
  verses: VerseData[];
  // "talismanPreparation"/"plantPreparation" (étapes libres) et "mixing"
  // retirés : l'Étape A/B/C de "Préparation Complète" sont désormais des
  // instructions fixes (voir le rendu) — seule la quantité d'eau pour les
  // plantes reste réutilisée telle quelle (déjà fiable, pas de raison de
  // la regénérer).
  preparation: {
    materials: string[];
    plantWaterQuantity: string;
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

interface CachedResult {
  data: PlantesData;
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
  return callGeminiWithRetry('gemini-3.1-flash-lite', prompt, { temperature: 0.1, maxOutputTokens: 200 });
}

// Règle de sacrifice déterministe identique à celle déjà utilisée ailleurs
// sur SecretDivin (PM%4 -> type d'offrande, PM%3 -> destinataire) —
// réutilisée telle quelle, pas une nouvelle règle inventée pour cette page.
function offeringFromR4(r: number): string {
  if (r === 1) return 'choses du FEU (galettes, pain grillé)';
  if (r === 2) return 'choses de la TERRE (manioc, igname)';
  if (r === 3) return 'FRUITS (mangues, bananes, oranges)';
  return 'POISSON (frais ou séché)';
}
function recipientFromR3(r: number): string {
  if (r === 1) return 'un HOMME';
  if (r === 2) return 'une FEMME';
  return 'un ENFANT';
}

// Détermine si le travail relève de la protection/désenvoûtement à partir
// des données déjà disponibles (catégorie choisie, ou texte libre si
// "Autre") — aucune nouvelle règle de sélection des plantes n'est créée,
// cette détection ne sert qu'à choisir le texte de l'Étape C (parfum ou non).
function isProtectionWorkType(category: string, customWorkType: string): boolean {
  if (category === 'Protection / Désenvoutement') return true;
  if (category === 'Autre') {
    const lower = customWorkType.toLowerCase();
    return /protection|désenvoût|desenvout|envoûtement|envoutement|sorcellerie|mauvais\s?(œ|oe)il/.test(lower);
  }
  return false;
}

function buildPlantesPrompt(params: {
  objectiveText: string;
  category: string;
  workTypeForPrompt: string;
  PM: number;
}): string {
  const { objectiveText, category, workTypeForPrompt, PM } = params;
  const remainder4 = PM % 4;
  const remainder3 = ((PM % 3) + 3) % 3;
  return `Tu es un maître herboriste de la tradition mystique islamique ouest-africaine. Tu combines la phytothérapie traditionnelle africaine avec la science des versets coraniques. Tu parles avec 'tu' en français. Ton ton est chaleureux, sage et professionnel.

Objectif décrit : ${objectiveText}
Catégorie : ${category}
Type de travail précis (à utiliser pour adapter le sacrifice) : ${workTypeForPrompt}
Poids Mystique (PM) de la personne : ${PM}

RÈGLE nombre de plantes :
Objectif simple (1 problème clair) : 1 à 3 plantes.
Objectif complexe (plusieurs problèmes) : 4 à 5 plantes.
Objectif très complexe : 6 à 7 plantes.
Maximum absolu : 7 plantes.

RÈGLE guérison :
Si catégorie = 'Guérison / Santé' OU si le texte mentionne une maladie, une douleur ou un problème de santé : isGuerisson = true.

RÈGLE SACRIFICE (fait déterministe, à respecter dans "sacrifice" si isRecommended=true) :
PM % 4 = ${remainder4} → type d'offrande imposé : ${offeringFromR4(remainder4)}
PM % 3 = ${remainder3} → destinataire imposé : ${recipientFromR3(remainder3)}
Les offrandes de "sacrifice.offerings" doivent appartenir à cette catégorie et
"sacrifice.recipient" doit correspondre à ce destinataire, adaptés au type de
travail "${workTypeForPrompt}". Si, pour ce type de travail précis, aucun
sacrifice n'est réellement pertinent, mets "isRecommended": false plutôt que
d'inventer une correspondance approximative.

LIMITE DE LONGUEUR : la somme de tous les textes du JSON (toutes les valeurs confondues, y compris pour chaque plante) ne doit jamais dépasser 450 mots au total. Reste concis sur chaque champ tout en gardant de la profondeur.

Retourne UNIQUEMENT du JSON valide :

{
  "isGuerisson": false,
  "objectiveSummary": "Résumé en une phrase de l'objectif détecté.",
  "introduction": "1 phrase d'introduction personnelle. Utilise tu. Explique pourquoi ces plantes ont été choisies pour cet objectif.",
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
      "why": "Pourquoi ce verset pour cet objectif et ces plantes."
    }
  ],
  "preparation": {
    "materials": [
      "Une grande marmite propre",
      "Une tablette en bois propre",
      "Encre naturelle (safran, charbon ou encre noire)",
      "Un récipient propre pour recueillir l'eau"
    ],
    "plantWaterQuantity": "Quantité d'eau à utiliser pour la décoction des plantes."
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
  "conclusion": "Message final chaleureux et encourageant. 1 phrase adressées directement à la personne avec tu. Termine par InchaAllah."
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
    <div className="flex flex-col gap-3 mb-3" style={{ borderLeft: '2px solid rgba(245,200,66,0.3)', paddingLeft: '1rem' }}>
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
  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [objectiveText, setObjectiveText] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [customWorkType, setCustomWorkType] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled =
    !firstName.trim() ||
    !motherName.trim() ||
    objectiveText.trim().length < 20 ||
    (category === 'Autre' && !customWorkType.trim());
  const isGuerisson = result ? detectIsGuerisson(result.data, category, objectiveText) : false;
  // Type de travail réellement utilisé pour adapter le sacrifice et le
  // parfum (Étape C) : la catégorie choisie, ou le texte libre si "Autre".
  const workTypeForPrompt = category === 'Autre' ? customWorkType : category;
  const isProtectionWork = isProtectionWorkType(category, customWorkType);

  async function handleGenerate() {
    if (isDisabled) return;
    setError(null);

    const cacheKey = `plantes_${firstName}_${motherName}_${gender}_${objectiveText.substring(0, 50)}_${category}_${customWorkType}`;
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

      const [nameResult, motherResult] = await Promise.all([translateName(firstName), translateName(motherName)]);
      const nameWeight = calculateWeight(nameResult.arabic);
      const motherWeight = calculateWeight(motherResult.arabic);
      const PM = nameWeight + motherWeight + GENDER_BONUS[gender];

      const prompt = buildPlantesPrompt({ objectiveText, category, workTypeForPrompt, PM });
      const data: PlantesData = await callGeminiWithRetry('gemini-3.1-flash-lite', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3600,
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

      const newResult: CachedResult = { data, PM };
      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

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
    setFirstName('');
    setMotherName('');
    setGender('homme');
    setObjectiveText('');
    setCategory(CATEGORIES[0]);
    setCustomWorkType('');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('plantes-content');
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

    pdf.save('plantes-secretdivin.pdf');
  }

  // Poids mystique du Nom Divin (Abjad, même calculateWeight() que partout
  // ailleurs) — sert de nombre de répétitions pour écrire le verset
  // (Étape A.2), distinct du Poids Mystique de la personne (Étape A.1),
  // qui lui n'apparaît QUE dans cette première instruction.
  const divineNameWeight = result ? calculateWeight(result.data.divineName.arabic) : 0;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Plantes Mystiques</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Découvre les plantes sacrées africaines
          <br />
          et leurs rituels selon ton objectif
          <br />
          spirituel
        </p>

        <Separateur />

        <div className="flex justify-center mb-4">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[700px] mx-auto flex flex-col gap-5">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
                Prénom de la personne
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
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
                Prénom de la mère
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
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>
                Sexe
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
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>
                Décris ton objectif ou ton problème
              </label>
              <textarea
                value={objectiveText}
                onChange={(e) => setObjectiveText(e.target.value)}
                rows={3}
                placeholder="Ex: Je veux me protéger du mauvais oeil, je cherche à attirer l'amour, je souffre d'une maladie chronique, je veux réussir dans mes affaires, je cherche la paix intérieure..."
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
              <p className="text-right text-xs mt-1" style={{ color: '#a0aec0' }}>
                {objectiveText.length} caractères
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>
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
              {category === 'Autre' && (
                <div className="mt-3">
                  <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
                    Précise ton travail
                  </label>
                  <input
                    type="text"
                    value={customWorkType}
                    onChange={(e) => setCustomWorkType(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
              )}
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
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Recherche des plantes mystiques pour toi...</p>
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
            <div id="plantes-content">
              <Separateur />

              {/* EN-TÊTE RÉSULTATS — présentation et description du travail */}
              <div className="carte rounded-lg text-center">
                <span className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                  {result.data.objectiveSummary}
                </span>
                {isGuerisson && (
                  <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                    <p className="text-green-400 font-bold text-sm">
                      Rituel de Guérison — Tu devras te laver ET boire la préparation chaque jour
                    </p>
                  </div>
                )}
                <p className="italic text-white mt-4">{result.data.introduction}</p>
              </div>

              <Separateur />

              {/* CARTE — Tes plantes (les deux plantes regroupées dans une
                  seule carte principale, chacune dans son propre bloc). */}
              <div className="carte rounded-lg">
                <BlocTitle>
                  Tes plantes ({result.data.plants.length} plante{result.data.plants.length > 1 ? 's' : ''})
                </BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {result.data.plants.map((p) => (
                    <div key={p.number} className="rounded-lg overflow-hidden" style={{ border: '1px solid #f5c842' }}>
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

              {/* CARTE — Nom Divin et Verset Coranique, regroupés (le Nom
                  Divin apparaît donc juste après "Tes plantes", comme
                  demandé, fusionné avec le verset plutôt que dupliqué dans
                  2 cartes distinctes). */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0f2e', border: '1px solid #f5c842' }}>
                <BlocTitle>Nom Divin et Verset Coranique</BlocTitle>
                <p className="arabic text-or text-[2.5em]">{result.data.divineName.withYa}</p>
                <p className="mt-3 text-white">
                  {result.data.divineName.transliteration} • {result.data.divineName.meaning}
                </p>
                <div className="flex justify-center mt-4">
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.data.divineName.repetitions} fois
                  </span>
                </div>
                <p className="italic mt-3" style={{ color: '#a0aec0' }}>{result.data.divineName.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.divineName.withYa} label="Écouter le nom divin" />
                </div>

                <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(245,200,66,0.2)' }}>
                  <p className="text-or font-bold mb-4">{result.data.verses.length > 1 ? 'Versets Coraniques' : 'Verset Coranique'}</p>
                  <div className="flex flex-col gap-5">
                    {result.data.verses.map((v, i) => (
                      <div key={i}>
                        <p className="arabic text-or text-[1.8em]">{v.arabic}</p>
                        <p className="mt-2 text-white">
                          Sourate {v.surah} — Verset {v.ayah}
                        </p>
                        <p className="italic mt-1" style={{ color: '#a0aec0' }}>{v.meaning}</p>
                        <p className="mt-2 text-white">{v.why}</p>
                        <div className="mt-3 flex justify-center">
                          <AudioButton text={v.arabic} label="Écouter le verset" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separateur />

              {/* CARTE — Préparation Complète : étapes A/B/C fixes. Le Poids
                  Mystique de la personne n'apparaît QU'ici (Étape A.1) ;
                  l'Étape A.2 utilise le poids mystique du Nom Divin
                  (divineNameWeight, calculateWeight() — distinct du PM de
                  la personne), jamais le même nombre répété. */}
              <div className="carte rounded-lg">
                <BlocTitle>Préparation Complète</BlocTitle>

                <p className="font-bold mb-2" style={{ color: '#a0aec0' }}>Matériel nécessaire</p>
                <div className="rounded-lg p-4 mb-6" style={{ background: '#0a0f2e', border: '1px solid rgba(21,101,192,0.3)' }}>
                  {result.data.preparation.materials.map((m, i) => (
                    <p key={i} className="text-white text-sm">✅ {m}</p>
                  ))}
                </div>

                <p className="text-or font-bold mb-3">Étape A — Prépare le talisman</p>
                <StepList
                  steps={[
                    `Écrire le Nom Divin ${result.data.divineName.withYa} en arabe. Ton poids mystique est de ${result.PM}.`,
                    `Écrire le verset coranique en arabe, ${divineNameWeight} fois (poids mystique du Nom Divin).`,
                    'Laisser sécher la tablette à l\'ombre.',
                    'Laver la tablette avec 2 litres d\'eau propre et recueillir l\'eau dans un récipient propre.',
                  ]}
                />

                <p className="text-or font-bold mb-3 mt-6">Étape B — Prépare les plantes</p>
                <StepList
                  steps={[
                    'Laver les plantes et préparer les parties indiquées dans les fiches.',
                    result.data.preparation.plantWaterQuantity,
                    'Faire bouillir les plantes pendant 1 heure à feu doux.',
                    'Laisser refroidir, puis filtrer l\'infusion.',
                  ]}
                />

                <p className="text-or font-bold mb-3 mt-6">Étape C — Prépare le mélange final</p>
                <div className="rounded-lg p-5" style={{ border: '2px solid #f5c842' }}>
                  <p className="text-white">
                    {isProtectionWork
                      ? "Mélanger l'eau du talisman avec l'infusion des plantes adaptées. Ne pas ajouter de parfum. Conserver le mélange dans un récipient propre."
                      : "Mélanger l'eau du talisman avec l'infusion des plantes. Ajouter un parfum sans alcool au mélange destiné au lavage. Conserver le mélange dans un récipient propre."}
                  </p>
                </div>

                <div className="rounded-lg p-4 mt-5 text-center" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                  <p className="text-green-400 font-bold text-sm">
                    Utilise le mélange pour te laver de la tête aux pieds pendant 14 jours.
                  </p>
                </div>
              </div>

              <Separateur />

              {/* CARTE — Sacrifice conseillé (remplace "Le Rituel" et
                  "Prière et Invocation", supprimées) — règle PM%4/PM%3
                  déterministe, identique à celle déjà utilisée ailleurs sur
                  le site (voir buildPlantesPrompt). */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifice conseillé</BlocTitle>
                {result.data.sacrifice.isRecommended ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-white text-center">
                    Aucun sacrifice spécifique n'est défini pour ce type de travail.
                  </p>
                )}
              </div>

              {/* Avertissements */}
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

              {/* Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton text={`${result.data.introduction} ${result.data.conclusion}`} label="Écouter le rituel" />
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
