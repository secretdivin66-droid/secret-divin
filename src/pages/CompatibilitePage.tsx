import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { callGeminiProxy } from '../lib/geminiProxy';
import { calculateWeight, GENDER_BONUS, ELEMENTS, getCompatibilite } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';

type Gender = 'homme' | 'femme';

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface ElementInfo {
  name: string;
  color: string;
}

interface CompatInfo {
  score: number;
  niveau: string;
  description: string;
}

interface CompatData {
  summary: { title: string; globalMessage: string; score: number };
  profiles: {
    person1: { elementDescription: string; strengths: string[]; weaknesses: string[] };
    person2: { elementDescription: string; strengths: string[]; weaknesses: string[] };
  };
  elementAnalysis: { interaction: string; strengths: string[]; tensions: string[]; advice: string };
  weightsAnalysis: { difference: number; balance: string; description: string; impact: string };
  relationshipAnalysis: { strengths: string[]; challenges: string[]; keyDynamic: string };
  advices: { title: string; content: string }[];
  spiritualProtection: {
    divineName: { arabic: string; withYa: string; transliteration: string; meaning: string; reason: string };
    verse: { arabic: string; surah: string; ayah: string; meaning: string };
    invocation: { arabic: string; meaning: string; repetitions: number; when: string };
    ritual: string;
  };
  sacrifice: {
    isRecommended: boolean;
    reason: string;
    offerings: { item: string; quantity: string; meaning: string }[];
    recipient: string;
    timing: string;
    instructions: string;
  };
  conclusion: string;
}

