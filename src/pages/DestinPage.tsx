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
    usage: string;
    reason: string;
  };
  talisman: {
    squareType: string;
    divineName1: { arabic: string; withYa: string; meaning: string };
    divineName2: { arabic: string; withYa: string; meaning: string };
    verseForTalisman: { arabic: string; surah: string; ayah: string };
    writingInstructions: string;
    ritualDuration: string;
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
  return callGeminiWithRetry('gemini-2.0-flash', prompt, { temperature: 0.1, maxOutputTokens: 200 });
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
  return `Tu es un maître de la mystique islamique ouest-africaine. Tu parles directement à la personne avec 'tu' en français. Ton ton est profond, rassurant et personnel.

Prénom : ${firstName}
Prénom arabe : ${nameArabic}
Prénom mère : ${motherName}
Mère arabe : ${motherArabic}
Sexe : ${gender}
Religion : ${religion}
Poids Mystique (PM) : ${PM}
Élément : ${element}

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
    "reason": "Pourquoi ce verset pour toi."
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
      { "name": "Or", "hex": "#2563EB", "meaning": "Richesse spirituelle" },
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
    "usage": "comment utiliser",
    "reason": "Pourquoi cette plante pour toi."
  },
  "talisman": {
    "squareType": "3x3/4x4/5x5",
    "divineName1": { "arabic": "nom SANS ال", "withYa": "يا + nom", "meaning": "signification" },
    "divineName2": { "arabic": "nom SANS ال", "withYa": "يا + nom", "meaning": "signification" },
    "verseForTalisman": { "arabic": "verset SANS harakat", "surah": "sourate", "ayah": "numéro" },
    "writingInstructions": "Comment écrire ce talisman sur une tablette.",
    "ritualDuration": "7 jours"
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

RÈGLES PLANTE :
Uniquement plantes africaines réelles.
Toujours nom scientifique exact.
Toujours lien Wikipedia valide.`;
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

      const data: DestinData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
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

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Ton Destin Complet</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvre les 17 points mystiques
          <br />
          de ton profil spirituel complet
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
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#b0b8d4' }}>Révélation de ton destin en cours...</p>
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
            <div id="destin-content">
              <Separateur />

              {/* BLOC 1 — Résumé identité */}
              <div
                className="rounded-lg text-center p-8"
                style={{ background: 'linear-gradient(135deg, #1a237e, #0a0e2e)', border: '1px solid rgba(37,99,235,0.2)' }}
              >
                <p className="text-or font-bold text-[2rem]">{firstName}</p>
                <p className="arabic text-or text-[1.8em] mt-2">
                  {result.nameArabic} بن/بنت {result.motherArabic}
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
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
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
                <p className="italic mt-4" style={{ color: '#b0b8d4' }}>
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
                <p className="italic mt-2" style={{ color: '#b0b8d4' }}>
                  {result.data.verse.meaning}
                </p>
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
                      ✦ {q}
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
                <p className="mt-2" style={{ color: '#b0b8d4' }}>
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
                      <p className="text-xs" style={{ color: '#b0b8d4' }}>
                        {c.meaning}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4" style={{ color: '#b0b8d4' }}>
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
                <p className="mt-1" style={{ color: '#b0b8d4' }}>
                  {result.data.perfume.availability}
                </p>
              </div>

              <Separateur />

              {/* BLOC 13 — Plante Mystique */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                <BlocTitle>Plante Mystique</BlocTitle>
                <p className="text-white font-bold">
                  {result.data.plant.nomFrancais} / {result.data.plant.nomBambara} /{' '}
                  <span className="italic">{result.data.plant.nomScientifique}</span>
                </p>
                <p className="mt-2 text-white">Partie : {result.data.plant.partie}</p>
                <p className="text-white">Usage : {result.data.plant.usage}</p>
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
                <p className="arabic text-or text-[1.4em]">{result.data.talisman.verseForTalisman.arabic}</p>
                <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>
                  Sourate {result.data.talisman.verseForTalisman.surah} — Verset{' '}
                  {result.data.talisman.verseForTalisman.ayah}
                </p>

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

                <p className="mt-4 text-white">{result.data.talisman.writingInstructions}</p>
                <div className="flex justify-center mt-3">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    Rituel : {result.data.talisman.ritualDuration}
                  </span>
                </div>
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
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>
                  À donner à : {result.data.sacrifice.recipient}
                </p>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>
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
                <p className="italic mt-1" style={{ color: '#b0b8d4' }}>
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
                  <p className="text-sm mt-2" style={{ color: '#b0b8d4' }}>
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
                  <p className="text-sm mt-2" style={{ color: '#b0b8d4' }}>
                    {result.data.career.talent}
                  </p>
                </div>
                <div className="carte rounded-lg text-center">
                  <p className="text-or font-bold mb-2">Spiritualité</p>
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    {result.data.spiritualLevel.level}
                  </span>
                  <p className="text-sm mt-3 text-white">{result.data.spiritualLevel.description}</p>
                  <p className="text-sm mt-2" style={{ color: '#b0b8d4' }}>
                    {result.data.spiritualLevel.nextStep}
                  </p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 18 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
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
