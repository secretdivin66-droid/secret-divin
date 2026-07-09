import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import {
  calculateWeight,
  toArabicIndic,
  GENDER_BONUS,
  SQUARE_INFO,
  SQUARE_PARAMS,
  LAYOUTS,
  generateSquare,
  verifyRowSum,
} from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';
import { callGeminiProxy } from '../lib/geminiProxy';

type Gender = 'homme' | 'femme';

interface CarreResult {
  cells: number[];
  PM: number;
  squareSize: number;
  squareType: string;
}

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

const CELL_SIZES: Record<number, number> = { 3: 64, 4: 60, 5: 56, 6: 52, 7: 46, 8: 42, 9: 38 };

async function translateName(name: string): Promise<GeminiNameResult> {
  const prompt = `Translittère ce nom en arabe SANS harakat.
Retourne UNIQUEMENT du JSON :
{ "arabic": "النص", "weight": 0 }
Nom : ${name}`;

  const json = await callGeminiProxy('gemini-2.0-flash', { contents: [{ parts: [{ text: prompt }] }] });
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
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

function SquareGrid({
  values,
  size,
  variant,
}: {
  values: (number | string)[];
  size: number;
  variant: 'base' | 'french' | 'arabic';
}) {
  const cellClass =
    variant === 'base'
      ? 'font-bold'
      : variant === 'french'
      ? 'font-bold'
      : 'font-bold arabic';

  const cellStyle: CSSProperties =
    variant === 'base'
      ? { background: '#f5f5f5', color: '#1a237e', border: '1px solid #e0e0e0' }
      : variant === 'french'
      ? { background: '#ffffff', color: '#1a237e', border: '2px solid #2563EB' }
      : { background: '#1a237e', color: '#2563EB', direction: 'rtl' };

  return (
    <div
      className="cmg-grid mx-auto"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, auto)`, gap: '2px', justifyContent: 'center' }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          className={`cmg-cell flex items-center justify-center ${cellClass}`}
          style={{ ...cellStyle, fontSize: '0.9em' }}
        >
          {v}
        </div>
      ))}
    </div>
  );
}

export function CarresMagiquesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pmFromUrl = searchParams.get('pm');

  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [manualPM, setManualPM] = useState('');
  const [squareSize, setSquareSize] = useState(3);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CarreResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const canSubmit = Boolean(pmFromUrl) || manualPM.trim() !== '' || firstName.trim() !== '' || motherName.trim() !== '';

  async function handleGenerate() {
    setError(null);
    setSubmitting(true);

    try {
      let pm: number;

      if (pmFromUrl) {
        pm = parseInt(pmFromUrl, 10);
      } else if (manualPM.trim()) {
        pm = parseInt(manualPM, 10);
      } else {
        const [nameRes, motherRes] = await Promise.all([translateName(firstName), translateName(motherName)]);
        const nameW = calculateWeight(nameRes.arabic);
        const motherW = calculateWeight(motherRes.arabic);
        pm = nameW + motherW + GENDER_BONUS[gender];
      }

      const cacheKey = `carre_${pm}_${squareSize}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setResult(JSON.parse(cached));
        setSubmitting(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('no-user');

      const { data: creditsRow } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      const balance = creditsRow?.balance ?? 0;

      if (balance < 2) {
        setModalBalance(balance);
        setShowCreditModal(true);
        setSubmitting(false);
        return;
      }

      const cells = generateSquare(pm, squareSize);
      verifyRowSum(cells, squareSize, pm);

      const newResult: CarreResult = {
        cells,
        PM: pm,
        squareSize,
        squareType: SQUARE_INFO[squareSize].name,
      };

      // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
      // le client ne peut plus écrire dans user_credits directement.
      const { data: spendData, error: spendError } = await supabase
        .rpc('spend_credits', {
          p_tool: 'carres-magiques',
          p_description: `Génération carré ${SQUARE_INFO[squareSize].name} — PM ${pm}`,
        })
        .single();
      const spend = spendData as SpendCreditsResult | null;

      if (spendError || !spend?.success) {
        setModalBalance(spend?.balance ?? balance);
        setShowCreditModal(true);
        setSubmitting(false);
        return;
      }

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);
    } catch {
      setError('Erreur de connexion. Vérifie ta clé API et réessaie.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setFirstName('');
    setMotherName('');
    setGender('homme');
    setManualPM('');
    setSquareSize(3);
    setResult(null);
    setError(null);
  }

  async function handleDownload() {
    const el = document.getElementById('carres-grid');
    if (!el) return;
    const canvas = await html2canvas(el);
    const link = document.createElement('a');
    link.download = `carre-${result?.squareType}-PM${result?.PM}-secretdivin.png`;
    link.href = canvas.toDataURL();
    link.click();
  }

  const desktopCellSize = CELL_SIZES[result?.squareSize ?? squareSize];
  const rowOk = result ? verifyRowSum(result.cells, result.squareSize, result.PM) : false;
  const { subtract, divisor } = result ? SQUARE_PARAMS[result.squareSize] : { subtract: 0, divisor: 1 };
  const entry = result ? Math.floor((result.PM - subtract) / divisor) : 0;
  const remainder = result ? (result.PM - subtract) % divisor : 0;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <style>{`
        .cmg-cell { width: 40px; height: 40px; }
        @media (min-width: 768px) {
          .cmg-cell { width: ${desktopCellSize}px; height: ${desktopCellSize}px; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Carrés Magiques</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Génère les 7 types de carrés magiques
          <br />
          islamiques selon ton poids mystique
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span
            className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or"
          >
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            {pmFromUrl ? (
              <p className="text-or font-bold text-center">Poids Mystique détecté : {pmFromUrl}</p>
            ) : (
              <>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                    Ton prénom (en français)
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
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

                <div className="separateur">
                  <span>———</span>
                  <span>ou</span>
                  <span>———</span>
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                    Entre ton poids mystique directement
                  </label>
                  <input
                    type="number"
                    value={manualPM}
                    onChange={(e) => setManualPM(e.target.value)}
                    placeholder="Ex: 1234"
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>
                Type de carré
              </label>
              <select
                value={squareSize}
                onChange={(e) => setSquareSize(Number(e.target.value))}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {Object.entries(SQUARE_INFO).map(([sizeStr, info]) => {
                  const size = Number(sizeStr);
                  return (
                    <option key={size} value={size}>
                      {size}×{size} — {info.name} ({info.planet})
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!canSubmit || submitting}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              GÉNÉRER MON CARRÉ MAGIQUE
            </button>
          </div>
        )}

        {submitting && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#b0b8d4' }}>Génération en cours...</p>
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
          <div>
            <h2 className="text-center font-bold text-or">
              Ton Carré {result.squareType} — PM : {result.PM}
            </h2>

            <Separateur />

            <div id="carres-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="font-bold mb-3" style={{ color: '#b0b8d4' }}>
                  Carré de Base
                </p>
                <SquareGrid values={LAYOUTS[result.squareSize]} size={result.squareSize} variant="base" />
              </div>

              <div className="text-center">
                <p className="font-bold mb-3" style={{ color: '#b0b8d4' }}>
                  Chiffres Français
                </p>
                <SquareGrid values={result.cells} size={result.squareSize} variant="french" />
              </div>

              <div className="text-center">
                <p className="arabic font-bold mb-3 text-or">الأرقام العربية</p>
                <SquareGrid
                  values={result.cells.map((v) => toArabicIndic(v))}
                  size={result.squareSize}
                  variant="arabic"
                />
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-8">
              {rowOk ? (
                <span
                  className="px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: '#1b3a1f', color: '#4caf50' }}
                >
                  ✓ Somme magique = {result.PM}
                </span>
              ) : (
                <span
                  className="px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: '#3a1b1b', color: '#e53935' }}
                >
                  ⚠ Erreur de calcul
                </span>
              )}
            </div>

            {/* SECTION 8 — INFORMATIONS DU CARRÉ */}
            <div className="carte rounded-lg mb-8">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Type
                    </td>
                    <td className="py-2 text-white font-bold text-right">{result.squareType}</td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Taille
                    </td>
                    <td className="py-2 text-white font-bold text-right">
                      {result.squareSize}×{result.squareSize}
                    </td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Poids (PM)
                    </td>
                    <td className="py-2 text-white font-bold text-right">{result.PM}</td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Planète
                    </td>
                    <td className="py-2 text-white font-bold text-right">{SQUARE_INFO[result.squareSize].planet}</td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Subtract
                    </td>
                    <td className="py-2 text-white font-bold text-right">{subtract}</td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Diviseur
                    </td>
                    <td className="py-2 text-white font-bold text-right">{divisor}</td>
                  </tr>
                  <tr className="border-b border-or/10">
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Entrée
                    </td>
                    <td className="py-2 text-white font-bold text-right">{entry}</td>
                  </tr>
                  <tr>
                    <td className="py-2" style={{ color: '#b0b8d4' }}>
                      Reste
                    </td>
                    <td className="py-2 text-white font-bold text-right">{remainder}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION 9 — BOUTONS D'ACTION */}
            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleDownload} className="btn-principal rounded w-full md:flex-1">
                Télécharger le carré (PNG)
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Calculer un autre carré
              </button>
              <button onClick={() => navigate('/destin')} className="btn-secondaire rounded w-full md:flex-1">
                Découvrir mon destin complet
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Carrés Magiques" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
