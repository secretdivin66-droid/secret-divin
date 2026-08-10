import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateWeight, ABJAD } from '../utils/mystique';
import { useAuth } from '../hooks/useAuth';
import { useCredits } from '../hooks/useCredits';
import { callGeminiProxy } from '../lib/geminiProxy';
import { CreditModal } from '../components/CreditModal';

interface LetterBreakdown {
  letter: string;
  value: number;
}

type Billing = 'unlimited' | 'free' | 'charged' | null;

interface PMResult {
  inputText: string;
  arabicText: string;
  wasTranslated: boolean;
  totalWeight: number;
  breakdown: LetterBreakdown[];
  charCount: number;
  billing: Billing;
}

// Détecte si le texte saisi est dominé par l'arabe ou par une autre langue
// (français, etc.) — pas une vraie détection de langue, juste un ratio de
// caractères arabes vs latins, suffisant pour choisir le chemin de
// traitement (CAS 1 : calcul direct gratuit / CAS 2 : translittération
// payante via Gemini).
function isArabicText(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return arabicChars > latinChars;
}

// Décomposition affichée dans le Bloc 2 : ne garde que les caractères
// présents dans la table ABJAD (mêmes caractères que ceux comptés par
// calculateWeight) — espaces, ponctuation, harakat et lettres latines
// éventuelles sont ignorés ici aussi plutôt que d'afficher "= undefined".
function buildBreakdown(text: string): LetterBreakdown[] {
  const breakdown: LetterBreakdown[] = [];
  for (const letter of text) {
    const value = ABJAD[letter];
    if (value !== undefined) breakdown.push({ letter, value });
  }
  return breakdown;
}

// Même schéma que les autres pages d'outils (Destin, Jours...) : appel via
// gemini-proxy (jamais de clé API côté client), parse le JSON retourné, et
// retente une fois si Gemini a renvoyé un JSON mal formé.
async function callGeminiRaw(prompt: string): Promise<{ arabic: string }> {
  const json = await callGeminiProxy('gemini-3.5-flash', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
  });
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function callGeminiWithRetry(prompt: string): Promise<{ arabic: string }> {
  try {
    return await callGeminiRaw(prompt);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return await callGeminiRaw(prompt);
    }
    throw err;
  }
}

function buildTransliterationPrompt(text: string): string {
  return `Tu es expert en translittération arabe des noms et textes ouest-africains selon l'orthographe islamique traditionnelle.
Translittère ce texte en arabe SANS harakat (sans signes diacritiques).
Texte : ${text}
Retourne UNIQUEMENT du JSON valide sans markdown :
{ "arabic": "النص المكتوب هنا" }`;
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
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`transition-opacity duration-700 ${show ? 'opacity-100' : 'opacity-0'}`}>
      {children}
    </div>
  );
}

