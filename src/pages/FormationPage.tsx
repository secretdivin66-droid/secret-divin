import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { callGeminiProxy } from '../lib/geminiProxy';
import { MODULES } from '../utils/formation';
import type { Module, Lesson } from '../utils/formation';
import type { SpendCreditsResult } from '../utils/mystique';

const NIVEAUX_ORDER = ['Débutant', 'Intermédiaire', 'Expert'];

type View = 'modules' | 'module' | 'lesson' | 'quiz' | 'results';

interface ModuleProgress {
  is_unlocked: boolean;
  is_completed: boolean;
  best_score: number;
}

interface LessonProgressRow {
  lesson_id: number;
  is_completed: boolean;
  quiz_score: number;
  quiz_passed: boolean;
}

interface LessonSection {
  title: string;
  content: string;
  example: string | null;
  arabicContent: string | null;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface LessonData {
  title: string;
  introduction: string;
  sections: LessonSection[];
  keyPoints: string[];
  practicalExercise: { title: string; instructions: string; example: string };
  quiz: { passingScore: number; questions: QuizQuestion[] };
  conclusion: string;
}

interface QuizAnswer {
  questionId: number;
  question: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  explanation: string;
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

function buildLessonPrompt(module: Module, lesson: Lesson): string {
  return `Tu es un maître enseignant de la mystique islamique ouest-africaine. Tu enseignes en français de manière claire, pédagogique et progressive. Ton ton est sérieux, profond et encourageant.

Module : ${module.title}
Leçon : ${lesson.title}
Niveau : ${module.niveau}

Génère le contenu complet de cette leçon avec un quiz de 5 questions.
Retourne UNIQUEMENT du JSON valide :

{
  "title": "${lesson.title}",
  "introduction": "2-3 phrases d'introduction à cette leçon. Explique ce que l'étudiant va apprendre.",
  "sections": [
    { "title": "Titre section 1", "content": "Contenu détaillé en 3-5 paragraphes avec exemples pratiques.", "example": "Exemple concret si applicable. Sinon null.", "arabicContent": "Contenu arabe si applicable. Sinon null." },
    { "title": "Titre section 2", "content": "Contenu détaillé.", "example": null, "arabicContent": null },
    { "title": "Titre section 3", "content": "Contenu détaillé.", "example": "Exemple.", "arabicContent": null }
  ],
  "keyPoints": ["Point clé 1 à retenir","Point clé 2","Point clé 3","Point clé 4","Point clé 5"],
  "practicalExercise": {
    "title": "Exercice pratique",
    "instructions": "Instructions détaillées pour l'exercice à faire soi-même.",
    "example": "Exemple résolu pas à pas avec toutes les étapes et calculs."
  },
  "quiz": {
    "passingScore": 80,
    "questions": [
      { "id": 1, "question": "Question 1 ?", "options": ["Option A","Option B","Option C","Option D"], "correctAnswer": 0, "explanation": "Pourquoi cette réponse est correcte. 2 phrases." },
      { "id": 2, "question": "Question 2 ?", "options": ["Option A","Option B","Option C","Option D"], "correctAnswer": 1, "explanation": "Explication." },
      { "id": 3, "question": "Question 3 ?", "options": ["Option A","Option B","Option C","Option D"], "correctAnswer": 2, "explanation": "Explication." },
      { "id": 4, "question": "Question 4 ?", "options": ["Option A","Option B","Option C","Option D"], "correctAnswer": 3, "explanation": "Explication." },
      { "id": 5, "question": "Question 5 ?", "options": ["Option A","Option B","Option C","Option D"], "correctAnswer": 0, "explanation": "Explication." }
    ]
  },
  "conclusion": "2-3 phrases de conclusion encourageantes. Préparer l'étudiant pour la leçon ou le module suivant."
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

export function FormationPage() {
  const [view, setView] = useState<View>('modules');
  const [progression, setProgression] = useState<Record<number, ModuleProgress>>({});
  const [lessonsProgress, setLessonsProgress] = useState<LessonProgressRow[]>([]);

  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [quizScore, setQuizScore] = useState(0);
  const [quizPassed, setQuizPassed] = useState(false);

  useEffect(() => {
    loadProgression();
  }, []);

  async function loadProgression() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: progressData } = await supabase.from('formation_modules').select('*').eq('user_id', user.id);

    const next: Record<number, ModuleProgress> = {};
    progressData?.forEach((p) => {
      next[p.module_id] = {
        is_unlocked: p.is_unlocked,
        is_completed: p.is_completed,
        best_score: p.best_score || 0,
      };
    });

    if (!next[1]) {
      await supabase
        .from('formation_modules')
        .upsert(
          { user_id: user.id, module_id: 1, is_unlocked: true, is_completed: false, best_score: 0 },
          { onConflict: 'user_id,module_id' }
        );
      next[1] = { is_unlocked: true, is_completed: false, best_score: 0 };
    }

    setProgression(next);
  }

  async function openModule(module: Module) {
    setSelectedModule(module);
    setView('module');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('formation_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('module_id', module.id);
    setLessonsProgress((data as LessonProgressRow[]) ?? []);
  }

  async function handleStartLesson(module: Module, lesson: Lesson) {
    setError(null);
    setSelectedModule(module);
    setSelectedLesson(lesson);

    const cacheKey = `formation_m${module.id}_l${lesson.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setLessonData(JSON.parse(cached));
      setView('lesson');
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

      const prompt = buildLessonPrompt(module, lesson);
      const data: LessonData = await callGeminiWithRetry('gemini-2.5-flash', prompt, {
        temperature: 0.7,
        maxOutputTokens: 2000,
      });

      // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER), APRÈS
      // succès de la génération : le client ne peut plus écrire dans user_credits
      // directement, et comme rien n'est débité avant que la leçon soit générée avec
      // succès, un remboursement en cas d'échec n'est structurellement jamais nécessaire.
      const { data: spendData, error: spendError } = await supabase
        .rpc('spend_credits', {
          p_tool: 'formation',
          p_description: 'Formation Module ' + module.id + ' Leçon ' + lesson.id,
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
      setLessonData(data);
      setView('lesson');
    } catch {
      setError('La leçon n\'a pas pu être chargée. Aucun crédit n\'a été débité.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryQuiz() {
    if (!selectedModule || !selectedLesson) return;
    const cacheKey = `formation_m${selectedModule.id}_l${selectedLesson.id}`;
    sessionStorage.removeItem(cacheKey);
    await handleStartLesson(selectedModule, selectedLesson);
  }

  function handleStartQuiz() {
    setCurrentQ(0);
    setSelectedOption(null);
    setAnswered(false);
    setQuizAnswers([]);
    setView('quiz');
  }

  function handleValidateAnswer() {
    if (selectedOption === null || !lessonData) return;
    const q = lessonData.quiz.questions[currentQ];
    setQuizAnswers((prev) => [
      ...prev,
      {
        questionId: q.id,
        question: q.question,
        options: q.options,
        selectedIndex: selectedOption,
        correctIndex: q.correctAnswer,
        explanation: q.explanation,
      },
    ]);
    setAnswered(true);
  }

  async function saveQuizResult(score: number, passed: boolean) {
    if (!selectedModule || !selectedLesson) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('formation_progress').upsert(
      {
        user_id: user.id,
        module_id: selectedModule.id,
        lesson_id: selectedLesson.id,
        is_completed: true,
        quiz_score: score,
        quiz_passed: passed,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,module_id,lesson_id' }
    );

    if (passed) {
      const isLastLesson = selectedLesson.id === selectedModule.lessons.length;
      if (isLastLesson) {
        await supabase.from('formation_modules').upsert(
          {
            user_id: user.id,
            module_id: selectedModule.id,
            is_completed: true,
            best_score: score,
            completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,module_id' }
        );

        if (selectedModule.id < 9) {
          await supabase.from('formation_modules').upsert(
            { user_id: user.id, module_id: selectedModule.id + 1, is_unlocked: true, is_completed: false },
            { onConflict: 'user_id,module_id' }
          );
        }
      }
    }
  }

  async function handleNextQuestion() {
    if (!lessonData) return;
    const isLast = currentQ >= lessonData.quiz.questions.length - 1;
    if (!isLast) {
      setCurrentQ((q) => q + 1);
      setSelectedOption(null);
      setAnswered(false);
      return;
    }

    const correctCount = quizAnswers.filter((a) => a.selectedIndex === a.correctIndex).length;
    const score = Math.round((correctCount / lessonData.quiz.questions.length) * 100);
    const passed = score >= (lessonData.quiz.passingScore || 80);
    setQuizScore(score);
    setQuizPassed(passed);
    await saveQuizResult(score, passed);
    await loadProgression();
    setView('results');
  }

  async function handleContinue() {
    if (!selectedModule || !selectedLesson) return;
    const nextLesson = selectedModule.lessons.find((l) => l.id === selectedLesson.id + 1);
    if (nextLesson) {
      await handleStartLesson(selectedModule, nextLesson);
    } else {
      setView('modules');
    }
  }

  function handleBackToFormation() {
    setSelectedModule(null);
    setView('modules');
  }

  function handleBackToModule() {
    setView('module');
    if (selectedModule) openModule(selectedModule);
  }

  const completedCount = Object.values(progression).filter((p) => p.is_completed).length;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-5xl mx-auto">
        {view === 'modules' && (
          <>
            {/* SECTION 1 — EN-TÊTE */}
            <h1 className="text-center font-bold text-or text-[2rem]">Académie Secret Divin</h1>
            <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
              Maîtrise les sciences mystiques
              <br />
              islamiques étape par étape
            </p>

            <Separateur />

            <div className="flex justify-center mb-6">
              <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
                2 crédits par leçon
              </span>
            </div>

            {/* PROGRESSION GLOBALE */}
            <div className="carte rounded-lg text-center mb-6">
              <p className="text-white font-bold">{completedCount} / 9 modules complétés</p>
              <div className="mt-3 w-full rounded-full overflow-hidden" style={{ height: 12, background: '#1a1a2e' }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${(completedCount / 9) * 100}%`, background: '#2563EB' }}
                />
              </div>
            </div>

            {NIVEAUX_ORDER.map((niveauLabel) => {
              const modules = MODULES.filter((m) => m.niveau === niveauLabel);
              const color = modules[0]?.niveauColor ?? '#2563EB';
              return (
                <div key={niveauLabel} className="mb-6">
                  <Separateur />
                  <div className="flex items-center justify-center gap-2 mb-5">
                    <h2 className="font-bold text-white">Niveau {niveauLabel}</h2>
                    <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: `${color}22`, color }}>
                      {niveauLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {modules.map((module) => {
                      const moduleProgress = progression[module.id];
                      const isUnlocked = module.isUnlockedByDefault || moduleProgress?.is_unlocked || false;
                      const isCompleted = moduleProgress?.is_completed || false;
                      const bestScore = moduleProgress?.best_score || 0;

                      const cardStyle = isCompleted
                        ? { background: 'rgba(76,175,80,0.1)', borderLeft: '4px solid #4caf50' }
                        : isUnlocked
                        ? { background: '#111a55', borderLeft: '4px solid #2563EB' }
                        : { background: '#0a0e2e', borderLeft: '4px solid #666', opacity: 0.6 };

                      return (
                        <div key={module.id} className="rounded-lg p-5 flex flex-col gap-2" style={cardStyle}>
                          <p className={`text-xs font-bold ${isUnlocked ? 'text-or' : ''}`} style={!isUnlocked ? { color: '#666' } : undefined}>
                            Module {module.id}
                          </p>
                          <p className={`font-bold ${isUnlocked ? 'text-white' : ''}`} style={!isUnlocked ? { color: '#666' } : undefined}>
                            {module.title}
                          </p>
                          <p className="text-sm" style={{ color: '#b0b8d4' }}>{module.description}</p>

                          {isCompleted && (
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                                Complété
                              </span>
                              <span className="text-xs" style={{ color: '#b0b8d4' }}>Meilleur score : {bestScore}/100</span>
                            </div>
                          )}

                          <p className="text-xs mt-1" style={{ color: '#b0b8d4' }}>{module.lessons.length} leçons</p>

                          {isCompleted ? (
                            <button onClick={() => openModule(module)} className="btn-secondaire rounded mt-2">
                              Revoir ce module
                            </button>
                          ) : isUnlocked ? (
                            <button onClick={() => openModule(module)} className="btn-principal rounded mt-2">
                              Commencer ce module
                            </button>
                          ) : (
                            <>
                              <button disabled className="rounded mt-2 py-2 font-bold cursor-not-allowed" style={{ background: '#333', color: '#777' }}>
                                Verrouillé
                              </button>
                              <p className="text-xs text-center" style={{ color: '#666' }}>
                                Complète le module {module.id - 1} pour débloquer
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {view === 'module' && selectedModule && (
          <div className="max-w-[700px] mx-auto">
            <button onClick={handleBackToFormation} className="btn-secondaire rounded mb-6">
              ← Retour à la formation
            </button>

            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: `${selectedModule.niveauColor}22`, color: selectedModule.niveauColor }}>
              {selectedModule.niveau}
            </span>
            <h1 className="font-bold text-or text-[1.6rem] mt-3">{selectedModule.title}</h1>
            <p className="mt-2" style={{ color: '#b0b8d4' }}>{selectedModule.description}</p>

            <Separateur />

            <div className="flex flex-col gap-4">
              {selectedModule.lessons.map((lesson) => {
                const lessonProg = lessonsProgress.find((p) => p.lesson_id === lesson.id);
                const isCompleted = lessonProg?.is_completed || false;
                const score = lessonProg?.quiz_score || 0;
                const isPassed = lessonProg?.quiz_passed || false;
                const isPreviousPassed =
                  lesson.id === 1
                    ? true
                    : lessonsProgress.find((p) => p.lesson_id === lesson.id - 1 && p.quiz_passed === true) !== undefined;

                return (
                  <div key={lesson.id} className="carte rounded-lg">
                    <p className="text-white font-bold">
                      Leçon {lesson.id} — {lesson.title}
                    </p>

                    {isCompleted && isPassed && (
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                          ✓ Réussie
                        </span>
                        <span className="text-xs" style={{ color: '#b0b8d4' }}>Score : {score}/100</span>
                      </div>
                    )}

                    {isCompleted && !isPassed && (
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#3a2410', color: '#ff9800' }}>
                          Score insuffisant
                        </span>
                        <span className="text-xs" style={{ color: '#b0b8d4' }}>Score : {score}/100 — Réessayer</span>
                      </div>
                    )}

                    {!isPreviousPassed && lesson.id > 1 && (
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#333', color: '#999' }}>
                          Verrouillée
                        </span>
                        <span className="text-xs" style={{ color: '#b0b8d4' }}>Réussis la leçon précédente</span>
                      </div>
                    )}

                    {isPassed ? (
                      <button onClick={() => handleStartLesson(selectedModule, lesson)} className="btn-secondaire rounded mt-3 w-full">
                        Revoir la leçon
                      </button>
                    ) : isPreviousPassed || lesson.id === 1 ? (
                      <button onClick={() => handleStartLesson(selectedModule, lesson)} className="btn-principal rounded mt-3 w-full">
                        Commencer
                      </button>
                    ) : (
                      <button disabled className="rounded mt-3 w-full py-2 font-bold cursor-not-allowed" style={{ background: '#333', color: '#777' }}>
                        Verrouillée
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(view === 'lesson' || view === 'quiz' || view === 'results') && loading && (
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-or">Chargement de la leçon...</p>
          </div>
        )}

        {error && (
          <div className="carte rounded-lg mt-6 text-center max-w-[700px] mx-auto" style={{ border: '1px solid #e53935' }}>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => selectedModule && selectedLesson && handleStartLesson(selectedModule, selectedLesson)}
              className="btn-principal rounded"
            >
              Réessayer
            </button>
          </div>
        )}

        {view === 'lesson' && !loading && lessonData && selectedModule && selectedLesson && (
          <FadeIn>
            <div className="max-w-[800px] mx-auto">
              <button onClick={handleBackToModule} className="btn-secondaire rounded mb-6">
                ← Retour au module
              </button>

              <span
                className="px-2 py-1 rounded-full text-xs font-bold"
                style={{ background: `${selectedModule.niveauColor}22`, color: selectedModule.niveauColor }}
              >
                {selectedModule.niveau}
              </span>
              <h1 className="font-bold text-or text-[1.8rem] mt-3">{lessonData.title}</h1>
              <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>
                Module {selectedModule.id} — Leçon {selectedLesson.id} sur {selectedModule.lessons.length}
              </p>

              <Separateur />

              <p className="italic text-or text-center">{lessonData.introduction}</p>

              {lessonData.sections.map((section, i) => (
                <div key={i}>
                  <Separateur />
                  <h2 className="text-or font-bold">{section.title}</h2>
                  <div className="flex flex-col gap-3 mt-3">
                    {section.content.split('\n').filter(Boolean).map((para, j) => (
                      <p key={j} className="text-white">{para}</p>
                    ))}
                  </div>

                  {section.arabicContent && (
                    <div className="carte rounded-lg mt-4 text-center" style={{ border: '1px solid #2563EB' }}>
                      <p className="arabic text-or text-[1.4em]">{section.arabicContent}</p>
                    </div>
                  )}

                  {section.example && (
                    <div className="rounded-lg p-4 mt-4" style={{ background: '#1b3a1f' }}>
                      <p className="text-green-400 text-sm font-bold mb-1">Exemple pratique :</p>
                      <p className="text-white text-sm">{section.example}</p>
                    </div>
                  )}
                </div>
              ))}

              <Separateur />

              <h2 className="text-or font-bold">Points Clés</h2>
              <div className="flex flex-col gap-2 mt-3">
                {lessonData.keyPoints.map((point, i) => (
                  <p key={i} className="text-white">✦ {point}</p>
                ))}
              </div>

              <Separateur />

              <h2 className="text-or font-bold">{lessonData.practicalExercise.title}</h2>
              <p className="text-white mt-3">{lessonData.practicalExercise.instructions}</p>
              <div className="rounded-lg p-4 mt-4" style={{ background: '#0a0e2e', border: '1px solid rgba(21,101,192,0.4)' }}>
                <p className="text-or font-bold text-sm mb-1">Exemple résolu :</p>
                <p className="text-white text-sm">{lessonData.practicalExercise.example}</p>
              </div>

              <Separateur />

              <p className="italic text-or text-center">{lessonData.conclusion}</p>

              <Separateur />

              <button onClick={handleStartQuiz} className="btn-principal w-full rounded text-lg py-4">
                PASSER AU QUIZ
              </button>
            </div>
          </FadeIn>
        )}

        {view === 'quiz' && !loading && lessonData && selectedLesson && (
          <div className="max-w-[600px] mx-auto">
            <h1 className="text-or font-bold text-center text-[1.5rem]">Quiz — {selectedLesson.title}</h1>
            <p className="text-center text-sm mt-2" style={{ color: '#b0b8d4' }}>Score minimum requis : {lessonData.quiz.passingScore}/100</p>
            <p className="text-center text-sm mb-6" style={{ color: '#b0b8d4' }}>
              Question {currentQ + 1} / {lessonData.quiz.questions.length}
            </p>

            {(() => {
              const q = lessonData.quiz.questions[currentQ];
              const isLast = currentQ >= lessonData.quiz.questions.length - 1;
              return (
                <div className="carte rounded-lg">
                  <p className="text-white font-bold mb-4">{q.question}</p>

                  <div className="flex flex-col gap-3">
                    {q.options.map((opt, i) => {
                      let style: { background: string; border: string } = { background: '#111a55', border: '1px solid #444' };
                      if (!answered && selectedOption === i) {
                        style = { background: '#1a237e', border: '2px solid #2563EB' };
                      } else if (answered) {
                        if (i === q.correctAnswer) {
                          style = { background: '#1b3a1f', border: '1px solid #4caf50' };
                        } else if (i === selectedOption) {
                          style = { background: '#3a1b1b', border: '1px solid #e53935' };
                        }
                      }
                      return (
                        <button
                          key={i}
                          onClick={() => !answered && setSelectedOption(i)}
                          disabled={answered}
                          className="rounded px-4 py-3 text-left text-white transition"
                          style={style}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {!answered ? (
                    <button
                      onClick={handleValidateAnswer}
                      disabled={selectedOption === null}
                      className="btn-principal w-full rounded mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      VALIDER MA RÉPONSE
                    </button>
                  ) : (
                    <>
                      {selectedOption === q.correctAnswer ? (
                        <div className="rounded-lg p-4 mt-5" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                          <p className="text-green-400 font-bold text-sm">✓ Bonne réponse !</p>
                          <p className="text-white text-sm mt-1">{q.explanation}</p>
                        </div>
                      ) : (
                        <div className="rounded-lg p-4 mt-5" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
                          <p className="text-red-400 font-bold text-sm">Mauvaise réponse.</p>
                          <p className="text-white text-sm mt-1">La bonne réponse était : {q.options[q.correctAnswer]}</p>
                          <p className="text-white text-sm mt-1">{q.explanation}</p>
                        </div>
                      )}

                      <p className="text-center text-sm mt-4" style={{ color: '#b0b8d4' }}>
                        Score actuel : {Math.round((quizAnswers.filter((a) => a.selectedIndex === a.correctIndex).length / lessonData.quiz.questions.length) * 100)}/100
                      </p>

                      <button onClick={handleNextQuestion} className="btn-principal w-full rounded mt-4">
                        {isLast ? 'VOIR MES RÉSULTATS' : 'QUESTION SUIVANTE'}
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {view === 'results' && selectedModule && selectedLesson && lessonData && (
          <FadeIn>
            <div className="max-w-[700px] mx-auto">
              <p className="text-or font-bold text-center text-[1.5rem]">Résultats du Quiz</p>
              <p
                className="text-center font-bold mt-4"
                style={{ fontSize: '4rem', color: quizPassed ? '#4caf50' : '#e53935' }}
              >
                {quizScore}/100
              </p>

              <Separateur />

              {quizPassed ? (
                <div className="rounded-lg p-5 text-center" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
                  <p className="text-green-400 font-bold">Félicitations ! Tu as réussi cette leçon.</p>
                  <p className="text-white mt-2 text-sm">Le contenu suivant est maintenant disponible.</p>
                  <button onClick={handleContinue} className="btn-principal rounded mt-4">
                    CONTINUER
                  </button>
                </div>
              ) : (
                <div className="rounded-lg p-5 text-center" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
                  <p className="text-red-400 font-bold">Score insuffisant.</p>
                  <p className="text-white mt-2 text-sm">Tu n'as pas atteint le score minimum de {lessonData.quiz.passingScore}/100.</p>
                  <p className="text-white text-sm">Score obtenu : {quizScore}/100</p>
                  <button onClick={handleRetryQuiz} className="btn-principal rounded mt-4">
                    RÉESSAYER LE QUIZ
                  </button>
                  <p className="text-xs mt-3" style={{ color: '#ff9800' }}>
                    Chaque tentative coûte 2 crédits. Révise bien la leçon avant de réessayer.
                  </p>
                </div>
              )}

              <Separateur />

              <h2 className="text-or font-bold">Résumé des Réponses</h2>
              <div className="flex flex-col gap-3 mt-3">
                {quizAnswers.map((a, i) => {
                  const isCorrect = a.selectedIndex === a.correctIndex;
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={
                        isCorrect
                          ? { background: '#1b3a1f', border: '1px solid #4caf50' }
                          : { background: '#3a1b1b', border: '1px solid #e53935' }
                      }
                    >
                      <p className="text-white text-sm font-bold">
                        Q{a.questionId} : {a.question}
                      </p>
                      <p className="text-sm mt-1" style={{ color: '#b0b8d4' }}>
                        Ta réponse : {a.options[a.selectedIndex]}
                      </p>
                      {!isCorrect && (
                        <p className="text-sm" style={{ color: '#b0b8d4' }}>
                          Bonne réponse : {a.options[a.correctIndex]}
                        </p>
                      )}
                      <p className="text-xs mt-2" style={{ color: '#b0b8d4' }}>{a.explanation}</p>
                    </div>
                  );
                })}
              </div>

              <div className="text-center mt-6">
                <button onClick={handleBackToModule} className="btn-secondaire rounded">
                  ← Retour au module
                </button>
              </div>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Formation" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
