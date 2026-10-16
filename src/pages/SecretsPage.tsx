import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabaseClient';
import { CreditModal } from '../components/CreditModal';
import { AudioButton } from '../components/AudioButton';
import { calculateWeight, GENDER_BONUS } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';
import { callGeminiProxy } from '../lib/geminiProxy';
import { isAdminUser } from '../utils/roles';
import { selectPlantsForObjective, isProtectionWorkType } from '../utils/plantsSelection';
import type { PlantData } from '../utils/plantsSelection';

type Gender = 'homme' | 'femme';

interface GeminiNameResult {
  arabic: string;
  weight?: number;
}

interface DivineName {
  arabic: string;
  withYa: string;
  transliteration: string;
  meaning: string;
}

interface ZikrStep {
  order: number;
  title: string;
  arabic: string;
  repetitions: number;
  note: string | null;
}

interface SecretsData {
  secretNumber: { value: number; hidden: string; power: string };
  hiddenMeaning: { nameSecret: string; motherSecret: string; combinedPower: string };
  divineNames: { name1: DivineName; name2: DivineName; combined: string; reason: string };
  verse: {
    arabic: string;
    // AVEC harakat, pour l'affichage/l'écoute et pour l'Étape 4 de
    // "Comment utiliser ce secret ?" (écrit avec les voyelles).
    arabicWithHarakat: string;
    surah: string;
    ayah: string;
    meaning: string;
    reason: string;
  };
  invocation: {
    // Invocation grammaticalement correcte (vocatif + verbe à l'impératif
    // accordé au sens du nom divin, voir RÈGLES INVOCATION) — plus de
    // version "sans harakat" : elle ne sert plus qu'au zikr (récitation),
    // pas à l'écriture.
    arabicWithHarakat: string;
    meaning: string;
    repetitions: number;
  };
  talisman: {
    // Restreint à 3x3/4x4 (voir RÈGLES TALISMAN) : seuls formats pour
    // lesquels l'Étape 5 a une règle de répétition définie.
    squareType: string;
    ritualDuration: string;
  };
  zikr: {
    steps: ZikrStep[];
    bestTime: string;
  };
  sacrifice: {
    isRecommended: boolean;
    reason: string;
    offerings: { item: string; quantity: string; meaning: string }[];
    recipient: string;
    timing: string;
    instructions: string;
  };
  // Carte "Résultat attendu" — texte court, propre à cette génération.
  expectedResult: string;
  warnings: string[];
  conclusion: string;
}

interface CachedResult {
  data: SecretsData;
  nameArabic: string;
  motherArabic: string;
  PM: number;
  // Plantes adaptées à l'objectif sélectionné (Étape 7 de "Comment utiliser
  // ce secret ?") — sélectionnées via la même logique que "Plantes
  // Mystiques" (voir ../utils/plantsSelection), pas une nouvelle base.
  plants: PlantData[];
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
  return callGeminiWithRetry('gemini-3.1-flash-lite', prompt, { temperature: 0.1, maxOutputTokens: 200 });
}

// Règle de sacrifice déterministe identique à celle déjà utilisée ailleurs
// sur SecretDivin (PM%4 -> type d'offrande, PM%3 -> destinataire) —
// réutilisée telle quelle (même texte, même logique), pas une nouvelle
// règle inventée pour cette page.
function offeringFromR4(r: number): string {
  if (r === 1) return 'choses du FEU (galettes, pain grillé)';
  if (r === 2) return 'choses de la TERRE (manioc, igname)';
  if (r === 3) return 'FRUITS (mangues, bananes, oranges)';
  return 'POISSON (frais ou séché)';
}
function recipientFromR3(r: number): string {
  if (r === 1) return 'un HOMME';
  if (r === 2) return 'une FEMME';
  return 'un ENFANT';
}

