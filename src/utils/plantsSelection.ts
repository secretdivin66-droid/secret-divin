import { callGeminiProxy } from '../lib/geminiProxy';

export interface PlantData {
  number: number;
  nomFrancais: string;
  nomBambara: string;
  nomScientifique: string;
  lienWikipedia: string;
  partie: string;
  quantite: string;
  properties: string;
  why: string;
}

// Règles de sélection des plantes — texte source unique, identique à celui
// déjà utilisé par "Plantes Mystiques" (buildPlantesPrompt), réutilisé ici
// tel quel plutôt que redéfini, pour que toute fonctionnalité du site
// sélectionnant des plantes applique exactement les mêmes critères.
export const PLANT_COUNT_RULE = `RÈGLE nombre de plantes :
Objectif simple (1 problème clair) : 1 à 3 plantes.
Objectif complexe (plusieurs problèmes) : 4 à 5 plantes.
Objectif très complexe : 6 à 7 plantes.
Maximum absolu : 7 plantes.`;

export const PLANT_SPECIES_RULES = `RÈGLES plantes :
Uniquement vraies plantes africaines connues en médecine traditionnelle. Toujours nom bambara. Toujours nom scientifique exact. Toujours lien Wikipedia valide.
Plantes disponibles en Afrique de l'Ouest. Varier les parties utilisées.`;

export const PLANT_SELECTION_RULES = `${PLANT_COUNT_RULE}\n\n${PLANT_SPECIES_RULES}`;

// Schéma JSON du tableau "plants" — même structure de fiche plante que
// "Plantes Mystiques", réutilisée telle quelle (pas une nouvelle base de
// plantes, juste le même format de sélection).
export function plantsArraySchemaSnippet(): string {
  return `[
    {
      "number": 1,
      "nomFrancais": "Nom français",
      "nomBambara": "Nom bambara",
      "nomScientifique": "Nom scientifique exact",
      "lienWikipedia": "https://fr.wikipedia.org/wiki/...",
      "partie": "feuilles/écorce/racines/tout",
      "quantite": "une grosse poignée de feuilles / 3 morceaux d'écorce / ...",
      "properties": "Propriétés spirituelles et physiques pour cet objectif.",
      "why": "Pourquoi cette plante est choisie pour cet objectif spécifique."
    }
  ]`;
}

// Détermine si un travail relève de la protection/désenvoûtement, à partir
// d'un ou plusieurs textes libres (catégorie, objectif, description) — même
// règle que celle déjà utilisée par "Plantes Mystiques", désormais partagée
// avec "Secrets Mystiques Cachés" pour décider si un parfum doit être
// recommandé en plus des plantes.
export function isProtectionWorkType(...texts: string[]): boolean {
  return texts.some((t) =>
    /protection|désenvoût|desenvout|envoûtement|envoutement|sorcellerie|mauvais\s?(œ|oe)il/i.test(t)
  );
}

async function callGeminiPlantsJSON(prompt: string): Promise<{ plants: PlantData[] }> {
  const json = await callGeminiProxy('gemini-3.1-flash-lite', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1800 },
  });
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Sélectionne les plantes adaptées à un objectif donné, en appliquant
// exactement les mêmes règles que "Plantes Mystiques" (PLANT_SELECTION_RULES
// + même schéma de fiche plante) — à utiliser par toute fonctionnalité du
// site qui a seulement besoin de la liste de plantes, sans régénérer tout
// le reste (versets, préparation, etc.).
export async function selectPlantsForObjective(params: {
  objectiveText: string;
  workType: string;
  PM: number;
}): Promise<PlantData[]> {
  const { objectiveText, workType, PM } = params;
  const prompt = `Tu es un maître herboriste de la tradition mystique islamique ouest-africaine. Tu combines la phytothérapie traditionnelle africaine avec la science des versets coraniques. Tu parles avec 'tu' en français.

Objectif décrit : ${objectiveText}
Type de travail : ${workType}
Poids Mystique (PM) de la personne : ${PM}

${PLANT_SELECTION_RULES}

LIMITE DE LONGUEUR : la somme de tous les textes du JSON ne doit jamais dépasser 250 mots au total.

Retourne UNIQUEMENT du JSON valide, exactement dans ce format :
{
  "plants": ${plantsArraySchemaSnippet()}
}`;

  const data = await callGeminiPlantsJSON(prompt);
  return data.plants;
}
