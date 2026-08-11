import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { calculateWeight, GENDER_BONUS, generateSquare, toArabicIndic } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';

type Gender = 'homme' | 'femme';

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface DestinData {
  pm: {
    value: number;
    element: string;
    elementArabic: string;
    elementColor: string;
    explanation: string;
  };
  dominantStar: {
    number: number;
    name: string;
    nameArabic: string;
    planet: string;
    planetArabic: string;
    description: string;
  };
  divineName: {
    arabic: string;
    withYa: string;
    transliteration: string;
    meaning: string;
    repetitions: number;
    reason: string;
  };
  verse: {
    arabic: string;
    surah: string;
    ayah: string;
    meaning: string;
    reason: string;
    repetitions?: number;
  };
  totem: {
    animal: string;
    animalArabic: string;
    qualities: string[];
    description: string;
  };
  character: {
    mainTrait: string;
    description: string;
    strengths: string[];
    weaknesses: string[];
  };
  destiny: {
    lifePath: string;
    mission: string;
    period1: { age: string; description: string };
    period2: { age: string; description: string };
    period3: { age: string; description: string };
  };
  favorableDays: {
    days: string[];
    hours: string;
    explanation: string;
  };
  favorableColors: {
    colors: { name: string; hex: string; meaning: string }[];
    advice: string;
  };
  number: { value: number; meaning: string };
  perfume: {
    name: string;
    description: string;
    availability: string;
  };
  plant: {
    nomFrancais: string;
    nomBambara: string;
    nomScientifique: string;
    lienWikipedia: string;
    partie: string;
    reason: string;
    // Champs détaillés (nouveau format) — optionnels pour rester compatible
    // avec un résultat déjà en cache sessionStorage généré avant ce
    // changement (voir usage? ci-dessous, ancien champ conservé en repli).
    preparation?: string;
    ritualDays?: number;
    ritualTiming?: string;
    ritualAction?: string;
    ritualVisualization?: string;
    ritualFinalInstruction?: string;
    symbolism?: string;
    /** @deprecated ancien champ, remplacé par preparation/ritual* — gardé pour affichage de repli sur un résultat en cache. */
    usage?: string;
  };
  talisman: {
    squareType: string;
    divineName1: { arabic: string; withYa: string; meaning: string };
    divineName2: { arabic: string; withYa: string; meaning: string };
    // Nouveau format — optionnels pour compatibilité avec le cache.
    openingFormula?: string;
    closingFormula?: string;
    bathTiming?: string;
    /** @deprecated anciens champs, remplacés par la réutilisation directe de verse/plant.ritualDays côté affichage. */
    verseForTalisman?: { arabic: string; surah: string; ayah: string };
    writingInstructions?: string;
    ritualDuration?: string;
  };
  sacrifice: {
    isRecommended: boolean;
    reason: string;
    offerings: { item: string; quantity: string; meaning: string }[];
    recipient: string;
    timing: string;
    instructions: string;
  };
  protection: {
    mainDanger: string;
    protectionVerse: { arabic: string; meaning: string };
    advice: string;
  };
  loveLife: {
    profile: string;
    idealPartner: string;
    challenge: string;
  };
  career: {
    domains: string[];
    advice: string;
    talent: string;
  };
  spiritualLevel: {
    level: string;
    description: string;
    nextStep: string;
  };
  conclusion: string;
}

interface CachedResult {
  data: DestinData;
  nameArabic: string;
  motherArabic: string;
  PM: number;
  element: string;
  elementColor: string;
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
  return callGeminiWithRetry('gemini-3.5-flash', prompt, { temperature: 0.1, maxOutputTokens: 200 });
}

// Règle de sacrifice déterministe (PM%4 -> type d'offrande, PM%3 ->
// destinataire) — donnée telle quelle à Gemini comme fait déjà établi,
// plutôt que de lui laisser inventer une catégorie différente à chaque
// génération : "explicite et reproductible", comme demandé.
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