function buildSecretsPrompt(params: {
  firstName: string;
  nameArabic: string;
  motherName: string;
  motherArabic: string;
  gender: Gender;
  objective: string;
  PM: number;
}): string {
  const { firstName, nameArabic, motherName, motherArabic, gender, objective, PM } = params;
  const remainder4 = PM % 4;
  const remainder3 = ((PM % 3) + 3) % 3;
  return `Tu es un maître de la mystique islamique ouest-africaine et de la science des lettres (Ilm al-Huruf). Tu parles avec 'tu' en français. Ton ton est profond, sérieux et rassurant.

Prénom : ${firstName}
Prénom arabe : ${nameArabic}
Mère : ${motherName}
Mère arabe : ${motherArabic}
Sexe : ${gender}
Objectif : ${objective}
PM : ${PM}

LIMITE DE LONGUEUR : la somme de tous les textes du JSON (toutes les valeurs confondues) ne doit jamais dépasser 450 mots au total. Reste concis sur chaque champ tout en gardant de la profondeur.

RÈGLES SACRIFICE (fait déterministe, à respecter dans "sacrifice") :
PM % 4 = ${remainder4} → type d'offrande imposé : ${offeringFromR4(remainder4)}
PM % 3 = ${remainder3} → destinataire imposé : ${recipientFromR3(remainder3)}
Les offrandes de "sacrifice.offerings" doivent appartenir à cette catégorie et
"sacrifice.recipient" doit correspondre à ce destinataire, tout en adaptant
les items précis, les quantités et les raisons à l'objectif "${objective}"
et à ce secret mystique (ne recopie pas une liste générique).

Retourne UNIQUEMENT du JSON valide :

{
  "secretNumber": {
    "value": ${PM},
    "hidden": "Le chiffre caché derrière ce PM en 1 phrase.",
    "power": "La puissance mystique de ce nombre en 1 phrase."
  },
  "hiddenMeaning": {
    "nameSecret": "1 phrase sur les secrets cachés dans le prénom ${firstName} selon la science des lettres.",
    "motherSecret": "1 phrase sur l'influence du prénom de la mère sur le destin.",
    "combinedPower": "1 phrase sur la puissance combinée des deux prénoms."
  },
  "divineNames": {
    "name1": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification" },
    "name2": { "arabic": "nom SANS ال", "withYa": "يا + nom", "transliteration": "Ya ...", "meaning": "signification" },
    "combined": "يا nom1 يا nom2",
    "reason": "1 phrase sur pourquoi ces 2 noms divins pour cet objectif."
  },
  "verse": {
    "arabic": "verset SANS harakat",
    "arabicWithHarakat": "même verset AVEC tous les harakat",
    "surah": "nom sourate en français",
    "ayah": "numéro",
    "meaning": "traduction française",
    "reason": "Pourquoi ce verset pour cet objectif."
  },
  "invocation": {
    "arabicWithHarakat": "Invocation complète et grammaticalement correcte EN ARABE AVEC HARAKAT — voir RÈGLES INVOCATION plus bas (vocatif + verbe à l'impératif adapté au sens de chaque nom divin, relié au prénom et à l'objectif, jamais une simple juxtaposition).",
    "meaning": "traduction française complète et fidèle de cette invocation",
    "repetitions": 41
  },
  "talisman": {
    "squareType": "3x3 ou 4x4",
    "ritualDuration": "7 jours"
  },
  "zikr": {
    "steps": [
      { "order": 1, "title": "Bismillah", "arabic": "بسم الله الرحمن الرحيم", "repetitions": 1, "note": "Toujours commencer par Bismillah" },
      { "order": 2, "title": "Salat sur le Prophète", "arabic": "اللهم صل على سيدنا محمد", "repetitions": 3, "note": null },
      { "order": 3, "title": "Les 2 noms divins", "arabic": "(ignoré, repris automatiquement)", "repetitions": 0, "note": "يا sans ال obligatoire" },
      { "order": 4, "title": "Le verset coranique", "arabic": "(ignoré, repris automatiquement)", "repetitions": 7, "note": null },
      { "order": 5, "title": "L'invocation complète", "arabic": "(ignoré, repris automatiquement)", "repetitions": 41, "note": "Réciter lentement et avec concentration" },
      { "order": 6, "title": "Clôture salat", "arabic": "اللهم صل على سيدنا محمد", "repetitions": 3, "note": "Terminer par Al-Hamdulillah" }
    ],
    "bestTime": "Après Fajr ou avant de dormir"
  },
  "sacrifice": {
    "isRecommended": true,
    "reason": "Pourquoi ce sacrifice accompagne ce rituel.",
    "offerings": [
      { "item": "offrande 1", "quantity": "nombre", "meaning": "signification" },
      { "item": "offrande 2", "quantity": "nombre", "meaning": "signification" }
    ],
    "recipient": "À qui donner",
    "timing": "Quel jour et heure",
    "instructions": "Instructions complètes du sacrifice."
  },
  "expectedResult": "3-4 phrases courtes et claires résumant le résultat spirituel attendu pour l'objectif \\"${objective}\\", cohérentes avec ce secret mais SANS répéter les explications déjà données plus haut dans ce JSON, et SANS présenter ce résultat comme une garantie certaine (utilise un conditionnel/une formulation d'espoir, pas une promesse).",
  "warnings": ["Avertissement 1 important","Avertissement 2 si nécessaire"],
  "conclusion": "Message final chaleureux adressé à ${firstName}. 1 phrase encourageantes. Termine par InchaAllah."
}

RÈGLES NOMS DIVINS :
TOUJOURS sans ال devant le nom.
TOUJOURS avec يا pour affichage.
Correct : يا ودود يا جامع
Incorrect : يا الودود يا الجامع

RÈGLES TALISMAN :
"squareType" doit être EXACTEMENT "3x3" ou "4x4" (jamais 5x5 ni un autre
format) : ce sont les deux seuls formats utilisés par cette page.

RÈGLES INVOCATION (point "invocation.arabicWithHarakat") — TRÈS IMPORTANT :
N'écris JAMAIS une simple juxtaposition des noms divins et du prénom. Construis
une phrase arabe grammaticalement correcte et AVEC harakat :
1. Pour CHAQUE nom divin choisi dans "divineNames", commence par une forme
   vocative (يَا + le nom), puis enchaîne avec un verbe à l'IMPÉRATIF dont le
   sens correspond exactement à ce nom (ex: nom = الجامع → verbe اجْمَعْ ;
   nom = الفتاح → verbe افْتَحْ ; nom = الرزاق → verbe ارْزُقْ ; nom = الودود →
   verbe وَدِّدْ ; adapte toujours le verbe au sens réel du nom choisi, ne
   réutilise pas un verbe générique si le nom change).
2. Relie ensuite ce verbe à l'objectif "${objective}" et au prénom arabe
   de la personne (${nameArabic} بن/بنت ${motherArabic}) par une construction
   grammaticale correcte (compléments d'objet, prépositions بين/لـ/إلى selon
   le sens), jamais par une simple suite de mots sans lien.
Exemple de structure correcte (à adapter au nom divin réellement choisi,
ne pas copier tel quel) : "يَا جَامِعُ، اجْمَعْ لِـ ${nameArabic} ما يَتَمَنَّاهُ بِفَضْلِكَ."
Incorrect (à ne jamais faire) : juxtaposer "يا نom1 يا نom2 ${nameArabic} بن ${motherArabic}"
sans aucun verbe ni lien grammatical.`;
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

const OBJECTIVES = [
  'Protection spirituelle',
  'Réussite et succès',
  'Amour et mariage',
  'Richesse et abondance',
  'Santé et guérison',
  'Élévation spirituelle',
  'Chance et bénédiction',
  'Autre',
];

export function SecretsPage() {
  const [firstName, setFirstName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [gender, setGender] = useState<Gender>('homme');
  const [objective, setObjective] = useState(OBJECTIVES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedResult | null>(null);

  const [showCreditModal, setShowCreditModal] = useState(false);
  const [modalBalance, setModalBalance] = useState(0);

  const isDisabled = !firstName.trim() || !motherName.trim();

  async function handleGenerate() {
    setError(null);

    const cacheKey = `secrets_${firstName}_${motherName}_${gender}_${objective}`;
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

      const [nameResult, motherResult] = await Promise.all([translateName(firstName), translateName(motherName)]);

      const nameWeight = calculateWeight(nameResult.arabic);
      const motherWeight = calculateWeight(motherResult.arabic);
      const PM = nameWeight + motherWeight + GENDER_BONUS[gender];

      const prompt = buildSecretsPrompt({
        firstName,
        nameArabic: nameResult.arabic,
        motherName,
        motherArabic: motherResult.arabic,
        gender,
        objective,
        PM,
      });

      // Plantes de l'Étape 7, sélectionnées en parallèle avec la même
      // logique que "Plantes Mystiques" (voir ../utils/plantsSelection) —
      // objectif = libellé choisi dans le select, cette page n'a pas de
      // description libre comme "Plantes Mystiques".
      const [data, plants] = await Promise.all([
        callGeminiWithRetry('gemini-3.1-flash-lite', prompt, {
          temperature: 0.8,
          maxOutputTokens: 1800,
        }) as Promise<SecretsData>,
        selectPlantsForObjective({ objectiveText: objective, workType: objective, PM }),
      ]);

      const newResult: CachedResult = {
        data,
        nameArabic: nameResult.arabic,
        motherArabic: motherResult.arabic,
        PM,
        plants,
      };

      if (!isAdmin) {
        // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER) :
        // le client ne peut plus écrire dans user_credits directement.
        const { data: spendData, error: spendError } = await supabase
          .rpc('spend_credits', {
            p_tool: 'secrets',
            p_description: 'Secrets mystiques — ' + firstName,
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

      sessionStorage.setItem(cacheKey, JSON.stringify(newResult));
      setResult(newResult);

      await supabase.from('saved_rituals').insert({
        user_id: user.id,
        title: 'Secrets de ' + firstName,
        content: data,
        page_source: 'secrets',
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
    setObjective(OBJECTIVES[0]);
    setResult(null);
    setError(null);
  }

  async function handleExportPDF() {
    const el = document.getElementById('secrets-content');
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: '#0a0f2e' });
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

    pdf.save(`secrets-${firstName}-secretdivin.pdf`);
  }

  // Carré non généré ici : la page renvoie vers la fonctionnalité Carré
  // Magique (squareSize pré-sélectionne le bon format là-bas). Restreint à
  // 3/4 (voir RÈGLES TALISMAN du prompt), donc 4x4 ou repli sur 3.
  const squareSize = result?.data.talisman.squareType === '4x4' ? 4 : 3;

  // Poids mystique de chaque nom divin, recalculé avec calculateWeight()
  // (même fonction que partout ailleurs sur le site) plutôt que de faire
  // confiance à un champ "weight" généré par Gemini — jamais utilisé
  // jusqu'ici, donc non fiable pour un calcul affiché à l'utilisateur.
  const name1Weight = result ? calculateWeight(result.data.divineNames.name1.arabic) : 0;
  const name2Weight = result ? calculateWeight(result.data.divineNames.name2.arabic) : 0;
  // Étape 3 de "Comment utiliser ce secret ?" : nombre de fois à écrire les
  // noms divins = somme de leurs poids mystiques (règle demandée).
  const divineNamesWriteReps = name1Weight + name2Weight;
  // Étape 4 : nombre de fois à écrire le verset, choisi parmi 3 valeurs
  // possibles selon une règle déterministe basée sur PM (même esprit que
  // les règles PM%4/PM%3 déjà utilisées pour le sacrifice) — jamais
  // aléatoire, toujours la même valeur pour un même profil.
  const verseWriteRepsOptions = [77, 99, name1Weight];
  const verseWriteReps = result ? verseWriteRepsOptions[result.PM % 3] : 0;
  // Zikr quotidien, Étape "Les 2 noms divins" : répétitions = poids
  // mystique du nombre secret (le PM de la personne, carte 1) × 3 — à ne
  // pas confondre avec divineNamesWriteReps ci-dessus (somme des poids des
  // 2 noms divins, utilisée uniquement pour l'écriture du talisman).
  const divineNameZikrReps = result ? result.PM * 3 : 0;
  const isProtection = isProtectionWorkType(objective);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        {/* SECTION 1 — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Secrets Mystiques Cachés</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Révèle les secrets spirituels de ton
          <br />
          prénom et reçois ton invocation
          <br />
          personnalisée
        </p>

        <Separateur />

        <div className="flex justify-center mb-4">
          <span className="px-4 py-2 rounded-full text-sm font-bold border border-or text-or">
            2 crédits par génération
          </span>
        </div>

        {/* SECTION 2 — FORMULAIRE */}
        {!result && (
          <div className="carte rounded-lg max-w-[600px] mx-auto flex flex-col gap-5">
            <div>
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-2" style={{ color: '#a0aec0' }}>
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
              <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>
                Ton objectif principal
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              >
                {OBJECTIVES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isDisabled || loading}
              className="btn-principal w-full rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              RÉVÉLER MES SECRETS MYSTIQUES
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p style={{ color: '#a0aec0' }}>Révélation de tes secrets...</p>
          </div>
        )}

        {error && (
          <div className="carte rounded-lg mt-4 text-center" style={{ border: '1px solid #e53935' }}>
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={handleGenerate} className="btn-principal rounded">
              Réessayer
            </button>
          </div>
        )}

        {result && (
          <FadeIn>
            <div id="secrets-content">
              <Separateur />

              {/* CARTE 1 — Secret de la personne, Influence de la mère,
                  Puissance combinée, Le nombre secret : tout dans UNE
                  seule carte (plus de sous-cartes indépendantes). */}
              <div className="carte rounded-lg">
                <div className="text-center">
                  <p className="text-or font-bold text-[2rem]">{firstName}</p>
                  <p className="arabic text-or mt-2">
                    {result.nameArabic} {gender === 'homme' ? 'بن' : 'بنت'} {result.motherArabic}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                  <div>
                    <p className="text-or font-bold mb-2">Secret de {firstName}</p>
                    <p className="text-white text-sm">{result.data.hiddenMeaning.nameSecret}</p>
                  </div>
                  <div>
                    <p className="text-or font-bold mb-2">Influence de ta mère</p>
                    <p className="text-white text-sm">{result.data.hiddenMeaning.motherSecret}</p>
                  </div>
                  <div>
                    <p className="text-or font-bold mb-2">Puissance combinée</p>
                    <p className="text-white text-sm">{result.data.hiddenMeaning.combinedPower}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-or font-bold mb-2">Le nombre secret</p>
                    <p className="text-or font-bold text-[3rem]">{result.PM}</p>
                    <p className="text-white text-sm mt-2">{result.data.secretNumber.hidden}</p>
                    <p className="text-white text-sm mt-1">{result.data.secretNumber.power}</p>
                  </div>
                </div>
              </div>

              <Separateur />

              {/* CARTE 2 — Noms divins + Verset coranique, regroupés. */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Les 2 Noms Divins</BlocTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name1.withYa}</p>
                    <p className="text-sm mt-2 text-white">
                      {result.data.divineNames.name1.transliteration} / {result.data.divineNames.name1.meaning}
                    </p>
                  </div>
                  <div>
                    <p className="arabic text-or text-[2.2em]">{result.data.divineNames.name2.withYa}</p>
                    <p className="text-sm mt-2 text-white">
                      {result.data.divineNames.name2.transliteration} / {result.data.divineNames.name2.meaning}
                    </p>
                  </div>
                </div>
                <p className="arabic text-or text-[1.8em] mt-5">{result.data.divineNames.combined}</p>
                <p className="italic mt-3" style={{ color: '#a0aec0' }}>
                  {result.data.divineNames.reason}
                </p>
                <div className="mt-4 flex justify-center">
                  <AudioButton text={result.data.divineNames.combined} label="Écouter les noms divins" />
                </div>

                <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(245,200,66,0.2)' }}>
                  <BlocTitle>Verset Coranique</BlocTitle>
                  <p className="arabic text-or text-[1.8em]">{result.data.verse.arabicWithHarakat || result.data.verse.arabic}</p>
                  <p className="mt-3 text-white">
                    Sourate {result.data.verse.surah} — Verset {result.data.verse.ayah}
                  </p>
                  <p className="italic mt-2" style={{ color: '#a0aec0' }}>
                    {result.data.verse.meaning}
                  </p>
                  <p className="mt-2 text-white">{result.data.verse.reason}</p>
                  <div className="mt-4 flex justify-center">
                    <AudioButton text={result.data.verse.arabic} label="Écouter le verset" />
                  </div>
                </div>
              </div>

              <Separateur />

              {/* CARTE 3 — Comment utiliser ce secret ? (7 étapes fixes).
                  Le carré magique (Étape 5) n'est plus généré ni affiché
                  ici — renvoie vers la fonctionnalité Carré Magique, avec
                  le même nombre (result.PM, calcul inchangé) et le même
                  format pré-remplis. */}
              <div className="carte rounded-lg">
                <BlocTitle>COMMENT UTILISER CE SECRET ?</BlocTitle>
                <p className="text-white text-sm text-center mb-5">
                  Écris les éléments suivants à l'encre de safran et à l'eau de rose, sur un support propre.
                </p>
                <div className="flex flex-col gap-5 text-left">
                  <div>
                    <p className="text-white font-bold">Étape 1 — Bismillah</p>
                    <p className="arabic text-or text-[1.6em] mt-1">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris Bismillah 1 fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 2 — Salat al-Nabi</p>
                    <p className="arabic text-or text-[1.6em] mt-1">اللَّهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Écris la salat al-Nabi 1 fois.</p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 3 — Les noms divins</p>
                    <p className="arabic text-or text-[1.6em] mt-1">{result.data.divineNames.combined}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                      Écris ces noms divins {divineNamesWriteReps} fois.
                    </p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 4 — Le verset coranique</p>
                    <p className="arabic text-or text-[1.6em] mt-1">{result.data.verse.arabicWithHarakat || result.data.verse.arabic}</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                      Écris ce verset {verseWriteReps} fois.
                    </p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 5 — Le carré magique</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                      Écris le carré magique {result.data.talisman.squareType} — {squareSize} fois.
                    </p>
                    <Link
                      to={`/carres-magiques?pm=${result.PM}&size=${squareSize}`}
                      className="btn-secondaire rounded inline-block mt-2"
                    >
                      Générer mon carré magique ({result.data.talisman.squareType})
                    </Link>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 6 — Laver l'écriture</p>
                    <p className="text-sm mt-1 text-white">
                      Après avoir terminé l'écriture, lave-la avec de l'eau propre et conserve le liquide dans un
                      récipient propre.
                    </p>
                  </div>

                  <div>
                    <p className="text-white font-bold">Étape 7 — Ajouter le parfum et les plantes</p>
                    <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                      Travail sélectionné : {objective}
                    </p>

                    <p className="text-or font-bold mt-4">
                      {isProtection ? 'Plantes adaptées à la protection' : 'Plantes adaptées à ton objectif'}
                    </p>
                    {result.plants.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {result.plants.map((p) => (
                          <div key={p.number} className="rounded-lg overflow-hidden" style={{ border: '1px solid #f5c842' }}>
                            <div className="px-4 py-2 bg-or">
                              <p className="text-white font-bold text-sm">
                                Plante {p.number} — {p.nomFrancais}
                              </p>
                            </div>
                            <div className="p-4 text-center" style={{ background: '#0d2b1a' }}>
                              <p className="text-white font-bold text-sm">
                                {p.nomBambara} / <span className="italic">{p.nomScientifique}</span>
                              </p>
                              <p className="text-white text-sm mt-1">Partie : {p.partie}</p>
                              <p className="text-white text-sm">Quantité : {p.quantite}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-sm mt-4 text-white">
                      {isProtection
                        ? "Prépare une infusion avec les plantes indiquées. Laisse refroidir, puis filtre la préparation. Utilise-la conformément aux instructions de ton talisman."
                        : "Prépare une infusion avec les plantes indiquées. Laisse refroidir, puis filtre la préparation. Ajoute ensuite un parfum sans alcool adapté à ton objectif, conformément aux instructions de ton talisman."}
                    </p>
                  </div>
                </div>
              </div>

              <Separateur />

              {/* CARTE 4 — Zikr Quotidien : les étapes "Noms divins" (3),
                  "Verset" (4) et "Invocation" (5) réutilisent directement
                  les données déjà générées plus haut au lieu de faire
                  confiance à Gemini pour se recopier lui-même (c'est cette
                  auto-référence qui causait des affichages de clés brutes
                  sur d'autres fonctionnalités du site). La durée reprend
                  celle du talisman, une seule source de vérité. */}
              <div className="carte rounded-lg">
                <BlocTitle>Zikr Quotidien</BlocTitle>
                <p className="text-center text-white">
                  Meilleur moment : {result.data.zikr.bestTime} — Durée : {result.data.talisman.ritualDuration}
                </p>

                <div className="flex flex-col gap-4 mt-5">
                  {result.data.zikr.steps.map((step) => {
                    let arabic = step.arabic;
                    let repetitions = step.repetitions;
                    let meaning: string | null = null;
                    if (step.order === 3) {
                      arabic = result.data.divineNames.combined;
                      repetitions = divineNameZikrReps;
                    } else if (step.order === 4) {
                      arabic = result.data.verse.arabicWithHarakat || result.data.verse.arabic;
                    } else if (step.order === 5) {
                      arabic = result.data.invocation.arabicWithHarakat;
                      repetitions = result.data.invocation.repetitions;
                      meaning = result.data.invocation.meaning;
                    }
                    return (
                      <div key={step.order} className="rounded-lg p-4" style={{ background: '#0a0f2e' }}>
                        <p className="text-or font-bold">
                          {step.order}. {step.title}
                        </p>
                        <p className="arabic text-or mt-2">{arabic}</p>
                        {meaning && (
                          <p className="italic text-sm mt-2 text-center text-white">{meaning}</p>
                        )}
                        <div className="flex justify-center mt-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-or text-white">
                            {repetitions} fois
                          </span>
                        </div>
                        {step.note && (
                          <p className="text-sm mt-2 text-center" style={{ color: '#a0aec0' }}>
                            {step.note}
                          </p>
                        )}
                        {meaning && (
                          <div className="mt-3 flex justify-center">
                            <AudioButton text={arabic} label="Écouter l'invocation" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg p-4 mt-5 text-center" style={{ border: '1px solid #f5c842' }}>
                  <p className="text-or text-sm">
                    Commencer par Bismillah. Terminer par Al-Hamdulillah. Faire ce zikr sans interruption pendant{' '}
                    {result.data.talisman.ritualDuration}.
                  </p>
                </div>
              </div>

              <Separateur />

              {/* CARTE 5 — Sacrifice conseillé (règle PM%4/PM%3 déterministe,
                  identique à celle déjà utilisée ailleurs sur le site —
                  voir buildSecretsPrompt). */}
              <div className="carte rounded-lg">
                <BlocTitle>Sacrifice conseillé</BlocTitle>
                <p className="text-white text-center">{result.data.sacrifice.reason}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {result.data.sacrifice.offerings.map((o, i) => (
                    <p key={i} className="text-sm text-white">
                      {o.item} — {o.quantity} → {o.meaning}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-sm" style={{ color: '#a0aec0' }}>
                  À donner à : {result.data.sacrifice.recipient}
                </p>
                <p className="text-sm" style={{ color: '#a0aec0' }}>
                  Moment : {result.data.sacrifice.timing}
                </p>
                <p className="mt-3 text-white">{result.data.sacrifice.instructions}</p>
              </div>

              <Separateur />

              {/* CARTE 6 — Résultat attendu */}
              <div className="carte rounded-lg text-center">
                <BlocTitle>Résultat attendu</BlocTitle>
                <p className="text-white">{result.data.expectedResult}</p>
              </div>

              <Separateur />

              {/* BLOC 11 — Avertissements */}
              <div className="flex flex-col gap-3">
                {result.data.warnings.map((w, i) => (
                  <div key={i} className="rounded-lg p-4 text-center" style={{ border: '1px solid #f57c00' }}>
                    <p style={{ color: '#f57c00' }}>⚠ {w}</p>
                  </div>
                ))}
              </div>

              <Separateur />

              {/* BLOC 12 — Conclusion */}
              <div className="rounded-lg text-center p-8" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
                <p className="italic text-white">{result.data.conclusion}</p>
              </div>
            </div>

            <Separateur />

            <div className="flex justify-center mb-4">
              <AudioButton
                text={`${result.data.hiddenMeaning.nameSecret} ${result.data.divineNames.reason} ${result.data.conclusion}`}
                label="Écouter mes secrets"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button onClick={handleExportPDF} className="btn-principal rounded w-full md:flex-1">
                Télécharger en PDF
              </button>
              <button onClick={handleReset} className="btn-secondaire rounded w-full md:flex-1">
                Nouvelle consultation
              </button>
            </div>
          </FadeIn>
        )}
      </div>

      {showCreditModal && (
        <CreditModal toolName="Secrets" balance={modalBalance} onClose={() => setShowCreditModal(false)} />
      )}
    </div>
  );
}
