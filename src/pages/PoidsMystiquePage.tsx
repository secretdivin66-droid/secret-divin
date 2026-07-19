import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateWeight, toArabicIndic, GENDER_BONUS, ABJAD } from '../utils/mystique';

type Gender = 'homme' | 'femme';

interface PMResult {
  arabicInput: string;
  nameWeight: number;
  PM: number;
  element: string;
  elementColor: string;
}

// Au moins une lettre arabe (bloc Unicode Arabic de base) : suffisant pour
// rejeter une saisie purement latine tapée par erreur, sans être trop
// strict sur les harakat/ponctuation qui tombent hors de ce bloc.
function containsArabic(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
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

const ELEMENT_DESCRIPTIONS: Record<string, string> = {
  Feu: "Personnalité ardente, passionnée et déterminée. Énergie solaire, leadership naturel et courage.",
  Terre: "Personnalité stable, persévérante et fiable. Ancrage, patience et sens des responsabilités.",
  Air: "Personnalité vive, intelligente et communicative. Créativité, adaptabilité et ouverture d'esprit.",
  Eau: "Personnalité intuitive, sensible et profonde. Spiritualité, empathie et connexion avec l'invisible.",
};

export function PoidsMystiquePage() {
  const navigate = useNavigate();

  const [arabicInput, setArabicInput] = useState('');
  const [gender, setGender] = useState<Gender>('homme');

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PMResult | null>(null);
  const [abjadOpen, setAbjadOpen] = useState(false);

  const isDisabled = !arabicInput.trim();

  function handleCalculate() {
    setError(null);

    if (!containsArabic(arabicInput)) {
      setError('Merci d\'écrire ton prénom en caractères arabes (مثال: محمد)');
      return;
    }

    const cacheKey = `pm_arabic_${arabicInput}_${gender}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setResult(JSON.parse(cached));
      return;
    }

    const nameWeight = calculateWeight(arabicInput.trim());
    const bonus = GENDER_BONUS[gender];
    const PM = nameWeight + bonus;

    const mod = PM % 4;
    const element = mod === 1 ? 'Feu' : mod === 2 ? 'Terre' : mod === 3 ? 'Air' : 'Eau';
    const elementColor = mod === 1 ? '#e53935' : mod === 2 ? '#795548' : mod === 3 ? '#64b5f6' : '#1565c0';

    const newResult: PMResult = {
      arabicInput,
      nameWeight,
      PM,
      element,
      elementColor,
    };

    sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
    setResult(newResult);
  }

  function handleReset() {
    setArabicInput('');
    setGender('homme');
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
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                Ton prénom en arabe
              </label>
              <input
                type="text"
                value={arabicInput}
                onChange={(e) => setArabicInput(e.target.value)}
                placeholder="محمد"
                className="arabic w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
              <p className="text-xs mt-1" style={{ color: '#b0b8d4' }}>
                Écris ton prénom directement en caractères arabes
              </p>
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
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
              onClick={handleCalculate}
              disabled={isDisabled}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CALCULER MON POIDS MYSTIQUE
            </button>
          </div>
        )}

        {/* SECTION 5 — RÉSULTATS */}
        {result && (
          <FadeIn>
            <Separateur />

            {/* BLOC 1 — Prénom en arabe */}
            <div className="carte rounded-lg text-center max-w-[600px] mx-auto">
              <p className="text-xs uppercase tracking-widest" style={{ color: '#b0b8d4' }}>
                Ton prénom
              </p>
              <p className="arabic text-or text-[2rem] mt-2">{result.arabicInput}</p>
              <p className="text-sm mt-2" style={{ color: '#b0b8d4' }}>
                Poids : {result.nameWeight}
              </p>
            </div>

            <Separateur />

            {/* BLOC 2 — Poids Mystique */}
            <div className="carte rounded-lg text-center">
              <p className="text-sm tracking-widest" style={{ color: '#b0b8d4' }}>
                TON POIDS MYSTIQUE
              </p>
              <p className="text-or font-bold text-center text-[3rem] md:text-[4rem]">{result.PM}</p>
              <p className="text-sm text-center" style={{ color: '#b0b8d4' }}>
                {result.nameWeight} + {GENDER_BONUS[gender]} ({gender}) = {result.PM}
              </p>
            </div>

            <Separateur />

            {/* BLOC 3 — Élément */}
            <div className="carte rounded-lg text-center" style={{ borderColor: result.elementColor, borderWidth: 2 }}>
              <p className="text-sm" style={{ color: '#b0b8d4' }}>
                TON ÉLÉMENT
              </p>
              <p className="font-bold text-[2rem] mt-2" style={{ color: result.elementColor }}>
                {result.element}
              </p>
              <p className="mt-3 text-white">{ELEMENT_DESCRIPTIONS[result.element]}</p>
            </div>

            <Separateur />

            {/* BLOC 4 — Chiffres arabes-indiens */}
            <div className="carte rounded-lg text-center">
              <p className="text-sm" style={{ color: '#b0b8d4' }}>
                EN CHIFFRES ARABES-INDIENS
              </p>
              <p className="arabic text-or mt-2" style={{ textAlign: 'center', fontSize: '3rem' }}>
                {toArabicIndic(result.PM)}
              </p>
            </div>

            <Separateur />

            {/* BLOC 5 — Boutons d'action */}
            <div className="flex flex-col md:flex-row gap-3">
              <button
                onClick={() => navigate(`/carres-magiques?pm=${result.PM}`)}
                className="btn-principal rounded w-full md:flex-1"
              >
                Générer mes carrés magiques
              </button>
              <button
                onClick={() => navigate('/destin')}
                className="btn-secondaire rounded w-full md:flex-1"
              >
                Découvrir mon destin complet
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Nouveau calcul
              </button>
            </div>

            <Separateur />

            {/* BLOC 6 — Explication Abjad */}
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
                    lettres), permet de calculer le poids mystique d'un nom afin de révéler ses influences
                    spirituelles.
                  </p>
                  <p className="text-white mt-4">
                    Le Poids Mystique (PM) est calculé en additionnant les valeurs Abjad de chaque lettre du
                    prénom, et en ajoutant un bonus selon le genre (+52 pour l'homme, +452 pour la femme).
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