interface CachedResult {
  data: CompatData;
  PM1: number;
  PM2: number;
  name1Arabic: string;
  mother1Arabic: string;
  name2Arabic: string;
  mother2Arabic: string;
  element1: ElementInfo;
  element2: ElementInfo;
  compat: CompatInfo;
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

function buildCompatPrompt(params: {
  name1: string; name1Arabic: string; mother1: string; mother1Arabic: string; gender1: Gender; PM1: number; element1: ElementInfo;
  name2: string; name2Arabic: string; mother2: string; mother2Arabic: string; gender2: Gender; PM2: number; element2: ElementInfo;
  compat: CompatInfo;
}): string {
  const { name1, name1Arabic, mother1, mother1Arabic, gender1, PM1, element1, name2, name2Arabic, mother2, mother2Arabic, gender2, PM2, element2, compat } = params;
  return `Tu es un maître de la mystique islamique ouest-africaine et de la science des lettres. Tu parles avec 'tu' en français. Ton ton est chaleureux et personnel. Utilise les prénoms dans tes réponses.

Personne 1 :
Prénom : ${name1} / Arabe : ${name1Arabic}
Mère : ${mother1} / Arabe : ${mother1Arabic}
Sexe : ${gender1} / PM : ${PM1} / Élément : ${element1.name}

Personne 2 :
Prénom : ${name2} / Arabe : ${name2Arabic}
Mère : ${mother2} / Arabe : ${mother2Arabic}
Sexe : ${gender2} / PM : ${PM2} / Élément : ${element2.name}

Score élémentaire : ${compat.score}%
Niveau : ${compat.niveau}

Retourne UNIQUEMENT du JSON valide :

{
  "summary": {
    "title": "Titre évocateur pour cette compatibilité (7 mots max)",
    "globalMessage": "2-3 phrases résumant cette relation. Utilise les prénoms ${name1} et ${name2}.",
    "score": ${compat.score}
  },
  "profiles": {
    "person1": {
      "elementDescription": "3 phrases sur la personnalité de ${name1} selon son élément ${element1.name}. Utilise tu.",
      "strengths": ["Force 1 de ${name1}","Force 2","Force 3"],
      "weaknesses": ["Faiblesse 1 de ${name1}","Faiblesse 2"]
    },
    "person2": {
      "elementDescription": "3 phrases sur la personnalité de ${name2} selon son élément ${element2.name}.",
      "strengths": ["Force 1 de ${name2}","Force 2","Force 3"],
      "weaknesses": ["Faiblesse 1 de ${name2}","Faiblesse 2"]
    }
  },
  "elementAnalysis": {
    "interaction": "Comment interagissent ${element1.name} et ${element2.name} dans cette relation. 3-4 phrases.",
    "strengths": ["Point fort 1 de cette combinaison","Point fort 2","Point fort 3"],
    "tensions": ["Tension possible 1","Tension possible 2"],
    "advice": "2-3 phrases pour harmoniser ces deux éléments."
  },
  "weightsAnalysis": {
    "difference": ${Math.abs(PM1 - PM2)},
    "balance": "Équilibré / Légèrement déséquilibré / Très déséquilibré",
    "description": "3 phrases sur l'équilibre des poids entre ${name1} et ${name2}.",
    "impact": "2 phrases sur l'impact de cet équilibre sur la relation."
  },
  "relationshipAnalysis": {
    "strengths": ["Force de la relation 1","Force de la relation 2","Force de la relation 3","Force de la relation 4"],
    "challenges": ["Défi de la relation 1","Défi de la relation 2","Défi de la relation 3"],
    "keyDynamic": "La dynamique principale de cette relation en une phrase courte et percutante."
  },
  "advices": [
    { "title": "Conseil 1", "content": "2 phrases. Utilise ${name1} et ${name2}." },
    { "title": "Conseil 2", "content": "2 phrases." },
    { "title": "Conseil 3", "content": "2 phrases." }
  ],
  "spiritualProtection": {
    "divineName": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification", "reason": "Pourquoi ce nom pour cette relation." },
    "verse": { "arabic": "verset SANS harakat", "surah": "nom sourate français", "ayah": "numéro", "meaning": "traduction française" },
    "invocation": { "arabic": "invocation SANS harakat", "meaning": "traduction française", "repetitions": 7, "when": "Quand réciter ensemble" },
    "ritual": "2-3 phrases sur le rituel recommandé pour renforcer cette relation."
  },
  "sacrifice": {
    "isRecommended": true,
    "reason": "Pourquoi ce sacrifice pour cette relation.",
    "offerings": [
      { "item": "offrande 1", "quantity": "nombre", "meaning": "signification" },
      { "item": "offrande 2", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner",
    "timing": "Quel jour et heure",
    "instructions": "Instructions complètes du sacrifice."
  },
  "conclusion": "Message final chaleureux adressé à ${name1} et ${name2} par leurs prénoms. 3 phrases encourageantes. Termine par InchaAllah."
}

RÈGLES noms divins : SANS ال. Avec يا.
Correct : يا ودود — Incorrect : يا الودود`;
}

function scoreColor(score: number): string {
  if (score <= 40) return '#e53935';
  if (score <= 60) return '#ff9800';
  if (score <= 80) return '#1565c0';
  return '#4caf50';
}

function niveauColor(niveau: string): { bg: string; text: string } {
  if (niveau === 'Forte') return { bg: '#1b3a1f', text: '#4caf50' };
  if (niveau === 'Très forte') return { bg: '#1E3A8A', text: '#2563EB' };
  if (niveau === 'Moyenne') return { bg: '#3a2410', text: '#ff9800' };
  return { bg: '#3a1b1b', text: '#e53935' };
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

function StrengthWeaknessList({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  return (
    <div className="mt-4 flex flex-col gap-1">
      {strengths.map((s, i) => (
        <p key={`s-${i}`} className="text-or text-sm">✓ {s}</p>
      ))}
      {weaknesses.map((w, i) => (
        <p key={`w-${i}`} className="text-orange-400 text-sm">→ {w}</p>
      ))}
    </div>
  );
}

export function CompatibilitePage() {
  const [name1, setName1] = useState('');
  const [mother1, setMother1] = useState('');
  const [gender1, setGender1] = useState<Gender>('homme');

  const [name2, setName2] = useState('');
  const [mother2, setMother2] = useState('');
  const [gender2, setGender2] = useState<Gender>('homme');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled =
    !name1.trim() || !mother1.trim() || !name2.trim() || !mother2.trim();

  async function handleGenerate() {
    if (isDisabled) return;
    setError(null);

    const cacheKey = `compat_${name1}_${mother1}_${gender1}_${name2}_${mother2}_${gender2}`;
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
        .maybeSingle();
      const balance = credits?.balance ?? 0;

      if (balance < 2) {
        setModalBalance(balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      const [name1Result, mother1Result, name2Result, mother2Result] = await Promise.all([
        translateName(name1),
        translateName(mother1),
        translateName(name2),
        translateName(mother2),
      ]);

      const w1 = calculateWeight(name1Result.arabic);
      const wm1 = calculateWeight(mother1Result.arabic);
      const PM1 = w1 + wm1 + GENDER_BONUS[gender1];

      const w2 = calculateWeight(name2Result.arabic);
      const wm2 = calculateWeight(mother2Result.arabic);
      const PM2 = w2 + wm2 + GENDER_BONUS[gender2];

      const rem1 = PM1 % 4;
      const rem2 = PM2 % 4;
      const element1 = ELEMENTS[rem1];
      const element2 = ELEMENTS[rem2];
      const compat = getCompatibilite(element1.name, element2.name);

      const prompt = buildCompatPrompt({
        name1, name1Arabic: name1Result.arabic, mother1, mother1Arabic: mother1Result.arabic, gender1, PM1, element1,
        name2, name2Arabic: name2Result.arabic, mother2, mother2Arabic: mother2Result.arabic, gender2, PM2, element2,
        compat,
      });

      const data: CompatData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.8,
        maxOutputTokens: 3000,
      });

      // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
      // le client ne peut plus écrire dans user_credits directement.
      const { data: spendData, error: spendError } = await supabase
        .rpc('spend_credits', {
          p_tool: 'compatibilite',
          p_description: 'Compatibilité — ' + name1 + ' / ' + name2,
        })
        .single();
      const spend = spendData as SpendCreditsResult | null;

      if (spendError || !spend?.success) {
        setModalBalance(spend?.balance ?? balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      const newResult: CachedResult = {
        data,
        PM1,
        PM2,
        name1Arabic: name1Result.arabic,
        mother1Arabic: mother1Result.arabic,
        name2Arabic: name2Result.arabic,
        mother2Arabic: mother2Result.arabic,
        element1,
        element2,
        compat,
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Compatibilité ' + name1 + ' & ' + name2,
        content: data,
        page_source: 'compatibilite',
      });
    } catch {
      setError('Une erreur s\'est produite. Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setName1('');
    setMother1('');
    setGender1('homme');
    setName2('');
    setMother2('');
    setGender2('homme');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('compat-content');
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

    pdf.save(`compatibilite-${name1}-${name2}-secretdivin.pdf`);
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

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Compatibilité Spirituelle</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvre la compatibilité mystique entre
          <br />
          deux personnes selon la science islamique
          <br />
          des lettres
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
                    value={name1}
                    onChange={(e) => setName1(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de ta mère</label>
                  <input
                    type="text"
                    value={mother1}
                    onChange={(e) => setMother1(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Ton sexe</label>
                  <GenderToggle value={gender1} onChange={setGender1} />
                </div>
              </div>

              <div className="carte rounded-lg flex flex-col gap-4">
                <p className="text-or font-bold text-center">Ta Cible</p>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de la personne</label>
                  <input
                    type="text"
                    value={name2}
                    onChange={(e) => setName2(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Prénom de sa mère</label>
                  <input
                    type="text"
                    value={mother2}
                    onChange={(e) => setMother2(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>Son sexe</label>
                  <GenderToggle value={gender2} onChange={setGender2} />
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ANALYSER LA COMPATIBILITÉ
            </button>
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Analyse de la compatibilité en cours...</p>
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
            <div id="compat-content">
              <Separateur />

              {/* BLOC 1 — Résumé Compatibilité */}
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-[2rem]">{result.data.summary.title}</p>

                <div className="mt-5 relative w-full rounded-full overflow-hidden" style={{ height: 24, background: '#1a1a2e' }}>
                  <div
                    className="h-full flex items-center justify-center text-white text-xs font-bold transition-all"
                    style={{ width: `${result.data.summary.score}%`, background: scoreColor(result.data.summary.score) }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                    {result.data.summary.score}%
                  </span>
                </div>

                <span
                  className="inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: niveauColor(result.compat.niveau).bg, color: niveauColor(result.compat.niveau).text }}
                >
                  {result.compat.niveau}
                </span>

                <p className="italic mt-4 text-white">{result.data.summary.globalMessage}</p>
              </div>

              <Separateur />

              {/* BLOC 2 — Profils Mystiques */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-lg overflow-hidden">
                  <div className="px-4 py-3 text-center" style={{ background: result.element1.color }}>
                    <p className="text-white font-bold">{name1}</p>
                    <p className="text-white text-sm">{result.element1.name} — PM : {result.PM1}</p>
                  </div>
                  <div className="carte text-center">
                    <p className="arabic text-or">
                      {result.name1Arabic} {gender1 === 'homme' ? 'بن' : 'بنت'} {result.mother1Arabic}
                    </p>
                    <p className="text-white mt-3 text-sm">{result.data.profiles.person1.elementDescription}</p>
                    <StrengthWeaknessList
                      strengths={result.data.profiles.person1.strengths}
                      weaknesses={result.data.profiles.person1.weaknesses}
                    />
                  </div>
                </div>

                <div className="rounded-lg overflow-hidden">
                  <div className="px-4 py-3 text-center" style={{ background: result.element2.color }}>
                    <p className="text-white font-bold">{name2}</p>
                    <p className="text-white text-sm">{result.element2.name} — PM : {result.PM2}</p>
                  </div>
                  <div className="carte text-center">
                    <p className="arabic text-or">
                      {result.name2Arabic} {gender2 === 'homme' ? 'بن' : 'بنت'} {result.mother2Arabic}
                    </p>
                    <p className="text-white mt-3 text-sm">{result.data.profiles.person2.elementDescription}</p>
                    <StrengthWeaknessList
                      strengths={result.data.profiles.person2.strengths}
                      weaknesses={result.data.profiles.person2.weaknesses}
                    />
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Analyse des Éléments */}
              <div className="carte rounded-lg">
                <p className="text-center font-bold mb-4">
                  <span style={{ color: result.element1.color }}>{result.element1.name}</span>
                  <span className="text-or"> ——— ✦ ——— </span>
                  <span style={{ color: result.element2.color }}>{result.element2.name}</span>
                </p>
                <p className="text-white text-center">{result.data.elementAnalysis.interaction}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                  <div className="flex flex-col gap-2">
                    {result.data.elementAnalysis.strengths.map((s, i) => (
                      <div key={i} className="rounded p-3" style={{ background: '#1b3a1f' }}>
                        <p className="text-green-400 text-sm">✓ {s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    {result.data.elementAnalysis.tensions.map((t, i) => (
                      <div key={i} className="rounded p-3" style={{ background: '#3a2410' }}>
                        <p className="text-orange-300 text-sm">→ {t}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg p-4 mt-5" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-white">{result.data.elementAnalysis.advice}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Équilibre des Poids */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Équilibre des Poids</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <p className="text-white">{name1} : PM {result.PM1}</p>
                  <p className="text-white">{name2} : PM {result.PM2}</p>
                </div>
                <p className="text-or font-bold mt-3">Différence : {result.data.weightsAnalysis.difference}</p>
                <span
                  className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: result.data.weightsAnalysis.balance === 'Équilibré' ? '#1b3a1f' : result.data.weightsAnalysis.balance === 'Très déséquilibré' ? '#3a1b1b' : '#3a2410',
                    color: result.data.weightsAnalysis.balance === 'Équilibré' ? '#4caf50' : result.data.weightsAnalysis.balance === 'Très déséquilibré' ? '#e53935' : '#ff9800',
                  }}
                >
                  {result.data.weightsAnalysis.balance}
                </span>
                <p className="text-white mt-4">{result.data.weightsAnalysis.description}</p>
                <p className="text-or italic mt-2">{result.data.weightsAnalysis.impact}</p>
              </div>

              <Separateur />

              {/* BLOC 5 — Analyse de la Relation */}
              <div className="carte rounded-lg">
                <p className="text-or italic text-center text-lg">« {result.data.relationshipAnalysis.keyDynamic} »</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
                  <div className="flex flex-col gap-2">
                    {result.data.relationshipAnalysis.strengths.map((s, i) => (
                      <div key={i} className="rounded p-3" style={{ background: '#1b3a1f' }}>
                        <p className="text-green-400 text-sm">✓ {s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    {result.data.relationshipAnalysis.challenges.map((c, i) => (
                      <div key={i} className="rounded p-3" style={{ background: '#3a2410' }}>
                        <p className="text-orange-300 text-sm">→ {c}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Conseils */}
              <div>
                <BlocTitle>Conseils</BlocTitle>
                <div className="flex flex-col gap-4">
                  {result.data.advices.map((a, i) => (
                    <div key={i} className="carte rounded-lg" style={{ border: '1px solid #2563EB' }}>
                      <p className="text-or font-bold">{a.title}</p>
                      <p className="text-white mt-1">{a.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separateur />

              {/* BLOC 7 — Protection Spirituelle */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Protection Spirituelle</BlocTitle>

                <p className="arabic text-or text-[2.5em]">{result.data.spiritualProtection.divineName.withYa}</p>
                <p className="mt-2 text-white">
                  {result.data.spiritualProtection.divineName.transliteration} — {result.data.spiritualProtection.divineName.meaning}
                </p>
                <p className="italic mt-1" style={{ color: '#b0b8d4' }}>{result.data.spiritualProtection.divineName.reason}</p>

                <div className="my-5 h-px" style={{ background: 'rgba(37,99,235,0.2)' }} />

                <p className="arabic text-or text-[1.6em]">{result.data.spiritualProtection.verse.arabic}</p>
                <p className="mt-2 text-white">
                  Sourate {result.data.spiritualProtection.verse.surah} — Verset {result.data.spiritualProtection.verse.ayah}
                </p>
                <p className="italic" style={{ color: '#b0b8d4' }}>{result.data.spiritualProtection.verse.meaning}</p>
                <div className="mt-3 flex justify-center">
                  <AudioButton text={result.data.spiritualProtection.verse.arabic} label="Écouter le verset" />
                </div>

                <div className="my-5 h-px" style={{ background: 'rgba(37,99,235,0.2)' }} />

                <p className="arabic text-or text-[1.6em]">{result.data.spiritualProtection.invocation.arabic}</p>
                <p className="italic mt-2 text-white">{result.data.spiritualProtection.invocation.meaning}</p>
                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    {result.data.spiritualProtection.invocation.repetitions} fois
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-bold border border-or text-or">
                    {result.data.spiritualProtection.invocation.when}
                  </span>
                </div>
                <div className="mt-3 flex justify-center">
                  <AudioButton text={result.data.spiritualProtection.invocation.arabic} label="Écouter l'invocation" />
                </div>

                <div className="rounded-lg p-4 mt-5" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-white">{result.data.spiritualProtection.ritual}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 8 — Sacrifice */}
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

              <Separateur />

              {/* BLOC 9 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.data.summary.globalMessage} ${result.data.elementAnalysis.interaction} ${result.data.conclusion}`}
                label="Écouter l'analyse"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Analyser une autre compatibilité
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Compatibilité" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
