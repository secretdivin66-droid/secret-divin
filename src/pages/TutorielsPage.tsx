import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { callGeminiProxy } from '../lib/geminiProxy';
import { TUTORIELS } from '../utils/tutoriels';
import type { Tutoriel } from '../utils/tutoriels';

const CATEGORIES = ['Tous', 'Poids mystique', 'Carrés magiques', 'Géomancie', 'Rêves', 'Secrets mystiques', 'Plantes mystiques', 'Talismans et rituels'];
const NIVEAUX = ['Tous les niveaux', 'Débutant', 'Intermédiaire', 'Expert'];

interface TutorielSection {
  title: string;
  content: string;
  steps: string[] | null;
  arabicContent: string | null;
  tip: string | null;
  warning: string | null;
}

interface TutorielData {
  title: string;
  introduction: string;
  sections: TutorielSection[];
  example: { title: string; scenario: string; steps: string[]; result: string };
  keyTakeaways: string[];
  commonMistakes: { mistake: string; correction: string }[];
  nextSteps: string;
  relatedTopics: string[];
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

function buildTutorielPrompt(tutoriel: Tutoriel): string {
  return `Tu es un maître enseignant de la mystique islamique ouest-africaine. Tu expliques de manière claire, pratique et pédagogique en français. Ton ton est sérieux, profond et accessible.

Tutoriel : ${tutoriel.titre}
Catégorie : ${tutoriel.categorie}
Niveau : ${tutoriel.niveau}
Sujet : ${tutoriel.topic}

Génère un tutoriel complet et pratique.
Retourne UNIQUEMENT du JSON valide :

{
  "title": "${tutoriel.titre}",
  "introduction": "2-3 phrases d'introduction. Explique ce que l'utilisateur va apprendre et pourquoi c'est important.",
  "sections": [
    {
      "title": "Titre section 1",
      "content": "Explication claire en 3-4 paragraphes.",
      "steps": ["Étape 1 si applicable","Étape 2","Étape 3"],
      "arabicContent": "Contenu arabe si pertinent. Sinon null.",
      "tip": "Conseil pratique. Sinon null.",
      "warning": "Avertissement important si nécessaire. Sinon null."
    },
    {
      "title": "Titre section 2",
      "content": "Explication détaillée.",
      "steps": null,
      "arabicContent": null,
      "tip": "Conseil pratique.",
      "warning": null
    },
    {
      "title": "Titre section 3",
      "content": "Explication détaillée.",
      "steps": null,
      "arabicContent": null,
      "tip": null,
      "warning": null
    }
  ],
  "example": {
    "title": "Exemple pratique complet",
    "scenario": "Description du scénario de l'exemple concret.",
    "steps": ["Étape 1 de l'exemple","Étape 2","Étape 3","Étape 4"],
    "result": "Résultat final de l'exemple avec chiffres ou données concrètes."
  },
  "keyTakeaways": ["Point essentiel 1 à retenir","Point essentiel 2","Point essentiel 3","Point essentiel 4"],
  "commonMistakes": [
    { "mistake": "Erreur courante 1", "correction": "Comment l'éviter et faire correctement." },
    { "mistake": "Erreur courante 2", "correction": "Comment corriger." }
  ],
  "nextSteps": "2-3 phrases sur ce que l'utilisateur peut faire ensuite pour approfondir ses connaissances.",
  "relatedTopics": ["Sujet lié 1","Sujet lié 2","Sujet lié 3"],
  "conclusion": "2-3 phrases de conclusion encourageantes."
}`;
}

function niveauColor(niveau: string): { bg: string; text: string } {
  if (niveau === 'Débutant') return { bg: '#1b3a1f', text: '#4caf50' };
  if (niveau === 'Intermédiaire') return { bg: '#0d2340', text: '#1565c0' };
  return { bg: '#1E3A8A', text: '#f5c842' };
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

function StepList({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-col gap-3 my-4" style={{ borderLeft: '2px solid rgba(245,200,66,0.3)', paddingLeft: '1rem' }}>
      {steps.map((step, i) => (
        <div key={i} className="flex gap-3 items-start">
          <span className="w-6 h-6 shrink-0 rounded-full bg-or text-white font-bold flex items-center justify-center text-xs">
            {i + 1}
          </span>
          <p className="text-white text-sm mt-0.5">{step}</p>
        </div>
      ))}
    </div>
  );
}

export function TutorielsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tous');
  const [niveau, setNiveau] = useState('Tous les niveaux');

  const [selected, setSelected] = useState<Tutoriel | null>(null);
  const [tutorialData, setTutorialData] = useState<TutorielData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TUTORIELS.filter((t) => {
      const matchCategory = category === 'Tous' || t.categorie === category;
      const matchNiveau = niveau === 'Tous les niveaux' || t.niveau === niveau;
      const matchSearch = !q || t.titre.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      return matchCategory && matchNiveau && matchSearch;
    });
  }, [search, category, niveau]);

  const currentIndex = selected ? TUTORIELS.findIndex((t) => t.id === selected.id) : -1;
  const prevTutoriel = currentIndex > 0 ? TUTORIELS[currentIndex - 1] : null;
  const nextTutoriel = currentIndex >= 0 && currentIndex < TUTORIELS.length - 1 ? TUTORIELS[currentIndex + 1] : null;

  async function loadTutoriel(tutoriel: Tutoriel) {
    setSelected(tutoriel);
    setError(null);
    setTutorialData(null);

    const cacheKey = `tutoriel_${tutoriel.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setTutorialData(JSON.parse(cached));
      return;
    }

    setLoading(true);
    try {
      const prompt = buildTutorielPrompt(tutoriel);
      const data: TutorielData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.7,
        maxOutputTokens: 2000,
      });
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      setTutorialData(data);
    } catch {
      setError('Le tutoriel n\'a pas pu être chargé. Vérifie ta connexion et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setSelected(null);
    setTutorialData(null);
    setError(null);
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        {!selected ? (
          <>
            {/* SECTION 1 — EN-TÊTE */}
            <h1 className="text-center font-bold text-or text-[2rem]">Tutoriels</h1>
            <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
              Apprends les sciences mystiques
              <br />
              islamiques pas à pas avec nos tutoriels
              <br />
              détaillés
            </p>

            <Separateur />

            <div className="flex justify-center mb-6">
              <span className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                GRATUIT — Accès illimité
              </span>
            </div>

            {/* SECTION 3 — Recherche et filtres */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un tutoriel..."
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              style={{ background: '#0d1545' }}
            />

            <Separateur />

            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition ${
                    category === c ? 'bg-or text-white' : 'border border-or text-or bg-transparent'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <Separateur />

            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or mb-8"
              style={{ background: '#0d1545' }}
            >
              {NIVEAUX.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            {/* GRILLE DES TUTORIELS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((t) => {
                const colors = niveauColor(t.niveau);
                return (
                  <div
                    key={t.id}
                    className="carte rounded-lg flex flex-col gap-3 transition hover:border-or"
                    style={{ borderWidth: 1 }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2 py-1 rounded text-xs font-bold text-or" style={{ background: 'rgba(245,200,66,0.1)' }}>
                        {t.categorie}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: colors.bg, color: colors.text }}>
                        {t.niveau}
                      </span>
                    </div>
                    <h3 className="text-white font-bold text-[1.1em]">{t.titre}</h3>
                    <p className="text-sm line-clamp-3" style={{ color: '#a0aec0' }}>{t.description}</p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs" style={{ color: '#a0aec0' }}>{t.duree}</span>
                      <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                        GRATUIT
                      </span>
                    </div>
                    <button onClick={() => loadTutoriel(t)} className="btn-principal w-full rounded">
                      Voir ce tutoriel
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="max-w-[800px] mx-auto">
            {/* EN-TÊTE TUTORIEL */}
            <button onClick={handleBack} className="btn-secondaire rounded mb-6">
              ← Retour aux tutoriels
            </button>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="px-2 py-1 rounded text-xs font-bold text-or" style={{ background: 'rgba(245,200,66,0.1)' }}>
                {selected.categorie}
              </span>
              <span
                className="px-2 py-1 rounded-full text-xs font-bold"
                style={{ background: niveauColor(selected.niveau).bg, color: niveauColor(selected.niveau).text }}
              >
                {selected.niveau}
              </span>
            </div>

            <h1 className="font-bold text-or text-[2rem]">{selected.titre}</h1>
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>{selected.duree} — GRATUIT</p>

            {loading && (
              <div className="flex flex-col items-center gap-3 mt-6">
                <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
                <p className="text-or">Chargement du tutoriel...</p>
              </div>
            )}

            {error && (
              <div className="carte rounded-lg mt-6 text-center" style={{ border: '1px solid #e53935' }}>
                <p className="text-red-400 mb-4">{error}</p>
                <button onClick={() => loadTutoriel(selected)} className="btn-principal rounded">
                  Réessayer
                </button>
              </div>
            )}

            {tutorialData && (
              <FadeIn>
                <Separateur />
                <p className="italic text-or text-center">{tutorialData.introduction}</p>

                {tutorialData.sections.map((section, i) => (
                  <div key={i}>
                    <Separateur />
                    <h2 className="text-or font-bold text-[1.2em]">{section.title}</h2>
                    <div className="flex flex-col gap-3 mt-3">
                      {section.content.split('\n').filter(Boolean).map((para, j) => (
                        <p key={j} className="text-white">{para}</p>
                      ))}
                    </div>

                    {section.steps && <StepList steps={section.steps} />}

                    {section.arabicContent && (
                      <div className="carte rounded-lg mt-4 text-center" style={{ border: '1px solid #f5c842' }}>
                        <p className="arabic text-or text-[1.4em]">{section.arabicContent}</p>
                      </div>
                    )}

                    {section.tip && (
                      <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                        <p className="text-green-400 text-sm">Conseil : {section.tip}</p>
                      </div>
                    )}

                    {section.warning && (
                      <div className="rounded-lg p-4 mt-4" style={{ background: '#3a2410', border: '1px solid #ff9800' }}>
                        <p className="text-orange-300 text-sm">Attention : {section.warning}</p>
                      </div>
                    )}
                  </div>
                ))}

                <Separateur />

                {/* EXEMPLE PRATIQUE */}
                <h2 className="text-or font-bold">{tutorialData.example.title}</h2>
                <div className="carte rounded-lg mt-3">
                  <p className="italic text-white">{tutorialData.example.scenario}</p>
                </div>
                <StepList steps={tutorialData.example.steps} />
                <div className="rounded-lg p-4" style={{ background: '#1b3a1f', border: '1px solid #f5c842' }}>
                  <p className="text-white">Résultat : {tutorialData.example.result}</p>
                </div>

                <Separateur />

                {/* POINTS ESSENTIELS */}
                <h2 className="text-or font-bold">Points Essentiels à Retenir</h2>
                <div className="flex flex-col gap-2 mt-3">
                  {tutorialData.keyTakeaways.map((point, i) => (
                    <p key={i} className="text-white">✅ {point}</p>
                  ))}
                </div>

                <Separateur />

                {/* ERREURS COURANTES */}
                <h2 className="text-or font-bold">Erreurs Courantes à Éviter</h2>
                <div className="flex flex-col gap-3 mt-3">
                  {tutorialData.commonMistakes.map((m, i) => (
                    <div key={i} className="rounded-lg p-4" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
                      <p className="text-red-400 font-bold text-sm">{m.mistake}</p>
                      <p className="text-white mt-1 text-sm">{m.correction}</p>
                    </div>
                  ))}
                </div>

                <Separateur />

                {/* POUR ALLER PLUS LOIN */}
                <h2 className="text-or font-bold">Pour Aller Plus Loin</h2>
                <p className="text-white mt-3">{tutorialData.nextSteps}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {tutorialData.relatedTopics.map((topic, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-sm" style={{ background: '#1a1a2e', color: '#a0aec0' }}>
                      {topic}
                    </span>
                  ))}
                </div>

                <Separateur />

                <p className="italic text-or text-center">{tutorialData.conclusion}</p>

                <Separateur />

                {/* NAVIGATION ENTRE TUTORIELS */}
                <div className="flex flex-col md:flex-row gap-3">
                  <button
                    onClick={() => prevTutoriel && loadTutoriel(prevTutoriel)}
                    disabled={!prevTutoriel}
                    className="btn-secondaire rounded w-full md:flex-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← Tutoriel précédent
                  </button>
                  <button
                    onClick={() => nextTutoriel && loadTutoriel(nextTutoriel)}
                    disabled={!nextTutoriel}
                    className="btn-principal rounded w-full md:flex-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Tutoriel suivant →
                  </button>
                </div>
                <div className="text-center mt-4">
                  <button onClick={handleBack} className="btn-secondaire rounded">
                    ← Retour aux tutoriels
                  </button>
                </div>
              </FadeIn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
