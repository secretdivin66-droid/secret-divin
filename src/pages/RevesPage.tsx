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

const CONTEXTS = ['Rêve ordinaire', 'Rêve répétitif', 'Cauchemar', 'Rêve prémonitoire (impression)', 'Vision nocturne'];
const STATES = ['Tout va bien', 'Période difficile', "En attente d'une décision", 'Malade ou inquiet', 'En quête spirituelle'];

interface RevesData {
  title: string;
  nature: { type: string; summary: string };
  symbols: { symbol: string; meaning: string }[];
  interpretation: {
    global: string;
    message: string;
    warning: string | null;
    goodNews: string;
    sections: { title: string; content: string }[];
  };
  spiritual: {
    islamicView: string;
    africanView: string;
    prayer: string;
    prayerMeaning: string;
    prayerRepetitions: number;
    bestTimeForPrayer: string;
  };
  divineName: {
    arabic: string;
    withYa: string;
    transliteration: string;
    meaning: string;
    repetitions: number;
    reason: string;
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
    isNeeded: boolean;
    type: string;
    reason: string;
    offerings: { item: string; quantity: string; meaning: string }[];
    recipient: string;
    timing: string;
    instructions: string;
  };
  actionPlan: {
    immediate: string;
    thisWeek: string;
    avoid: string;
  };
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

function buildRevesPrompt(dreamText: string, context: string, currentState: string): string {
  return `Tu es un maître de l'interprétation des rêves dans la tradition islamique ouest-africaine. Tu combines la science islamique (tabir al-ru'ya) avec la sagesse traditionnelle africaine. Tu parles avec 'tu' en français. Ton ton est chaleureux, rassurant, profond et sage.

Rêve décrit : ${dreamText}
Contexte : ${context}
État actuel : ${currentState}

Retourne UNIQUEMENT du JSON valide :

{
  "title": "Titre court et évocateur pour ce rêve (5-7 mots max)",
  "nature": {
    "type": "Bon présage / Avertissement / Message spirituel / Reflet de l'âme / Vision prophétique",
    "summary": "Résumé en une phrase de ce que signifie ce rêve."
  },
  "symbols": [
    { "symbol": "élément du rêve (ex: eau, maison, serpent, lumière, mort, mariage...)", "meaning": "Signification spirituelle de cet élément dans ce contexte précis." },
    { "symbol": "deuxième élément important du rêve", "meaning": "Sa signification dans ce rêve." },
    { "symbol": "troisième élément si présent dans le rêve", "meaning": "Sa signification." }
  ],
  "interpretation": {
    "global": "4-5 phrases d'interprétation globale du rêve. Utilise tu. Sois profond et rassurant.",
    "message": "Le message principal que ce rêve te transmet. 2-3 phrases directes.",
    "warning": "Avertissement ou conseil de prudence si nécessaire. Sinon null.",
    "goodNews": "La bonne nouvelle ou espoir que contient ce rêve. 1-2 phrases.",
    "sections": [
      { "title": "Ce que révèle ton rêve", "content": "3-4 phrases d'interprétation globale." },
      { "title": "Les symboles de ton rêve", "content": "Analyse globale des symboles en 3-4 phrases." },
      { "title": "Le message pour toi", "content": "2-3 phrases de message direct." }
    ]
  },
  "spiritual": {
    "islamicView": "L'interprétation selon la tradition islamique (Ibn Sirin). 2-3 phrases.",
    "africanView": "L'interprétation selon la tradition spirituelle africaine ouest-africaine. 2-3 phrases.",
    "prayer": "Courte invocation recommandée en arabe SANS harakat",
    "prayerMeaning": "Signification française de cette prière",
    "prayerRepetitions": 7,
    "bestTimeForPrayer": "Matin au lever / Avant de dormir / Après Fajr"
  },
  "divineName": {
    "arabic": "nom SANS ال",
    "withYa": "يا + nom",
    "transliteration": "Ya ...",
    "meaning": "signification",
    "repetitions": 99,
    "reason": "Pourquoi ce nom divin pour ce rêve spécifique."
  },
  "plant": {
    "nomFrancais": "nom français",
    "nomBambara": "nom bambara",
    "nomScientifique": "nom scientifique exact",
    "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
    "partie": "feuilles/écorce/racines",
    "preparation": "comment préparer et utiliser cette plante après ce rêve",
    "reason": "Pourquoi cette plante pour ce rêve."
  },
  "sacrifice": {
    "isNeeded": true,
    "type": "remerciement / protection",
    "reason": "Pourquoi ce sacrifice pour ce rêve.",
    "offerings": [
      { "item": "offrande 1", "quantity": "nombre", "meaning": "signification de cette offrande" },
      { "item": "offrande 2", "quantity": "nombre", "meaning": "signification" },
      { "item": "offrande 3 si nécessaire", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner (vieux, enfants, imam, handicapé, talibé...)",
    "timing": "Quel jour et heure",
    "instructions": "Instructions complètes pour réaliser ce sacrifice."
  },
  "actionPlan": {
    "immediate": "Ce que tu dois faire immédiatement après ce rêve (dans les 24h).",
    "thisWeek": "Ce que tu dois faire cette semaine suite à ce rêve.",
    "avoid": "Ce qu'il faut absolument éviter après ce rêve."
  },
  "conclusion": "Message final chaleureux et personnel. 2-3 phrases encourageantes. Termine par BarakAllahu fik."
}

RÈGLES pour les offrandes :
Toujours des offrandes traditionnelles ouest-africaines réelles : colas (rouges, blanches), lait frais, dates, mil, riz, poisson, habit blanc, argent symbolique, galettes, fruits, encens.
Nombre symbolique : 3, 7, 9, 11, 41.
Destinataire précis : vieux, vieille, enfants, imam, marabout, handicapé, talibé, mère de jumeaux.

Si bon rêve : sacrifice de remerciement.
Si mauvais rêve : sacrifice de protection.

RÈGLES noms divins :
Toujours SANS ال. Toujours avec يا.
Correct : يا رحيم — Incorrect : يا الرحيم

RÈGLES plante :
Plantes africaines réelles disponibles en Afrique de l'Ouest. Toujours nom scientifique exact. Toujours lien Wikipedia valide.`;
}

function natureColor(type: string): string {
  if (type.includes('Bon présage')) return '#4caf50';
  if (type.includes('Avertissement')) return '#ff9800';
  if (type.includes('Message spirituel')) return '#1565c0';
  if (type.includes('âme')) return '#7b1fa2';
  if (type.includes('prophétique')) return '#2563EB';
  return '#2563EB';
}

function sacrificeTypeColor(type: string): { bg: string; text: string } {
  return type.toLowerCase().includes('protection')
    ? { bg: '#3a2410', text: '#ff9800' }
    : { bg: '#1b3a1f', text: '#4caf50' };
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

export function RevesPage() {
  const [dreamText, setDreamText] = useState('');
  const [context, setContext] = useState(CONTEXTS[0]);
  const [currentState, setCurrentState] = useState(STATES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RevesData | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = dreamText.trim().length < 20;

  async function handleGenerate() {
    if (isDisabled) return;
    setError(null);

    const cacheKey = `reves_${dreamText.substring(0, 50)}_${context}`;
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

      const prompt = buildRevesPrompt(dreamText, context, currentState);
      const data: RevesData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.85,
        maxOutputTokens: 2500,
      });

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'reves',
            p_description: 'Interprétation rêve — ' + dreamText.substring(0, 30),
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
        title: 'Rêve — ' + data.title,
        content: data,
        page_source: 'reves',
      });
    } catch {
      setError('Une erreur s\'est produite. Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setDreamText('');
    setContext(CONTEXTS[0]);
    setCurrentState(STATES[0]);
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('reves-content');
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

    pdf.save('reve-secretdivin.pdf');
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Interprétation des Rêves</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Décris ton rêve et reçois une interprétation
          <br />
          complète selon la tradition islamique et
          <br />
          africaine
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
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Décris ton rêve
              </label>
              <textarea
                value={dreamText}
                onChange={(e) => setDreamText(e.target.value)}
                rows={4}
                placeholder="Décris ton rêve en détail... Les personnes présentes, les lieux, les couleurs, les émotions ressenties, les événements qui se sont passés..."
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
              <p className="text-right text-xs mt-1" style={{ color: '#b0b8d4' }}>
                {dreamText.length} caractères
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Contexte du rêve
              </label>
              <select
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {CONTEXTS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Ton état actuel
              </label>
              <select
                value={currentState}
                onChange={(e) => setCurrentState(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              INTERPRÉTER MON RÊVE
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Ton rêve est en cours d'interprétation...</p>
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
            <div id="reves-content">
              <Separateur />

              {/* BLOC 1 — En-tête du résultat */}
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-[2rem]">{result.title}</p>
                <span
                  className="inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: `${natureColor(result.nature.type)}22`, color: natureColor(result.nature.type) }}
                >
                  {result.nature.type}
                </span>
                <p className="italic mt-3 text-white">« {result.nature.summary} »</p>
              </div>

              <Separateur />

              {/* BLOC 2 — Les Symboles du Rêve */}
              <div>
                <BlocTitle>Les Symboles de ton Rêve</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {result.symbols.map((s, i) => (
                    <div key={i} className="carte rounded-lg text-center">
                      <p className="text-or font-bold">{s.symbol}</p>
                      <p className="text-white mt-2 text-sm">{s.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Interprétation Générale */}
              <div className="carte rounded-lg">
                <BlocTitle>Interprétation Générale</BlocTitle>
                <div className="flex flex-col gap-4">
                  {result.interpretation.sections.map((s, i) => (
                    <div key={i}>
                      <p className="text-or font-bold">{s.title}</p>
                      <p className="text-white mt-1">{s.content}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5 text-center" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-white font-bold italic">{result.interpretation.message}</p>
                </div>

                {result.interpretation.warning && (
                  <div className="rounded-lg p-4 mt-4" style={{ background: '#3a2410', border: '1px solid #e57373' }}>
                    <p className="text-orange-300 text-sm">Attention : {result.interpretation.warning}</p>
                  </div>
                )}

                <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f' }}>
                  <p className="text-green-400 text-sm">{result.interpretation.goodNews}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Vision Spirituelle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-lg p-5" style={{ background: '#111a55', border: '1px solid #1565c0' }}>
                  <p className="font-bold text-center mb-3" style={{ color: '#1565c0' }}>Vision Islamique</p>
                  <p className="text-white text-center">{result.spiritual.islamicView}</p>
                </div>
                <div className="rounded-lg p-5" style={{ background: '#111a55', border: '1px solid #2563EB' }}>
                  <p className="text-or font-bold text-center mb-3">Sagesse Africaine</p>
                  <p className="text-white text-center">{result.spiritual.africanView}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 5 — Invocation Recommandée */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Invocation Recommandée</BlocTitle>
                <p className="arabic text-or text-[1.8em]">{result.spiritual.prayer}</p>
                <p className="italic mt-3 text-white">{result.spiritual.prayerMeaning}</p>
                <div className="flex justify-center mt-4">
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-or text-white">
                    À réciter {result.spiritual.prayerRepetitions} fois
                  </span>
                </div>
                <p className="mt-2 text-sm" style={{ color: '#b0b8d4' }}>{result.spiritual.bestTimeForPrayer}</p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.spiritual.prayer} label="Écouter l'invocation" />
                </div>
              </div>

              <Separateur />

              {/* BLOC 6 — Nom Divin Recommandé */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
                <BlocTitle>Ton Nom Divin</BlocTitle>
                <p className="arabic text-or text-[2.5em]">{result.divineName.withYa}</p>
                <p className="mt-3 text-white">
                  {result.divineName.transliteration} — {result.divineName.meaning}
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

              {/* BLOC 7 — Plante Spirituelle */}
              <div className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                <BlocTitle>Plante Spirituelle</BlocTitle>
                <p className="text-white font-bold">
                  {result.plant.nomFrancais} / {result.plant.nomBambara} /{' '}
                  <span className="italic">{result.plant.nomScientifique}</span>
                </p>
                <p className="mt-2 text-white">Partie utilisée : {result.plant.partie}</p>
                <p className="text-white">Préparation : {result.plant.preparation}</p>
                <p className="text-or italic mt-2">{result.plant.reason}</p>
                <button
                  onClick={() => window.open(result.plant.lienWikipedia, '_blank', 'noopener,noreferrer')}
                  className="btn-secondaire rounded mt-4"
                >
                  En savoir plus
                </button>
              </div>

              <Separateur />

              {/* BLOC 8 — Sacrifice Recommandé */}
              <div className="carte rounded-lg">
                <div className="flex justify-center mb-4">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: sacrificeTypeColor(result.sacrifice.type).bg, color: sacrificeTypeColor(result.sacrifice.type).text }}
                  >
                    {result.sacrifice.type.toLowerCase().includes('protection') ? 'Protection' : 'Remerciement'}
                  </span>
                </div>
                <p className="text-white text-center">{result.sacrifice.reason}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {result.sacrifice.offerings.map((o, i) => (
                    <p key={i} className="text-sm text-white">
                      {o.item} — {o.quantity} → {o.meaning}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-sm" style={{ color: '#b0b8d4' }}>
                  À donner à : {result.sacrifice.recipient}
                </p>
                <p className="text-sm" style={{ color: '#b0b8d4' }}>
                  Moment : {result.sacrifice.timing}
                </p>
                <div className="rounded-lg p-4 mt-4" style={{ background: '#0a0e2e', border: '1px solid rgba(37,99,235,0.2)' }}>
                  <p className="text-white">{result.sacrifice.instructions}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 9 — Plan d'Action */}
              <div>
                <BlocTitle>Plan d'Action</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="rounded-lg p-5 text-center" style={{ background: '#111a55', border: '1px solid #2563EB' }}>
                    <p className="text-or font-bold mb-2">Dans les 24h</p>
                    <p className="text-white text-sm">{result.actionPlan.immediate}</p>
                  </div>
                  <div className="rounded-lg p-5 text-center" style={{ background: '#111a55', border: '1px solid #1565c0' }}>
                    <p className="font-bold mb-2" style={{ color: '#1565c0' }}>Cette Semaine</p>
                    <p className="text-white text-sm">{result.actionPlan.thisWeek}</p>
                  </div>
                  <div className="rounded-lg p-5 text-center" style={{ background: '#111a55', border: '1px solid #e53935' }}>
                    <p className="font-bold mb-2" style={{ color: '#e53935' }}>À Éviter</p>
                    <p className="text-white text-sm">{result.actionPlan.avoid}</p>
                  </div>
                </div>
              </div>

              <Separateur />

              {/* BLOC 10 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.nature.summary} ${result.interpretation.global} ${result.interpretation.message} ${result.conclusion}`}
                label="Écouter l'interprétation"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Interpréter un autre rêve
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Interprétation des Rêves" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