export function PoidsMystiquePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credits, canUseTool, deductCredits } = useCredits(user?.id ?? null);

  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PMResult | null>(null);
  const [abjadOpen, setAbjadOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !inputText.trim() || translating;

  async function handleCalculate() {
    setError(null);

    const trimmed = inputText.trim();
    const cacheKey = `pm_${inputText}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      // Résultat déjà payé/calculé précédemment : jamais de nouvelle
      // vérification de crédits ni de nouvel appel API sur un hit cache.
      setResult(JSON.parse(cached));
      return;
    }

    if (isArabicText(trimmed)) {
      // CAS 1 — arabe détecté : calcul instantané, gratuit, aucun appel API.
      const totalWeight = calculateWeight(trimmed);
      const breakdown = buildBreakdown(trimmed);
      const newResult: PMResult = {
        inputText: trimmed,
        arabicText: trimmed,
        wasTranslated: false,
        totalWeight,
        breakdown,
        charCount: trimmed.length,
        billing: null,
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);
      return;
    }

    // CAS 2 — texte non-arabe : nécessite d'être connecté (la page est déjà
    // derrière PrivateRoute, donc user est normalement toujours défini ici).
    if (!user) {
      navigate('/auth');
      return;
    }

    // Vérification d'accès AVANT tout appel API, quelle que soit la
    // longueur du texte — canUseTool('poids-mystique-traduction') exige
    // 2 crédits ou un abonnement actif (ou admin), voir useCredits.ts.
    if (!canUseTool('poids-mystique-traduction')) {
      setModalBalance(credits.balance);
      setShowCreditModal(true);
      return;
    }

    setTranslating(true);
    try {
      const { arabic } = await callGeminiWithRetry(buildTransliterationPrompt(trimmed));
      const arabicText = arabic.trim();
      const totalWeight = calculateWeight(arabicText);
      const breakdown = buildBreakdown(arabicText);
      const charCount = trimmed.length;

      // Déduction SEULEMENT après succès de la traduction (jamais avant) :
      // si Gemini échoue, rien n'a été débité, donc aucun remboursement à
      // gérer — même principe que useCredits.deductCredits() partout
      // ailleurs sur le site (voir son commentaire).
      let billing: Billing;
      if (credits.isAdmin || credits.isUnlimited) {
        billing = 'unlimited';
      } else if (charCount <= 200) {
        // ≤200 caractères : accès déjà validé ci-dessus, mais gratuit —
        // aucun appel à deductCredits (tool_costs['poids-mystique-traduction']
        // vaudrait 2, donc l'appeler ici facturerait à tort).
        billing = 'free';
      } else {
        const ok = await deductCredits('poids-mystique-traduction', `Traduction poids mystique (${charCount} caractères — 2 crédits, >200)`);
        if (!ok) {
          setModalBalance(credits.balance);
          setShowCreditModal(true);
          setTranslating(false);
          return;
        }
        billing = 'charged';
      }

      const newResult: PMResult = {
        inputText: trimmed,
        arabicText,
        wasTranslated: true,
        totalWeight,
        breakdown,
        charCount,
        billing,
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);
    } catch {
      setError('Erreur de traduction. Réessaie.');
    } finally {
      setTranslating(false);
    }
  }

  function handleReset() {
    setInputText('');
    setResult(null);
    setError(null);
    setAbjadOpen(false);
  }

  const billingText =
    result?.billing === 'unlimited'
      ? 'Traduit automatiquement — Illimité'
      : result?.billing === 'free'
        ? `Traduit automatiquement — ${result.charCount} caractères — Gratuit (0 crédit)`
        : result?.billing === 'charged'
          ? `Traduit automatiquement — ${result.charCount} caractères — 2 crédits utilisés`
          : null;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-3xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Calcul du Poids Mystique</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Découvre le nombre sacré de ton prénom
          <br />
          selon la table Abjad islamique
        </p>

        <Separateur />

        <div className="flex justify-center mb-4">
          <span
            className="px-4 py-2 rounded-full text-sm font-bold text-center"
            style={{ border: '1px solid #4caf50', color: '#4caf50' }}
          >
            Texte arabe : gratuit et illimité — Texte en français : traduction automatique
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            <div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Colle ou écris ton texte, en arabe ou en français"
                rows={3}
                className="w-full min-h-[120px] sm:min-h-[100px] rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                style={{ background: '#0a0f2e', border: '1px solid rgba(249,168,37,0.3)' }}
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>

            {translating ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-8 h-8 border-4 border-or border-t-transparent rounded-full animate-spin" />
                <p className="text-or text-sm">Translittération en cours...</p>
              </div>
            ) : (
              <button
                onClick={handleCalculate}
                disabled={isDisabled}
                className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CALCULER MON POIDS MYSTIQUE
              </button>
            )}
          </div>
        )}

        {/* SECTION 3 — RÉSULTATS */}
        {result && (
          <FadeIn>
            <Separateur />

            {/* BLOC 1 — Texte */}
            {!result.wasTranslated ? (
              <div className="carte rounded-lg text-center max-w-[600px] mx-auto">
                <p className="text-xs uppercase tracking-widest" style={{ color: '#a0aec0' }}>
                  Ton texte
                </p>
                <p className="arabic text-or text-[2rem] mt-2">{result.inputText}</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-4 max-w-[600px] mx-auto">
                <div className="carte rounded-lg text-center flex-1">
                  <p className="text-xs uppercase tracking-widest" style={{ color: '#a0aec0' }}>
                    Texte original
                  </p>
                  <p className="text-white text-[1.2rem] mt-2">{result.inputText}</p>
                </div>
                <div className="carte rounded-lg text-center flex-1">
                  <p className="text-xs uppercase tracking-widest" style={{ color: '#a0aec0' }}>
                    Traduction en arabe
                  </p>
                  <p className="arabic text-or text-[2rem] mt-2">{result.arabicText}</p>
                </div>
              </div>
            )}

            <Separateur />

            {/* BLOC 2 — Détail du calcul */}
            <div className="carte rounded-lg text-center max-w-[600px] mx-auto">
              <p className="text-xs uppercase tracking-widest" style={{ color: '#a0aec0' }}>
                Détail du calcul
              </p>
              <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-2 mt-4" style={{ fontSize: '1.1em' }}>
                {result.breakdown.map((item, i) => (
                  <span key={i} className="flex items-center gap-3">
                    <span>
                      <span className="arabic text-or">{item.letter}</span>
                      <span className="text-white"> = {item.value}</span>
                    </span>
                    {i < result.breakdown.length - 1 && <span className="text-white">+</span>}
                  </span>
                ))}
              </div>
            </div>

            <Separateur />

            {/* BLOC 3 — Poids Mystique */}
            <div className="carte rounded-lg text-center">
              <p className="text-sm tracking-widest" style={{ color: '#a0aec0' }}>
                POIDS MYSTIQUE DE TON TEXTE
              </p>
              <p className="text-or font-bold text-center text-[3rem] md:text-[4rem]">{result.totalWeight}</p>
              {billingText && (
                <p className="text-xs mt-2" style={{ color: '#a0aec0' }}>{billingText}</p>
              )}
            </div>

            <Separateur />

            {/* BLOC 4 — Boutons d'action */}
            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={() => navigate(`/carres-magiques?pm=${result.totalWeight}`)}
                className="btn-principal rounded w-full md:flex-1"
              >
                Générer mes carrés magiques
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Nouveau calcul
              </button>
            </div>

            <Separateur />

            {/* SECTION — Accordéon Abjad */}
            <div className="carte rounded-lg">
              <button
                onClick={() => setAbjadOpen(!abjadOpen)}
                className="text-or font-bold w-full text-left"
              >
                Qu'est-ce que le système Abjad ?
              </button>

              {abjadOpen && (
                <div className="mt-4">
                  <p className="text-white">
                    Le système Abjad est une méthode ancestrale islamique qui attribue une valeur numérique à
                    chaque lettre de l'alphabet arabe. Cette science, appelée Ilm al-Huruf (science des
                    lettres), permet de calculer le poids mystique d'un texte afin de révéler ses influences
                    spirituelles.
                  </p>
                  <p className="text-white mt-4">
                    Le Poids Mystique de ton texte est calculé en additionnant les valeurs Abjad de chaque
                    lettre qui le compose.
                  </p>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-5 text-sm">
                    {Object.entries(ABJAD).map(([letter, value]) => (
                      <div
                        key={letter}
                        className="flex items-center justify-between px-2 py-1 rounded"
                        style={{ border: '1px solid rgba(245,200,66,0.2)' }}
                      >
                        <span className="arabic text-or" style={{ fontSize: '1em' }}>
                          {letter}
                        </span>
                        <span style={{ color: '#a0aec0' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FadeIn>
        )}

        {showCreditModal && (
          <CreditModal
            toolName="Poids Mystique (traduction depuis le français)"
            balance={modalBalance}
            onClose={() => setShowCreditModal(false)}
          />
        )}
      </div>
    </div>
  );
}
