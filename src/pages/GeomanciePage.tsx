import { useState } from 'react';
import type { ReactNode } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { callGeminiProxy } from '../lib/geminiProxy';
import type { SpendCreditsResult } from '../utils/mystique';
import { FIGURES, MAISONS, HOUSE_GROUPS, influenceColor } from '../utils/geomancie';

interface GeomancieTheme {
  mothers: string[];
  daughters: string[];
  nieces: string[];
  witnesses: string[];
  judge: string;
  reconciler: string;
  houses: Record<string, string>;
  dominantFigure: string;
  dominantHouse: string;
}

interface TargetedHouseReading {
  house: string;
  figure: string;
  figureInfluence: string;
  relevance: string;
  message: string;
}

interface GeomancieData {
  theme: GeomancieTheme;
  targetedReading: {
    title: string;
    mostRelevantHouses: TargetedHouseReading[];
  };
  interpretation: {
    overall: string;
    keyMessage: string;
    warning: string | null;
    goodNews: string;
    sections: { title: string; content: string }[];
  };
  sacrifices: {
    dominantFigure: string;
    sacrificeInfo: string;
    jour: string;
    destinataire: string;
    mainSacrifice: string;
    complementary: { house: string; figure: string; sacrifice: string }[];
    instructions: string;
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

function buildGeomanciePrompt(questionText: string): string {
  return `Tu es un maître géomancien de la tradition islamique ouest-africaine. Tu parles avec 'tu' en français. Ton ton est sérieux, profond et rassurant.

Question posée : ${questionText}

Voici les données des 16 figures :
${JSON.stringify(FIGURES)}

Voici les données des 16 maisons :
${JSON.stringify(MAISONS)}

CALCUL DU THÈME :
1. Génère 4 figures mères aléatoires parmi les 16.
2. Dérive les 4 filles, 4 nièces, 2 témoins, 1 juge, 1 réconciliateur.
3. Assigne une figure à chaque maison M1 à M16.
4. Identifie la figure dominante.

Retourne UNIQUEMENT du JSON valide :

{
  "theme": {
    "mothers": ["fig1","fig2","fig3","fig4"],
    "daughters": ["fig5","fig6","fig7","fig8"],
    "nieces": ["fig9","fig10","fig11","fig12"],
    "witnesses": ["fig13","fig14"],
    "judge": "fig15",
    "reconciler": "fig16",
    "houses": {
      "M1": "figureName", "M2": "figureName", "M3": "figureName",
      "M4": "figureName", "M5": "figureName", "M6": "figureName",
      "M7": "figureName", "M8": "figureName", "M9": "figureName",
      "M10": "figureName", "M11": "figureName", "M12": "figureName",
      "M13": "figureName", "M14": "figureName", "M15": "figureName",
      "M16": "figureName"
    },
    "dominantFigure": "figureName",
    "dominantHouse": "M1"
  },
  "targetedReading": {
    "title": "Lecture ciblée pour ta question",
    "mostRelevantHouses": [
      { "house": "M1", "figure": "figureName", "figureInfluence": "Favorable/Défavorable/Intermédiaire", "relevance": "Pourquoi cette maison est importante pour cette question.", "message": "Ce que cette maison révèle pour toi." },
      { "house": "M7", "figure": "figureName", "figureInfluence": "Favorable/Défavorable/Intermédiaire", "relevance": "Pourquoi.", "message": "Ce qu'elle révèle." },
      { "house": "M10", "figure": "figureName", "figureInfluence": "Favorable/Défavorable/Intermédiaire", "relevance": "Pourquoi.", "message": "Ce qu'elle révèle." }
    ]
  },
  "interpretation": {
    "overall": "4-5 phrases d'interprétation globale. Utilise tu.",
    "keyMessage": "Le message principal en 2-3 phrases directes.",
    "warning": "Avertissement si figures défavorables. Sinon null.",
    "goodNews": "La bonne nouvelle. 1-2 phrases.",
    "sections": [
      { "title": "Ce que révèle ton thème", "content": "3-4 phrases." },
      { "title": "Les maisons importantes pour toi", "content": "3-4 phrases." },
      { "title": "Ce que tu dois savoir", "content": "2-3 phrases." },
      { "title": "La figure dominante", "content": "2-3 phrases sur la figure dominante." }
    ]
  },
  "sacrifices": {
    "dominantFigure": "figureName",
    "sacrificeInfo": "sacrifice tiré de FIGURES pour cette figure",
    "jour": "jour et heure",
    "destinataire": "à qui donner",
    "mainSacrifice": "sacrifice principal",
    "complementary": [
      { "house": "M1", "figure": "figureName", "sacrifice": "sacrifice selon FIGURES[figure]" },
      { "house": "M7", "figure": "figureName", "sacrifice": "sacrifice selon FIGURES[figure]" }
    ],
    "instructions": "instructions complètes du sacrifice"
  },
  "conclusion": "Message final chaleureux. 2-3 phrases. Termine par BarakAllahu fik."
}`;
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

export function GeomanciePage() {
  const [questionText, setQuestionText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeomancieData | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !questionText.trim();

  async function handleGenerate() {
    if (!questionText.trim()) return;
    setError(null);

    const cacheKey = `geomancie_${questionText.substring(0, 50)}`;
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
        .single();
      const balance = credits?.balance ?? 0;

      if (balance < 2) {
        setModalBalance(balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      const prompt = buildGeomanciePrompt(questionText);
      const data: GeomancieData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.7,
        maxOutputTokens: 3000,
      });

      // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
      // le client ne peut plus écrire dans user_credits directement.
      const { data: spendData, error: spendError } = await supabase
        .rpc('spend_credits', {
          p_tool: 'geomancie',
          p_description: 'Consultation géomancie',
        })
        .single();
      const spend = spendData as SpendCreditsResult | null;

      if (spendError || !spend?.success) {
        setModalBalance(spend?.balance ?? balance);
        setShowCreditModal(true);
        setLoading(false);
        return;
      }

      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      setResult(data);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Géomancie — ' + questionText.substring(0, 50),
        content: data,
        page_source: 'geomancie',
      });
    } catch {
      setError('Erreur de connexion. Vérifie ta clé API et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setQuestionText('');
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('geomancie-content');
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

    pdf.save('geomancie-secretdivin.pdf');
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Géomancie Africaine</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Pose ta question et reçois une réponse
          <br />
          précise selon les 16 figures géomantiques
          <br />
          islamiques africaines
        </p>

        <Separateur />

        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-4">
            <div>
              <label className="block text-sm mb-2" style={{ color: '#b0b8d4' }}>
                Pose ta question
              </label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={4}
                placeholder="Décris ta situation et pose ta question clairement... (Ex: Vais-je réussir dans mon projet ? Mon mariage sera-t-il heureux ?)"
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
              />
              <p className="text-right text-xs mt-1" style={{ color: '#b0b8d4' }}>
                {questionText.length} caractères
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CONSULTER LES FIGURES
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Les figures géomantiques se révèlent...</p>
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
            <div id="geomancie-content">
              <Separateur />

              {/* BLOC 1 — Thème Géomantique */}
              <div className="carte rounded-lg">
                <BlocTitle>Ton Thème Géomantique</BlocTitle>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-4 gap-3 min-w-[640px] md:min-w-0">
                    {HOUSE_GROUPS.map((group) => (
                      <div key={group.label} className="flex flex-col gap-2">
                        <p className="text-or font-bold text-center text-sm mb-1">{group.label}</p>
                        {group.houses.map((house) => {
                          const figureName = result.theme.houses[house];
                          const figure = FIGURES[figureName];
                          const isDominant = figureName === result.theme.dominantFigure;
                          const colors = influenceColor(figure?.influence ?? '');
                          return (
                            <div
                              key={house}
                              className="rounded p-3 text-center"
                              style={
                                isDominant
                                  ? { background: '#2563EB', color: '#ffffff' }
                                  : { background: '#0a0e2e', border: '1px solid rgba(37,99,235,0.15)' }
                              }
                            >
                              <p className={`text-xs font-bold ${isDominant ? '' : 'text-or'}`}>{house}</p>
                              <p className={`font-bold text-sm mt-1 ${isDominant ? '' : 'text-white'}`}>{figureName}</p>
                              <p className="text-[0.7rem] mt-1" style={isDominant ? { color: '#ffffff' } : { color: '#b0b8d4' }}>
                                {MAISONS[house]?.titre}
                              </p>
                              {!isDominant && figure && (
                                <span
                                  className="inline-block mt-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold"
                                  style={{ background: colors.bg, color: colors.text }}
                                >
                                  {figure.influence}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {FIGURES[result.theme.dominantFigure] && (
                  <div className="rounded-lg p-5 mt-6" style={{ background: '#0a0e2e', border: '1px solid #2563EB' }}>
                    <p className="text-or font-bold text-center">
                      Figure dominante : {result.theme.dominantFigure} — Maison {result.theme.dominantHouse}
                    </p>
                    <p className="text-white mt-3 text-center">{FIGURES[result.theme.dominantFigure].caractere}</p>
                  </div>
                )}
              </div>

              <Separateur />

              {/* BLOC 2 — Lecture Ciblée */}
              <div className="carte rounded-lg">
                <p className="text-or font-bold text-center mb-4">{result.targetedReading.title}</p>
                <div className="flex flex-col gap-5">
                  {result.targetedReading.mostRelevantHouses.map((h, i) => {
                    const colors = influenceColor(h.figureInfluence);
                    return (
                      <div key={i} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(37,99,235,0.2)' }}>
                        <div className="px-4 py-2 flex items-center justify-between flex-wrap gap-2 bg-or">
                          <p className="text-white font-bold">
                            Maison {h.house} — {h.figure}
                          </p>
                          <span
                            className="px-2 py-1 rounded-full text-xs font-bold"
                            style={{ background: colors.bg, color: colors.text }}
                          >
                            {h.figureInfluence}
                          </span>
                        </div>
                        <div className="p-4">
                          <p className="text-sm" style={{ color: '#b0b8d4' }}>{MAISONS[h.house]?.description}</p>
                          <p className="text-white mt-2">{h.relevance}</p>
                          <p className="text-white mt-2">{h.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separateur />

              {/* BLOC 3 — Interprétation Complète */}
              <div className="carte rounded-lg">
                <BlocTitle>Interprétation Complète</BlocTitle>
                <p className="text-white text-center mb-5">{result.interpretation.overall}</p>

                <div className="flex flex-col gap-4">
                  {result.interpretation.sections.map((s, i) => (
                    <div key={i}>
                      <p className="text-or font-bold">{s.title}</p>
                      <p className="text-white mt-1">{s.content}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg p-4 mt-5 text-center" style={{ border: '1px solid #2563EB' }}>
                  <p className="text-white font-bold">{result.interpretation.keyMessage}</p>
                </div>

                {result.interpretation.warning && (
                  <div className="rounded-lg p-4 mt-4" style={{ background: '#3a2410', border: '1px solid #e57373' }}>
                    <p className="text-orange-300 text-sm">{result.interpretation.warning}</p>
                  </div>
                )}

                <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f' }}>
                  <p className="text-green-400 text-sm">{result.interpretation.goodNews}</p>
                </div>
              </div>

              <Separateur />

              {/* BLOC 4 — Sacrifices et Plantes */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifices de {result.sacrifices.dominantFigure}</BlocTitle>
                <p className="text-white text-center">{result.sacrifices.sacrificeInfo}</p>

                <div className="flex flex-wrap justify-center gap-3 mt-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold border border-or text-or">
                    Jour : {result.sacrifices.jour}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold border border-or text-or">
                    Destinataire : {result.sacrifices.destinataire}
                  </span>
                </div>

                <div className="rounded-lg p-4 mt-5 text-center bg-or">
                  <p className="text-white font-bold">{result.sacrifices.mainSacrifice}</p>
                </div>

                {result.sacrifices.complementary.length > 0 && (
                  <div className="mt-5">
                    <p className="font-bold mb-2" style={{ color: '#b0b8d4' }}>
                      Sacrifices complémentaires
                    </p>
                    <div className="flex flex-col gap-2">
                      {result.sacrifices.complementary.map((c, i) => (
                        <p key={i} className="text-sm text-white">
                          Maison {c.house} — {c.figure} : {c.sacrifice}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-white mt-4">{result.sacrifices.instructions}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                {[result.sacrifices.dominantFigure, ...result.sacrifices.complementary.map((c) => c.figure)]
                  .filter((figureName, i, arr) => FIGURES[figureName] && arr.indexOf(figureName) === i)
                  .map((figureName) => {
                    const plante = FIGURES[figureName].plante;
                    return (
                      <div key={figureName} className="rounded-lg text-center p-6" style={{ background: '#0d2b1a', border: '1px solid #2563EB' }}>
                        <p className="text-or font-bold">{figureName}</p>
                        <p className="text-white font-bold mt-2">
                          {plante.nomFrancais} / {plante.nomBambara} / <span className="italic">{plante.nomScientifique}</span>
                        </p>
                        <button
                          onClick={() => window.open(plante.lienWikipedia, '_blank', 'noopener,noreferrer')}
                          className="btn-secondaire rounded mt-4"
                        >
                          En savoir plus
                        </button>
                      </div>
                    );
                  })}
              </div>

              <Separateur />

              {/* BLOC 5 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#1a237e', border: '1px solid #2563EB' }}>
                <p className="italic text-white">{result.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.interpretation.overall} ${result.interpretation.keyMessage} ${result.conclusion}`}
                label="Écouter l'interprétation"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger ma consultation en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Poser une nouvelle question
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Géomancie" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
