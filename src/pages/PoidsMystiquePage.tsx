import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateWeight, ABJAD } from '../utils/mystique';

interface LetterBreakdown {
  letter: string;
  value: number;
}

interface PMResult {
  inputText: string;
  totalWeight: number;
  breakdown: LetterBreakdown[];
}

// Au moins une lettre arabe (bloc Unicode Arabic de base) : suffisant pour
// rejeter une saisie purement latine tapée par erreur, sans être trop
// strict sur les harakat/ponctuation qui tombent hors de ce bloc.
function containsArabic(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
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

  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PMResult | null>(null);
  const [abjadOpen, setAbjadOpen] = useState(false);

  const isDisabled = !inputText.trim();

  function handleCalculate() {
    setError(null);

    if (!containsArabic(inputText)) {
      setError('Merci de coller ou écrire un texte en caractères arabes.');
      return;
    }

    const cacheKey = `pm_${inputText}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setResult(JSON.parse(cached));
      return;
    }

    const totalWeight = calculateWeight(inputText.trim());
    const breakdown = buildBreakdown(inputText.trim());

    const newResult: PMResult = { inputText, totalWeight, breakdown };

    sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
    setResult(newResult);
  }

  function handleReset() {
    setInputText('');
    setResult(null);
    setError(null);
    setAbjadOpen(false);
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-3xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Calcul du Poids Mystique</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Découvre le nombre sacré de ton prénom
          <br />
          selon la table Abjad islamique
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span
            className="px-4 py-2 rounded-full text-sm font-bold"
            style={{ border: '1px solid #4caf50', color: '#4caf50' }}
          >
            GRATUIT — Calcul 100% islamique
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            <div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Colle ton texte arabe ici"
                rows={3}
                className="arabic w-full min-h-[120px] sm:min-h-[100px] rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                style={{ background: '#0a0e2e', border: '1px solid rgba(249,168,37,0.3)' }}
              />
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>

            <button
              onClick={handleCalculate}
              disabled={isDisabled}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CALCULER
            </button>
          </div>
        )}

        {/* SECTION 3 — RÉSULTATS */}
        {result && (
          <FadeIn>
            <Separateur />

            {/* BLOC 1 — Texte saisi */}
            <div className="carte rounded-lg text-center max-w-[600px] mx-auto">
              <p className="text-xs uppercase tracking-widest" style={{ color: '#b0b8d4' }}>
                Ton texte
              </p>
              <p className="arabic text-or text-[2rem] mt-2">{result.inputText}</p>
            </div>

            <Separateur />

            {/* BLOC 2 — Détail du calcul */}
            <div className="carte rounded-lg text-center max-w-[600px] mx-auto">
              <p className="text-xs uppercase tracking-widest" style={{ color: '#b0b8d4' }}>
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
              <p className="text-sm tracking-widest" style={{ color: '#b0b8d4' }}>
                POIDS MYSTIQUE DE TON TEXTE
              </p>
              <p className="text-or font-bold text-center text-[3rem] md:text-[4rem]">{result.totalWeight}</p>
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
                        style={{ border: '1px solid rgba(37,99,235,0.2)' }}
                      >
                        <span className="arabic text-or" style={{ fontSize: '1em' }}>
                          {letter}
                        </span>
                        <span style={{ color: '#b0b8d4' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
