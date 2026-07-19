import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { calculateWeight, GENDER_BONUS, generateSquare, JOURS_DATA } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';

type Gender = 'homme' | 'femme';

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface JoursData {
  dayProfile: {
    title: string;
    globalMessage: string;
    planetInfluence: string;
    planetArabic: string;
  };
  character: {
    mainTrait: string;
    description: string;
    strengths: string[];
    weaknesses: string[];
    deepNature: string;
  };
  numerology: {
    pmPersonal: number;
    pmDay: number;
    pmTotal: number;
    element: string;
    elementArabic: string;
    numberMeaning: string;
  };
  divineName: {
    arabic: string;
    withYa: string;
    transliteration: string;
    meaning: string;
    repetitions: number;
    bestTime: string;
    reason: string;
  };
  verse: {
    arabic: string;
    surah: string;
    ayah: string;
    meaning: string;
    reason: string;
  };
  favorablePeriods: {
    dailyHours: { period: string; hours: string; activity: string }[];
    favorableDays: string[];
    unfavorableDays: string[];
    explanation: string;
  };
  talisman: {
    squareType: string;
    divineName: { arabic: string; withYa: string; meaning: string };
    verseForTalisman: { arabic: string; surah: string; ayah: string };
    writingInstructions: string;
    ritualDuration: string;
    bestDayToStart: string;
  };
  invocation: {
    arabicWithHarakat: string;
    meaning: string;
    repetitions: number;
    when: string;
  };
  plant: {
    nomFrancais: string;
    nomBambara: string;
    nomScientifique: string;
    lienWikipedia: string;
    partie: string;
    usage: string;
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
  dailyAdvice: string;
  conclusion: string;
}

interface CachedResult {
  data: JoursData;
  PM: number;
  PMtotal: number;
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

function buildJoursPrompt(params: {
  firstName: string;
  nameArabic: string;
  motherName: string;
  motherArabic: string;
  gender: Gender;
  PM: number;
  selectedDay: string;
  planete: string;
  poids: number;
  PMtotal: number;
}): string {
  const { firstName, nameArabic, motherName, motherArabic, gender, PM, selectedDay, planete, poids, PMtotal } = params;
  return `Tu es un maître de la mystique islamique ouest-africaine. Tu parles avec 'tu' en français. Ton ton est profond et rassurant.

Prénom : ${firstName}
Prénom arabe : ${nameArabic}
Mère : ${motherName}
Mère arabe : ${motherArabic}
Sexe : ${gender}
PM personnel : ${PM}
Jour de naissance : ${selectedDay}
Planète du jour : ${planete}
Poids du jour : ${poids}
PM total (PM + poids jour) : ${PMtotal}

Retourne UNIQUEMENT du JSON valide :

{
  "dayProfile": {
    "title": "Titre évocateur pour ce jour + planète",
    "globalMessage": "3 phrases sur ce que signifie être né un ${selectedDay} selon la mystique islamique.",
    "planetInfluence": "2-3 phrases sur l'influence de ${planete} sur ta personnalité et ton destin.",
    "planetArabic": "${JOURS_DATA[selectedDay].planeteArabe}"
  },
  "character": {
    "mainTrait": "trait dominant",
    "description": "3 phrases sur la personnalité des natifs du ${selectedDay}.",
    "strengths": ["force 1","force 2","force 3","force 4"],
    "weaknesses": ["faiblesse 1","faiblesse 2","faiblesse 3"],
    "deepNature": "2 phrases sur la nature profonde de cette combinaison prénom + jour."
  },
  "numerology": {
    "pmPersonal": ${PM},
    "pmDay": ${poids},
    "pmTotal": ${PMtotal},
    "element": "Feu/Terre/Air/Eau",
    "elementArabic": "النار/...",
    "numberMeaning": "2 phrases sur la signification du PM total."
  },
  "divineName": {
    "arabic": "nom SANS ال",
    "withYa": "يا + nom",
    "transliteration": "Ya ...",
    "meaning": "signification",
    "repetitions": 99,
    "bestTime": "Après [prière]",
    "reason": "2 phrases sur pourquoi ce nom pour ce jour et ce PM."
  },
  "verse": {
    "arabic": "verset SANS harakat",
    "surah": "nom sourate français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour ce jour."
  },
  "favorablePeriods": {
    "dailyHours": [
      { "period": "Matin", "hours": "6h - 10h", "activity": "Ce qu'il faut faire pendant ces heures." },
      { "period": "Après-midi", "hours": "14h - 17h", "activity": "Ce qu'il faut faire pendant ces heures." }
    ],
    "favorableDays": ["Lundi","Jeudi"],
    "unfavorableDays": ["Mardi"],
    "explanation": "2 phrases sur les périodes favorables."
  },
  "talisman": {
    "squareType": "3x3",
    "divineName": { "arabic": "nom SANS ال", "withYa": "يا + nom", "meaning": "signification" },
    "verseForTalisman": { "arabic": "verset SANS harakat", "surah": "sourate", "ayah": "numéro" },
    "writingInstructions": "Instructions pour écrire le talisman du jour.",
    "ritualDuration": "7 jours",
    "bestDayToStart": "${selectedDay} matin"
  },
  "invocation": {
    "arabicWithHarakat": "invocation AVEC harakat contenant يا + nom divin + prénom arabe + mère arabe",
    "meaning": "traduction française",
    "repetitions": 99,
    "when": "Quand réciter"
  },
  "plant": {
    "nomFrancais": "nom français",
    "nomBambara": "nom bambara",
    "nomScientifique": "nom scientifique exact",
    "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
    "partie": "partie utilisée",
    "usage": "comment utiliser",
    "reason": "Pourquoi cette plante pour ce jour et cet objectif."
  },
  "sacrifice": {
    "isRecommended": true,
    "reason": "Pourquoi ce sacrifice.",
    "offerings": [
      { "item": "offrande 1", "quantity": "nombre", "meaning": "signification" },
      { "item": "offrande 2", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner",
    "timing": "${selectedDay} matin",
    "instructions": "Instructions complètes du sacrifice."
  },
  "dailyAdvice": "3 phrases de conseil pratique pour tirer le meilleur parti de ton énergie du ${selectedDay}. Adressé directement à ${firstName}.",
  "conclusion": "Message final chaleureux adressé à ${firstName}. 3 phrases encourageantes. Termine par BarakAllahu fik."
}

RÈGLES NOMS DIVINS :
Sans ال, avec يا. Correct : يا ودود — Incorrect : يا الودود`;
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

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function JoursPage() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !firstName.trim() || !motherName.trim();

  async function handleGenerate() {
    if (!selectedDay) return;
    setError(null);

    const cacheKey = `jours_${selectedDay}_${firstName}_${motherName}_${gender}`;
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

      const jourData = JOURS_DATA[selectedDay];
      const PMtotal = PM + jourData.poids;

      const prompt = buildJoursPrompt({
        firstName,
        nameArabic: nameResult.arabic,
        motherName,
        motherArabic: motherResult.arabic,
        gender,
        PM,
        selectedDay,
        planete: jourData.planete,
        poids: jourData.poids,
        PMtotal,
      });

      const data: JoursData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3000,
      });

      const newResult: CachedResult = { data, PM, PMtotal };

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'jours',
            p_description: 'Jours — ' + firstName + ' — ' + selectedDay,
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
        title: 'Jour ' + selectedDay + ' — ' + firstName,
        content: data,
        page_source: 'jours',
      });
    } catch {
      setError('Erreur de connexion. Vérifie ta clé API et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSelectedDay(null);
    setFirstName('');
    setMotherName('');
    setGender('homme');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('jours-content');
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

    pdf.save(`jours-${firstName}-${selectedDay}-secretdivin.pdf`);
  }

  const squareSize = 3;
  const talismanCells = result ? generateSquare(result.PMtotal, squareSize) : [];

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Jours de Naissance</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvre les secrets spirituels de ton
          <br />
          jour de naissance selon la tradition
          <br />
          islamique africaine
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {!result && (
          <>
            {/* SECTION 2 — SÉLECTEUR DE JOUR */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-8">
              {DAYS.map((day) => {
                const jd = JOURS_DATA[day];
                const isSelected = selectedDay === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className="rounded-lg p-4 text-center transition"
                    style={{
                      background: '#111a55',
                      border: isSelected ? `2px solid ${jd.couleurBordure}` : '1px solid rgba(37,99,235,0.1)',
                    }}
                  >
                    <p className={`font-bold ${isSelected ? 'text-or' : 'text-white'}`}>{day}</p>
                    <span
                      className="inline-block mt-2 px-2 py-1 rounded-full text-xs font-bold"
                      style={{ background: isSelected ? jd.couleurBordure : 'transparent', color: isSelected ? '#fff' : '#b0b8d4' }}
                    >
                      {jd.planete}
                    </span>
                    <p className="text-or text-xs mt-2">Poids : {jd.poids}</p>
                  </button>
                );
              })}
            </div>

            {/* SECTION 3 — FORMULAIRE */}
            {selectedDay && (
              <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
                <div className="text-center">
                  <p className="text-or font-bold">Jour sélectionné : {selectedDay}</p>
                  <p className="text-or">
                    Planète : {JOURS_DATA[selectedDay].planete} — Poids du jour : {JOURS_DATA[selectedDay].poids}
                  </p>
                </div>

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

                <button
                  onClick={handleGenerate}
                  disabled={isDisabled || loading}
                  className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  RÉVÉLER LES SECRETS DE MON JOUR
                </button>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#b0b8d4' }}>Révélation des secrets de ton jour...</p>
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

        {result && selectedDay && (
          <FadeIn>
            <div id="jours-content">
              <Separateur />

              {/* BLOC 1 — En-tête du profil */}
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-[2rem]">{firstName}</p>
                <p className="text-white mt-2">Né(e) un {selectedDay}</p>
                <p className="font-bold mt-1" style={{ color: JOURS_DATA[selectedDay].couleurBordure }}>
                  {JOURS_DATA[selectedDay].planete}{' '}
                  <span className="arabic">{JOURS_DATA[selectedDay].planeteArabe}</span>
                </p>
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>
                  PM personnel : {result.PM} | Poids {selectedDay} : {JOURS_DATA[selectedDay].poids} | PM total :{' '}
                  {result.PMtotal}
                </p>
              </div>

              <Separateur />

              {/* BLOC 2 — Profil du Jour */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>{result.data.dayProfile.title}</BlocTitle>
                <p className="text-white">{result.data.dayProfile.globalMessage}</p>
                <p className="mt-3 text-white">{result.data.dayProfile.planetInfluence}</p>
              </div>

              <Separateur />

              {/* BLOC 3 — Numérologie */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="carte rounded-lg text-center">
                  <p className="font-bold" style={{ color: '#b0b8d4' }}>
                    PM Personnel
                  </p>
                  <p className="text-or font-bold text-[2rem] mt-2">{result.PM}</p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="font-bold" style={{ color: '#b0b8d4' }}>
                    Poids {selectedDay}
                  </p>
                  <p className="text-or font-bold text-[2rem] mt-2">{JOURS_DATA[selectedDay].poids}</p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="font-bold" style={{ color: '#b0b8d4' }}>
                    PM Total
                  </p>
                  <p className="text-or font-bold text-[2rem] mt-2">{result.PMtotal}</p>
                  <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                    {result.data.numerology.element}
                  </span>
                </div>
              </div>
              <p className="text-center mt-4 text-white">{result.data.numerology.numberMeaning}</p>

              <Separateur />

              {/* BLOC 4 — Personnalité */}
              <div className="carte rounded-lg">
                <BlocTitle>Ta Personnalité — {result.data.character.mainTrait}</BlocTitle>
                <p className="text-white text-center">{result.data.character.description}</p>
                <p className="text-white text-center mt-2">{result.data.character.deepNature}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  <div>
                    <p className="font-bold mb-2" style={{ color: '#b0b8d4' }}>
                      Forces
                    </p>
                    {result.data.character.strengths.map((s, i) => (
                      <p key={i} className="text-green-400 text-sm">
                        ✓ {s}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="font-bold mb-2" style={{ color: '#b0b8d4' }}>
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

              {/* BLOC 5 — Nom Divin */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
                <BlocTitle>Ton Nom Divin</BlocTitle>
                <p className="arabic text-or text-[2.5em]">{result.data.divineName.withYa}</p>
                <div className="flex justify-center mt-4">
                  <span className="px-4 py-2 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.data.divineName.repetitions} fois
                  </span>
                </div>
                <p className="mt-3 text-white">Meilleur moment : {result.data.divineName.bestTime}</p>
                <p className="mt-2" style={{ color: '#b0b8d4' }}>
                  {result.data.divineName.reason}
                </p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.divineName.withYa} label="Écouter le nom divin" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Verset Coranique */}
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
              </div>

              <Separateur />

              {/* BLOC 7 — Périodes Favorables */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Périodes Favorables</BlocTitle>
                <div className="flex flex-col gap-2">
                  {result.data.favorablePeriods.dailyHours.map((h, i) => (
                    <p key={i} className="text-white text-sm">
                      {h.period} — {h.hours} → {h.activity}
                    </p>
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {result.data.favorablePeriods.favorableDays.map((d, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                      {d}
                    </span>
                  ))}
                  {result.data.favorablePeriods.unfavorableDays.map((d, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#3a1b1b', color: '#e53935' }}>
                      {d}
                    </span>
                  ))}
                </div>
                <p className="mt-4" style={{ color: '#b0b8d4' }}>
                  {result.data.favorablePeriods.explanation}
                </p>
              </div>

              <Separateur />

              {/* BLOC 8 — Talisman du Jour */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Talisman du Jour</BlocTitle>
                <p className="arabic text-or text-[1.8em]">{result.data.talisman.divineName.withYa}</p>
                <p className="text-sm mt-1 text-white">{result.data.talisman.divineName.meaning}</p>

                <p className="arabic text-or text-[1.4em] mt-4">{result.data.talisman.verseForTalisman.arabic}</p>
                <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>
                  Sourate {result.data.talisman.verseForTalisman.surah} — Verset{' '}
                  {result.data.talisman.verseForTalisman.ayah}
                </p>

                <div
                  className="mx-auto mt-5"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${squareSize}, 56px)`,
                    gap: '2px',
                    justifyContent: 'center',
                  }}
                >
                  {talismanCells.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center font-bold"
                      style={{
                        width: 56,
                        height: 56,
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
                    ✓ Somme = {result.PMtotal}
                  </span>
                </div>

                <p className="mt-4 text-white">{result.data.talisman.writingInstructions}</p>

                <div className="flex justify-center mt-3">
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    Commencer un {result.data.talisman.bestDayToStart}
                  </span>
                </div>
              </div>

              <Separateur />

              {/* BLOC 9 — Invocation */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Invocation</BlocTitle>
                <p className="arabic text-or text-[1.6em]">{result.data.invocation.arabicWithHarakat}</p>
                <p className="italic mt-3 text-white">{result.data.invocation.meaning}</p>
                <div className="flex justify-center mt-4">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    {result.data.invocation.repetitions} fois — {result.data.invocation.when}
                  </span>
                </div>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.invocation.arabicWithHarakat} label="Écouter l'invocation" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 10 — Plante Mystique */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                <BlocTitle>Plante Mystique</BlocTitle>
                <p className="text-white font-bold">
                  {result.data.plant.nomFrancais} / {result.data.plant.nomBambara} /{' '}
                  <span className="italic">{result.data.plant.nomScientifique}</span>
                </p>
                <p className="mt-2 text-white">Partie : {result.data.plant.partie}</p>
                <p className="text-white">{result.data.plant.usage}</p>
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

              {/* BLOC 11 — Sacrifice */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifice du {selectedDay}</BlocTitle>
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

              {/* BLOC 12 — Conseils du Jour */}
              <div className="rounded-lg text-center p-6" style={{ border: '1px solid #2563EB' }}>
                <BlocTitle>Conseils pour ton {selectedDay}</BlocTitle>
                <p className="text-white">{result.data.dailyAdvice}</p>
              </div>

              <Separateur />

              {/* BLOC 13 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.data.dayProfile.globalMessage} ${result.data.character.description} ${result.data.dailyAdvice} ${result.data.conclusion}`}
                label="Écouter les secrets de mon jour"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Changer de jour
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Jours de Naissance" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