// Répétitions du talisman (Étape 2 : noms divins, Étape 4 : carré magique) —
// calculées en code à partir de calculateWeight() (inchangée, voir
// utils/mystique.ts), pas demandées à Gemini : un LLM ne recalcule pas une
// somme Abjad de façon fiable ni identique d'une génération à l'autre,
// alors qu'une formule explicite en JS l'est par construction ("explicite
// et reproductible", comme demandé). Ramène toute valeur brute > 999 à un
// nombre à 2-3 chiffres par division entière, pour rester un nombre de
// répétitions raisonnable à réciter.
function repetitionsFromAbjad(arabicText: string): number {
  const raw = calculateWeight(arabicText);
  return raw > 999 ? Math.floor(raw / 10) : raw;
}

// Répétitions du carré magique (Étape 4) — dérivées du PM global (celui qui
// sert déjà à générer le carré via generateSquare(PM, ...)), modulo 40 :
// nombre traditionnellement utilisé pour les pratiques répétées dans cette
// tradition. "|| 40" évite un résultat de 0 répétition quand PM est un
// multiple exact de 40.
function squareRepetitionsFromPM(pm: number): number {
  return (pm % 40) || 40;
}

function buildDestinPrompt(params: {
  firstName: string;
  nameArabic: string;
  motherName: string;
  motherArabic: string;
  gender: Gender;
  religion: string;
  PM: number;
  element: string;
}): string {
  const { firstName, nameArabic, motherName, motherArabic, gender, religion, PM, element } = params;
  const remainder4 = PM % 4;
  const remainder3 = ((PM % 3) + 3) % 3;
  return `Tu es un maître de la mystique islamique ouest-africaine, de l'astrologie et de la science des lettres (ilm al-huruf). Tu parles directement à la personne en utilisant "tu" en français. Ton ton est chaleureux, profond, mystique et personnel. Tu écris comme si tu connaissais vraiment cette personne.

Utilise ces valeurs Abjad exactes : ا=1 ب=2 ج=3 د=4 ه=5 ة=5 و=6 ز=7 ح=8 ط=9 ي=10 ك=20 ل=30 م=40 ن=50 ص=60 ع=70 ف=80 ض=90 ق=100 ر=200 س=300 ت=400 ث=500 خ=600 ذ=700 ظ=800 غ=900 ش=1000

Prénom : ${firstName}
Prénom arabe : ${nameArabic}
Prénom mère : ${motherName}
Mère arabe : ${motherArabic}
Sexe : ${gender}
Religion : ${religion}
Poids Mystique (PM) : ${PM}
Élément : ${element}

RÈGLES IMPORTANTES :
- Tous les textes en arabe (versets, noms divins, invocations) DOIVENT être SANS harakat (sans voyelles).
- Adapte les recommandations à la religion : ${religion}.
- Le verset coranique (et celui de la protection) doit être authentique et adapté à l'élément ${element} de cette personne.

RÈGLES SACRIFICE (fait déterministe, à respecter dans "sacrifice") :
PM % 4 = ${remainder4} → type d'offrande imposé : ${offeringFromR4(remainder4)}
PM % 3 = ${remainder3} → destinataire imposé : ${recipientFromR3(remainder3)}
Les offrandes générées dans "sacrifice.offerings" doivent appartenir à cette catégorie, et "sacrifice.recipient" doit correspondre à ce destinataire.

Génère les 17 points mystiques.
Retourne UNIQUEMENT du JSON valide :

{
  "pm": {
    "value": ${PM},
    "element": "Feu/Terre/Air/Eau",
    "elementArabic": "النار/...",
    "elementColor": "#e53935/...",
    "explanation": "3 phrases sur ce que révèle ce PM pour toi."
  },
  "dominantStar": {
    "number": 1,
    "name": "nom de l'étoile",
    "nameArabic": "الاسم",
    "planet": "Saturne/Jupiter...",
    "planetArabic": "زحل/...",
    "description": "3 phrases sur l'influence de cette étoile."
  },
  "divineName": {
    "arabic": "nom SANS ال",
    "withYa": "يا + nom",
    "transliteration": "Ya ...",
    "meaning": "signification",
    "repetitions": 99,
    "reason": "2 phrases sur pourquoi ce nom divin pour toi."
  },
  "verse": {
    "arabic": "verset SANS harakat",
    "surah": "nom sourate en français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour toi.",
    "repetitions": 33
  },
  "totem": {
    "animal": "nom animal",
    "animalArabic": "الاسم",
    "qualities": ["qualité 1","qualité 2","qualité 3"],
    "description": "2 phrases sur ce que ton totem révèle."
  },
  "character": {
    "mainTrait": "trait principal",
    "description": "3 phrases sur ta personnalité profonde.",
    "strengths": ["force 1","force 2","force 3","force 4"],
    "weaknesses": ["faiblesse 1","faiblesse 2","faiblesse 3"]
  },
  "destiny": {
    "lifePath": "chemin de vie",
    "mission": "2-3 phrases sur ta mission ici-bas.",
    "period1": { "age": "0-20 ans", "description": "2 phrases." },
    "period2": { "age": "20-40 ans", "description": "2 phrases." },
    "period3": { "age": "40 ans et plus", "description": "2 phrases." }
  },
  "favorableDays": {
    "days": ["Lundi","Jeudi"],
    "hours": "6h-10h / 14h-18h",
    "explanation": "2 phrases sur pourquoi ces jours et heures."
  },
  "favorableColors": {
    "colors": [
      { "name": "Or", "hex": "#f5c842", "meaning": "Richesse spirituelle" },
      { "name": "Blanc", "hex": "#ffffff", "meaning": "Pureté et paix" }
    ],
    "advice": "1 phrase sur comment utiliser ces couleurs."
  },
  "number": { "value": 7, "meaning": "2 phrases sur la signification de ce nombre." },
  "perfume": {
    "name": "nom du parfum",
    "description": "1 phrase sur ce parfum et son usage spirituel.",
    "availability": "où trouver"
  },
  "plant": {
    "nomFrancais": "nom français",
    "nomBambara": "nom bambara",
    "nomScientifique": "nom scientifique",
    "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
    "partie": "feuilles/écorce...",
    "reason": "Pourquoi cette plante pour toi.",
    "preparation": "Comment préparer la décoction : quantité de plante, quantité d'eau, temps d'ébullition.",
    "ritualDays": 7,
    "ritualTiming": "Jour(s) précis PARMI les jours favorables de favorableDays.days ci-dessus, et moment (matin/soir).",
    "ritualAction": "Quoi faire avec l'eau refroidie (ex: se laver le corps/le visage avec).",
    "ritualVisualization": "Visualisation mentale à faire pendant le rituel.",
    "ritualFinalInstruction": "Consigne finale après le rituel (ex: ne pas s'essuyer, laisser sécher naturellement).",
    "symbolism": "Court paragraphe expliquant le symbolisme de cette plante en lien avec l'élément ${element}."
  },
  "talisman": {
    "squareType": "3x3/4x4/5x5",
    "divineName1": { "arabic": "nom SANS ال", "withYa": "يا + nom", "meaning": "signification" },
    "divineName2": { "arabic": "nom SANS ال", "withYa": "يا + nom", "meaning": "signification" },
    "openingFormula": "Formule d'ouverture du rituel, adaptée à la religion ${religion} (ex: Bismillah pour l'Islam).",
    "closingFormula": "Formule de clôture du rituel, adaptée à la religion ${religion} (ex: Al-Hamdulillah pour l'Islam).",
    "bathTiming": "Moment idéal du bain rituel (ex: avant le lever du soleil, ou après la prière de Fajr pour les musulmans — adapte selon ${religion})."
  },
  "sacrifice": {
    "isRecommended": true,
    "reason": "Pourquoi ce sacrifice.",
    "offerings": [
      { "item": "colas blanches", "quantity": "7", "meaning": "signification" },
      { "item": "deuxième offrande", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner",
    "timing": "Quel jour et heure",
    "instructions": "Instructions complètes du sacrifice."
  },
  "protection": {
    "mainDanger": "danger principal à éviter dans ta vie.",
    "protectionVerse": { "arabic": "verset SANS harakat", "meaning": "traduction" },
    "advice": "2-3 phrases de conseils de protection spirituelle."
  },
  "loveLife": {
    "profile": "2 phrases sur ton profil amoureux.",
    "idealPartner": "description du partenaire idéal pour toi.",
    "challenge": "principal défi dans tes relations."
  },
  "career": {
    "domains": ["domaine 1","domaine 2","domaine 3"],
    "advice": "2-3 phrases sur ta voie professionnelle idéale.",
    "talent": "ton talent principal."
  },
  "spiritualLevel": {
    "level": "Débutant/Intermédiaire/Avancé/Maître",
    "description": "2 phrases sur ton niveau spirituel actuel.",
    "nextStep": "ce que tu dois faire pour progresser spirituellement."
  },
  "conclusion": "Message final chaleureux adressé directement à ${firstName}. 3-4 phrases encourageantes et profondes. Termine par BarakAllahu fik."
}

RÈGLES NOMS DIVINS :
Toujours SANS ال devant le nom. Toujours avec يا pour affichage.
Correct : يا ودود — Incorrect : يا الودود

RÈGLES PLANTE (point "plant") :
Uniquement plantes africaines réelles. Toujours nom scientifique exact. Toujours lien Wikipedia valide.
"ritualDays" doit être un nombre spirituellement cohérent (ex: 3, 7, 9, 40) — jamais choisi au hasard.
"ritualTiming" doit obligatoirement citer un ou plusieurs jours listés dans "favorableDays.days" ci-dessus, jamais un jour non listé là.

RÈGLES TALISMAN (point "talisman") :
Ce talisman est utilisé sur une tablette en bois avec une encre naturelle (safran ou charbon) : ne le répète pas dans "talisman", c'est déjà su.
Les 2 noms divins ("divineName1"/"divineName2") sont ceux gravés sur le talisman — choisis-les en cohérence avec le profil de la personne (peuvent être identiques ou différents du point "divineName" plus haut, qui reste un point à part).
"openingFormula"/"closingFormula"/"bathTiming" doivent être courts (une phrase maximum chacun) et réellement adaptés à la religion ${religion}, pas une formule générique si une religion précise est indiquée.`;
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

export function DestinPage() {
  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [religion, setReligion] = useState('Islam');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !firstName.trim() || !motherName.trim();

  async function handleGenerate() {
    setError(null);

    const cacheKey = `destin_${firstName}_${motherName}_${gender}`;
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

      const mod = PM % 4;
      const element = mod === 1 ? 'Feu' : mod === 2 ? 'Terre' : mod === 3 ? 'Air' : 'Eau';
      const elementColor = mod === 1 ? '#e53935' : mod === 2 ? '#795548' : mod === 3 ? '#64b5f6' : '#1565c0';

      const prompt = buildDestinPrompt({
        firstName,
        nameArabic: nameResult.arabic,
        motherName,
        motherArabic: motherResult.arabic,
        gender,
        religion,
        PM,
        element,
      });

      const data: DestinData = await callGeminiWithRetry('gemini-3.5-flash', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3000,
      });

      const newResult: CachedResult = {
        data,
        nameArabic: nameResult.arabic,
        motherArabic: motherResult.arabic,
        PM,
        element,
        elementColor,
      };

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'destin',
            p_description: 'Consultation Destin — ' + firstName,
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

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Destin de ' + firstName,
        content: data,
        page_source: 'destin',
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
    setReligion('Islam');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('destin-content');
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

    pdf.save(`destin-${firstName}-secretdivin.pdf`);
  }

  const squareSize = result
    ? result.data.talisman.squareType === '3x3'
      ? 3
      : result.data.talisman.squareType === '4x4'
      ? 4
      : 5
    : 3;
  const talismanCells = result ? generateSquare(result.PM, squareSize) : [];

  // Cohérence garantie par construction plutôt que par instruction au LLM :
  // l'Étape 3 réutilise directement verse.repetitions (Point Verset) et
  // l'Étape 6 réutilise directement plant.ritualDays (Point Plante), au
  // lieu de demander à Gemini de générer deux fois la même valeur dans deux
  // objets JSON différents — un LLM peut désobéir à "doit être identique"
  // d'une génération à l'autre, une seule source de vérité ne peut pas.
  const divineName1Reps = result ? repetitionsFromAbjad(result.data.talisman.divineName1.arabic) : 0;
  const divineName2Reps = result ? repetitionsFromAbjad(result.data.talisman.divineName2.arabic) : 0;
  const verseReps = result?.data.verse.repetitions ?? 33;
  const squareReps = result ? squareRepetitionsFromPM(result.PM) : 0;
  // Repli sur l'ancien format "ritualDuration" (ex: "7 jours") si un
  // résultat en cache sessionStorage a été généré avant ce changement et
  // n'a pas encore le nouveau champ plant.ritualDays.
  const plantDays =
    result?.data.plant.ritualDays ??
    (result?.data.talisman.ritualDuration ? parseInt(result.data.talisman.ritualDuration, 10) || 7 : 7);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Ton Destin Complet</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Découvre les 17 points mystiques
          <br />
          de ton profil spirituel complet
        </p>

        <Separateur />

        <div className="flex justify-center mb-4">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
                Ta religion
              </label>
              <select
                value={religion}
                onChange={(e) => setReligion(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                <option>Islam</option>
                <option>Christianisme</option>
                <option>Traditionnel africain</option>
                <option>Autre</option>
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              RÉVÉLER MON DESTIN COMPLET
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#a0aec0' }}>Révélation de ton destin en cours...</p>
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
            <div id="destin-content">
              <Separateur />

              {/* BLOC 1 — Résumé identité */}
              <div
                className="rounded-lg text-center p-8"
                style={{ background: 'linear-gradient(135deg, #0d1545, #0a0f2e)', border: '1px solid rgba(245,200,66,0.2)' }}
              >
                <p className="text-or font-bold text-[2rem]">{firstName}</p>
                <p className="arabic text-or text-[1.8em] mt-2">
                  {result.nameArabic} {gender === 'homme' ? 'بن' : 'بنت'} {result.motherArabic}
                </p>
                <p className="text-white mt-3">
                  PM : {result.PM} — {result.element}
                </p>
              </div>

              <Separateur />

              {/* BLOC 2 — PM et Élément */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold text-[3rem]">{result.PM}</p>
                  <p className="mt-2 text-white">{result.data.pm.explanation}</p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="font-bold text-[2rem]" style={{ color: result.elementColor }}>
                    {result.element}
                  </p>
                  <p className="mt-2 text-white">{result.data.pm.explanation}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Étoile Dominante */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Étoile Dominante</BlocTitle>
                <p className="text-or font-bold">
                  {result.data.dominantStar.name}{' '}
                  <span className="arabic">{result.data.dominantStar.nameArabic}</span>
                </p>
                <p className="mt-2 text-white">
                  Planète : {result.data.dominantStar.planet}{' '}
                  <span className="arabic">{result.data.dominantStar.planetArabic}</span>
                </p>
                <p className="mt-3 text-white">{result.data.dominantStar.description}</p>
              </div>

              <Separateur />

              {/* BLOC 4 — Nom Divin */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0f2e', border: '1px solid #f5c842' }}>
                <BlocTitle>Ton Nom Divin</BlocTitle>
                <p className="arabic text-or text-[2.5em]">{result.data.divineName.withYa}</p>
                <p className="text-white mt-3">
                  {result.data.divineName.transliteration} / {result.data.divineName.meaning}
                </p>
                <div className="flex justify-center mt-4">
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.data.divineName.repetitions} fois
                  </span>
                </div>
                <p className="italic mt-4" style={{ color: '#a0aec0' }}>
                  {result.data.divineName.reason}
                </p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.divineName.withYa} label="Écouter le nom divin" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 5 — Verset Coranique */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Verset Coranique</BlocTitle>
                <p className="arabic text-or text-[1.8em]">{result.data.verse.arabic}</p>
                <p className="mt-3 text-white">
                  Sourate {result.data.verse.surah} — Verset {result.data.verse.ayah}
                </p>
                <p className="italic mt-2" style={{ color: '#a0aec0' }}>
                  {result.data.verse.meaning}
                </p>
                {result.data.verse.repetitions && (
                  <div className="flex justify-center mt-3">
                    <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                      À réciter {result.data.verse.repetitions} fois
                    </span>
                  </div>
                )}
                <p className="mt-2 text-white">{result.data.verse.reason}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.verse.arabic} label="Écouter le verset" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Totem Animal */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Ton Totem Animal</BlocTitle>
                <p className="text-white font-bold">
                  {result.data.totem.animal} <span className="arabic text-or">{result.data.totem.animalArabic}</span>
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {result.data.totem.qualities.map((q, i) => (
                    <span key={i} className="text-or text-sm">
                      ✅ {q}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-white">{result.data.totem.description}</p>
              </div>

              <Separateur />

              {/* BLOC 7 — Caractère et Personnalité */}
              <div className="carte rounded-lg">
                <BlocTitle>Caractère et Personnalité</BlocTitle>
                <p className="text-or font-bold italic text-center">"{result.data.character.mainTrait}"</p>
                <p className="mt-3 text-white text-center">{result.data.character.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  <div>
                    <p className="font-bold mb-2" style={{ color: '#a0aec0' }}>
                      Forces
                    </p>
                    {result.data.character.strengths.map((s, i) => (
                      <p key={i} className="text-green-400 text-sm">
                        ✓ {s}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="font-bold mb-2" style={{ color: '#a0aec0' }}>
                      Faiblesses
                    </p>
                    {result.data.character.weaknesses.map((w, i) => (
                      <p key={i} className="text-orange-400 text-sm">
                        → {w}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC 8 — Destin et Mission */}
              <div className="carte rounded-lg">
                <BlocTitle>Destin et Mission</BlocTitle>
                <p className="text-white text-center">{result.data.destiny.mission}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  {[result.data.destiny.period1, result.data.destiny.period2, result.data.destiny.period3].map(
                    (period, i) => (
                      <div key={i} className="text-center">
                        <p className="text-or font-bold">{period.age}</p>
                        <p className="text-sm mt-1 text-white">{period.description}</p>
                      </div>
                    )
                  )}
                </div>
              </div>

              <Separateur />

              {/* BLOC 9 — Jours et Heures Favorables */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Jours et Heures Favorables</BlocTitle>
                <div className="flex flex-wrap justify-center gap-2">
                  {result.data.favorableDays.days.map((d, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                      {d}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-white">Heures : {result.data.favorableDays.hours}</p>
                <p className="mt-2" style={{ color: '#a0aec0' }}>
                  {result.data.favorableDays.explanation}
                </p>
              </div>

              <Separateur />

              {/* BLOC 10 — Couleurs Favorables */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Couleurs Favorables</BlocTitle>
                <div className="flex flex-wrap justify-center gap-4">
                  {result.data.favorableColors.colors.map((c, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div
                        className="w-10 h-10 rounded-full"
                        style={{ background: c.hex, border: '1px solid rgba(255,255,255,0.3)' }}
                      />
                      <p className="text-white text-sm font-bold">{c.name}</p>
                      <p className="text-xs" style={{ color: '#a0aec0' }}>
                        {c.meaning}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4" style={{ color: '#a0aec0' }}>
                  {result.data.favorableColors.advice}
                </p>
              </div>

              <Separateur />

              {/* BLOC 11 — Nombre Mystique */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Nombre Mystique</BlocTitle>
                <p className="text-or font-bold text-[4rem]">{result.data.number.value}</p>
                <p className="mt-2 text-white">{result.data.number.meaning}</p>
              </div>

              <Separateur />

              {/* BLOC 12 — Parfum */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Parfum</BlocTitle>
                <p className="text-or font-bold">{result.data.perfume.name}</p>
                <p className="mt-2 text-white">{result.data.perfume.description}</p>
                <p className="mt-1" style={{ color: '#a0aec0' }}>
                  {result.data.perfume.availability}
                </p>
              </div>

              <Separateur />

              {/* BLOC 13 — Plante Mystique */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #f5c842' }}>
                <BlocTitle>Plante Mystique</BlocTitle>
                <p className="text-white font-bold">
                  {result.data.plant.nomFrancais} / {result.data.plant.nomBambara} /{' '}
                  <span className="italic">{result.data.plant.nomScientifique}</span>
                </p>
                <p className="mt-2 text-white">Partie : {result.data.plant.partie}</p>

                {result.data.plant.preparation ? (
                  <>
                    <p className="text-or font-bold mt-5">Préparation</p>
                    <p className="mt-1 text-white">{result.data.plant.preparation}</p>

                    <p className="text-or font-bold mt-5">Rituel ({plantDays} jours)</p>
                    <div className="flex flex-col gap-1 mt-1 text-white">
                      {result.data.plant.ritualTiming && <p>{result.data.plant.ritualTiming}</p>}
                      {result.data.plant.ritualAction && <p>{result.data.plant.ritualAction}</p>}
                      {result.data.plant.ritualVisualization && <p className="italic">{result.data.plant.ritualVisualization}</p>}
                      {result.data.plant.ritualFinalInstruction && (
                        <p style={{ color: '#a0aec0' }}>{result.data.plant.ritualFinalInstruction}</p>
                      )}
                    </div>

                    {result.data.plant.symbolism && (
                      <p className="mt-4 italic" style={{ color: '#a0aec0' }}>
                        {result.data.plant.symbolism}
                      </p>
                    )}
                  </>
                ) : (
                  // Repli : résultat en cache généré avant l'ajout de la structure
                  // préparation/rituel détaillée — on affiche l'ancien champ libre.
                  <p className="mt-2 text-white">Usage : {result.data.plant.usage}</p>
                )}

                <p className="mt-2" style={{ color: '#a0aec0' }}>
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

              {/* BLOC 14 — Talisman Personnel */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Talisman Personnel</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div>
                    <p className="arabic text-or text-[1.6em]">{result.data.talisman.divineName1.withYa}</p>
                    <p className="text-sm mt-1 text-white">{result.data.talisman.divineName1.meaning}</p>
                  </div>
                  <div>
                    <p className="arabic text-or text-[1.6em]">{result.data.talisman.divineName2.withYa}</p>
                    <p className="text-sm mt-1 text-white">{result.data.talisman.divineName2.meaning}</p>
                  </div>
                </div>

                <div
                  className="mx-auto mt-2"
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
                      className="arabic flex items-center justify-center font-bold"
                      style={{
                        width: 44,
                        height: 44,
                        background: '#ffffff',
                        border: '2px solid #f5c842',
                        color: '#0d1545',
                      }}
                    >
                      {toArabicIndic(v)}
                    </div>
                  ))}
                </div>

                {/* Comment utiliser ton talisman — 6 étapes fixes ; le texte de
                    chaque étape est composé ici plutôt que généré par Gemini
                    (fiabilité + cohérence garantie avec les Points Verset/
                    Plante ci-dessus, voir les commentaires sur divineName1Reps/
                    verseReps/plantDays plus haut dans ce fichier). Repli sur
                    l'ancien writingInstructions/ritualDuration libres si le
                    résultat vient du cache sessionStorage (généré avant ce
                    changement). */}
                {result.data.talisman.openingFormula ? (
                  <div className="mt-6 flex flex-col gap-4 text-left">
                    <p className="text-or font-bold text-center">Comment utiliser ton talisman ?</p>

                    <div>
                      <p className="text-white"><span className="text-or font-bold">Étape 1 — </span>Prépare une tablette en bois propre et une encre naturelle (safran ou charbon).</p>
                    </div>

                    <div>
                      <p className="text-white"><span className="text-or font-bold">Étape 2 — </span>Écris les 2 Noms de Dieu ci-dessus sur la tablette.</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                          {result.data.talisman.divineName1.withYa} — {divineName1Reps} fois
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                          {result.data.talisman.divineName2.withYa} — {divineName2Reps} fois
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-white"><span className="text-or font-bold">Étape 3 — </span>Écris le Verset Coranique du Point Verset ci-dessus.</p>
                      <div className="flex mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">{verseReps} fois</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-white"><span className="text-or font-bold">Étape 4 — </span>Reproduis le carré magique ci-dessus (en chiffres français).</p>
                      <div className="flex mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">{squareReps} fois</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-white">
                        <span className="text-or font-bold">Étape 5 — </span>
                        Prépare une décoction de {result.data.plant.nomFrancais}, plonges-y la tablette encore chaude, puis laisse infuser et refroidir.
                      </p>
                    </div>

                    <div>
                      <p className="text-white">
                        <span className="text-or font-bold">Étape 6 — </span>
                        Lave-toi avec cette eau pendant {plantDays} jours consécutifs
                        {result.data.talisman.bathTiming ? `, ${result.data.talisman.bathTiming}` : ''}.
                        {result.data.talisman.openingFormula && result.data.talisman.closingFormula
                          ? ` Commence par « ${result.data.talisman.openingFormula} », termine par « ${result.data.talisman.closingFormula} ».`
                          : ''}
                      </p>
                      <div className="flex mt-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">{plantDays} jours</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-4 text-white">{result.data.talisman.writingInstructions}</p>
                    <div className="flex justify-center mt-3">
                      <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                        Rituel : {result.data.talisman.ritualDuration}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <Separateur />

              {/* BLOC 15 — Sacrifice */}
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
                <p className="mt-3 text-sm" style={{ color: '#a0aec0' }}>
                  À donner à : {result.data.sacrifice.recipient}
                </p>
                <p className="text-sm" style={{ color: '#a0aec0' }}>
                  Moment : {result.data.sacrifice.timing}
                </p>
                <p className="mt-3 text-white">{result.data.sacrifice.instructions}</p>
              </div>

              <Separateur />

              {/* BLOC 16 — Protection Spirituelle */}
              <div className="carte rounded-lg text-center" style={{ border: '1px solid #8b0000' }}>
                <BlocTitle>Protection Spirituelle</BlocTitle>
                <p className="text-white">{result.data.protection.mainDanger}</p>
                <p className="arabic text-or text-[1.4em] mt-3">{result.data.protection.protectionVerse.arabic}</p>
                <p className="italic mt-1" style={{ color: '#a0aec0' }}>
                  {result.data.protection.protectionVerse.meaning}
                </p>
                <p className="mt-3 text-white">{result.data.protection.advice}</p>
              </div>

              <Separateur />

              {/* BLOC 17 — Amour / Carrière / Spiritualité */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold mb-2">Amour</p>
                  <p className="text-sm text-white">{result.data.loveLife.profile}</p>
                  <p className="text-sm mt-2 text-white">{result.data.loveLife.idealPartner}</p>
                  <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>
                    {result.data.loveLife.challenge}
                  </p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold mb-2">Carrière</p>
                  <div className="flex flex-wrap justify-center gap-2 mb-2">
                    {result.data.career.domains.map((d, i) => (
                      <span key={i} className="px-2 py-1 rounded text-xs border border-or text-or">
                        {d}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-white">{result.data.career.advice}</p>
                  <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>
                    {result.data.career.talent}
                  </p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold mb-2">Spiritualité</p>
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    {result.data.spiritualLevel.level}
                  </span>
                  <p className="text-sm mt-3 text-white">{result.data.spiritualLevel.description}</p>
                  <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>
                    {result.data.spiritualLevel.nextStep}
                  </p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 18 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            {/* BOUTONS FINAUX */}
            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.data.pm.explanation} ${result.data.character.description} ${result.data.destiny.mission} ${result.data.conclusion}`}
                label="Écouter mon destin complet"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger mon destin en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Nouvelle consultation
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Destin" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
