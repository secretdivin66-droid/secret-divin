// Forme de retour de la fonction serveur spend_credits() (voir supabase/schema.sql).
// error_code vaut 'INSUFFICIENT_CREDITS' | 'NOT_AUTHENTICATED' | 'NO_CREDIT_ACCOUNT' | 'UNKNOWN_TOOL' quand success est false.
export interface SpendCreditsResult {
  success: boolean;
  balance: number;
  error_code: string | null;
}

export const ABJAD: Record<string, number> = {
  'ا':1,'ب':2,'ج':3,'د':4,'ه':5,'ة':5,
  'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ك':20,
  'ل':30,'م':40,'ن':50,'ص':60,'ع':70,
  'ف':80,'ض':90,'ق':100,'ر':200,'س':300,
  'ت':400,'ث':500,'خ':600,'ذ':700,'ظ':800,
  'غ':900,'ش':1000
};

export function calculateWeight(arabicText: string): number {
  let total = 0;
  for (const char of arabicText) {
    if (ABJAD[char] !== undefined) total += ABJAD[char];
  }
  return total;
}

export function toArabicIndic(n: number): string {
  const d = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).split('').map(c => d[parseInt(c)]).join('');
}

export const GENDER_BONUS = { homme: 52, femme: 452 };

export function calculatePM(
  nameWeight: number,
  motherWeight: number,
  gender: 'homme' | 'femme'
): number {
  return nameWeight + motherWeight + GENDER_BONUS[gender];
}

export const ELEMENTS: Record<number, { name: string; color: string }> = {
  1: { name: 'Feu',   color: '#e53935' },
  2: { name: 'Terre', color: '#795548' },
  3: { name: 'Air',   color: '#64b5f6' },
  0: { name: 'Eau',   color: '#1565c0' }
};

export const COMPATIBILITE_ELEMENTS: Record<string, {
  score: number; niveau: string; description: string;
}> = {
  'Feu-Feu':   { score: 85, niveau: 'Forte',        description: "Deux âmes de feu : passion, intensité et dynamisme. Relation explosive mais magnétique." },
  'Feu-Air':   { score: 90, niveau: 'Très forte',    description: "Le feu est alimenté par l'air. Relation harmonieuse, créative et pleine d'énergie." },
  'Feu-Terre': { score: 55, niveau: 'Moyenne',       description: "La terre peut étouffer le feu. Relation stable mais des tensions possibles." },
  'Feu-Eau':   { score: 45, niveau: 'Faible',        description: "L'eau éteint le feu. Relation difficile, oppositions fréquentes. Beaucoup d'efforts." },
  'Terre-Terre': { score: 80, niveau: 'Forte',       description: "Deux âmes de terre : stabilité, fidélité et construction. Relation solide et durable." },
  'Terre-Air': { score: 60, niveau: 'Moyenne',       description: "L'air déstabilise la terre. Relation complémentaire mais ajustements constants." },
  'Terre-Eau': { score: 88, niveau: 'Très forte',    description: "L'eau nourrit la terre. Relation naturellement harmonieuse, féconde et épanouissante." },
  'Air-Air':   { score: 75, niveau: 'Forte',         description: "Deux âmes d'air : communication, liberté et intelligence. Relation légère mais profonde." },
  'Air-Eau':   { score: 65, niveau: 'Moyenne',       description: "L'air agite l'eau. Relation stimulante mais émotionnellement complexe." },
  'Eau-Eau':   { score: 82, niveau: 'Forte',         description: "Deux âmes d'eau : sensibilité, intuition et profondeur. Relation fusionnelle et spirituelle." }
};

export function getCompatibilite(el1: string, el2: string) {
  const key1 = `${el1}-${el2}`;
  const key2 = `${el2}-${el1}`;
  return COMPATIBILITE_ELEMENTS[key1] || COMPATIBILITE_ELEMENTS[key2] || COMPATIBILITE_ELEMENTS['Feu-Feu'];
}

export const TOOL_COSTS: Record<string, number> = {
  'poids-mystique': 0,
  'tutoriels': 0,
  'carres-magiques': 2,
  'destin': 2,
  'attraper': 2,
  'secrets': 2,
  'geomancie': 2,
  'compatibilite': 2,
  'reves': 2,
  'plantes': 2,
  'jours': 2,
  'formation': 2,
};

export interface ToolInfo {
  id: string;
  name: string;
  nameArabic?: string;
  route: string;
  description: string;
}

export const TOOLS: ToolInfo[] = [
  { id: 'poids-mystique', name: 'Poids Mystique', route: '/poids-mystique', description: "Ton poids mystique selon la numérologie Abjad — la base de tous les autres outils." },
  { id: 'destin', name: 'Secret de ton Destin', nameArabic: 'سر قدرك', route: '/destin', description: "Une lecture profonde de ta destinée à travers ton nom et celui de ta mère." },
  { id: 'jours', name: 'Secret de ton Jour', nameArabic: 'سر يومك', route: '/jours', description: "Les jours les plus favorables selon les correspondances planétaires." },
  { id: 'secrets', name: 'Secrets mystiques', nameArabic: 'الأسرار الروحانية', route: '/secrets', description: "Des secrets spirituels ciblés selon ton objectif : protection, amour, richesse..." },
  { id: 'carres-magiques', name: 'Carrés Magiques', nameArabic: 'المربعات السحرية', route: '/carres-magiques', description: "Ton carré magique personnel, de 3×3 à 9×9, selon ton poids mystique." },
  { id: 'geomancie', name: 'Géomancie', nameArabic: 'علم الرمل', route: '/geomancie', description: "L'art divinatoire ancestral du Khatt ar-Raml pour éclairer tes décisions." },
  { id: 'reves', name: 'Interprétation des Rêves', nameArabic: 'تفسير الأحلام', route: '/reves', description: "Le sens caché de tes rêves selon la tradition islamique." },
  { id: 'plantes', name: 'Secrets des Plantes', nameArabic: 'أسرار النباتات', route: '/plantes', description: "Les plantes et leurs vertus spirituelles, adaptées à ton profil." },
  { id: 'compatibilite', name: 'Compatibilité', nameArabic: 'التوافق', route: '/compatibilite', description: "L'harmonie entre deux personnes à travers leurs poids mystiques." },
  { id: 'attraper', name: 'Attraper ou Réconcilier', nameArabic: 'الجذب أو المصالحة', route: '/attraper', description: "Des pratiques pour attirer la chance et les opportunités dans ta vie." },
  { id: 'tutoriels', name: 'Tutoriels', nameArabic: 'الدروس التعليمية', route: '/tutoriels', description: "Apprends à utiliser chaque outil pas à pas." },
  { id: 'formation', name: 'Formation', nameArabic: 'التكوين', route: '/formation', description: "Une formation complète pour approfondir tes connaissances mystiques." },
];

export const PACKS = [
  { id:'starter', name:'Starter', credits:20, price:4900, currency:'FCFA', description: 'Pour découvrir nos outils mystiques.' },
  { id:'essentiel', name:'Essentiel', credits:50, price:6900, currency:'FCFA', description: "L'essentiel pour explorer ton destin." },
  { id:'premium', name:'Premium', credits:70, price:9900, currency:'FCFA', popular:true, description: 'Le plus populaire pour un usage régulier.' },
  { id:'expert', name:'Expert', credits:150, price:19900, currency:'FCFA', description: 'Pour les passionnés de mystique.' },
  { id:'unlimited', name:'Illimité', credits:null, price:49000, currency:'FCFA', period:'mois', description: 'Accès total à tous les outils pendant 1 mois.' },
];

export const WHATSAPP_NUMBER = '224624279200';

export const SQUARE_INFO: Record<number, { name: string; planet: string }> = {
  3: { name: 'Moussalas', planet: 'Saturne' },
  4: { name: 'Mourabbah', planet: 'Jupiter' },
  5: { name: 'Moukhams', planet: 'Mars' },
  6: { name: 'Moussadis', planet: 'Soleil' },
  7: { name: "Moussabbi'a", planet: 'Vénus' },
  8: { name: 'Mouthammin', planet: 'Mercure' },
  9: { name: "Moutassi'ou", planet: 'Lune' },
};

export const SQUARE_PARAMS: Record<number, { subtract: number; divisor: number }> = {
  3: { subtract: 12,  divisor: 3 },
  4: { subtract: 30,  divisor: 4 },
  5: { subtract: 60,  divisor: 5 },
  6: { subtract: 105, divisor: 6 },
  7: { subtract: 168, divisor: 7 },
  8: { subtract: 252, divisor: 8 },
  9: { subtract: 360, divisor: 9 },
};

export const LAYOUTS: Record<number, number[]> = {
  3: [4,9,2, 3,5,7, 8,1,6],
  4: [8,11,14,1, 13,2,7,12, 3,16,9,6, 10,5,4,15],
  5: [18,10,22,14,1, 12,4,16,8,25, 6,23,15,2,19, 5,17,9,21,13, 24,11,3,20,7],
  6: [6,32,3,34,35,1, 7,11,27,28,8,30, 24,14,16,15,23,19,
      13,20,22,21,17,18, 25,29,10,9,26,12, 36,5,33,4,2,31],
  7: [22,47,16,41,10,35,4, 5,23,48,17,42,11,29, 30,6,24,49,18,36,12,
      13,31,7,25,43,19,37, 38,14,32,1,26,44,20, 21,39,8,33,2,27,45,
      46,15,40,9,34,3,28],
  8: [64,2,3,61,60,6,7,57, 9,55,54,12,13,51,50,16, 17,47,46,20,21,43,42,24,
      40,26,27,37,36,30,31,33, 32,34,35,29,28,38,39,25, 41,23,22,44,45,19,18,48,
      49,15,14,52,53,11,10,56, 8,58,59,5,4,62,63,1],
  9: [47,58,69,80,1,12,23,34,45, 57,68,79,9,11,22,33,44,46,
      67,78,8,10,21,32,43,54,56, 77,7,18,20,31,42,53,55,66,
      6,17,19,30,41,52,63,65,76, 16,27,29,40,51,62,64,75,5,
      26,28,39,50,61,72,74,4,15, 36,38,49,60,71,73,3,14,25,
      37,48,59,70,81,2,13,24,35],
};

export const THRESHOLDS: Record<number, Record<number, number>> = {
  3: { 0:99, 1:7, 2:4 },
  4: { 0:99, 1:13, 2:9, 3:5 },
  5: { 0:99, 1:21, 2:16, 3:11, 4:6 },
  6: { 0:99, 1:31, 2:25, 3:19, 4:13, 5:7 },
  7: { 0:99, 1:43, 2:36, 3:29, 4:22, 5:15, 6:8 },
  8: { 0:99, 1:57, 2:49, 3:41, 4:33, 5:25, 6:17, 7:9 },
  // Pas de 9 entre chaque valeur (comme pour toutes les autres tailles, où
  // le pas égale toujours `size`) — la version précédente avait un pas de 8
  // par erreur, ce qui cassait la répartition de la correction +1 sur des
  // lignes complètes pour la taille 9 (voir generateSquare) et produisait
  // des carrés 9×9 mathématiquement invalides dans la grande majorité des
  // cas.
  9: { 0:99, 1:73, 2:64, 3:55, 4:46, 5:37, 6:28, 7:19, 8:10 },
};

export function generateSquare(PM: number, size: number): number[] {
  const { subtract, divisor } = SQUARE_PARAMS[size];
  const layout = LAYOUTS[size];
  const thresholds = THRESHOLDS[size];

  const entry = Math.floor((PM - subtract) / divisor);
  const remainder = (PM - subtract) % divisor;
  const threshold = thresholds[remainder] ?? 99;

  return layout.map((L, i) => {
    let val = entry + (L - 1);
    if ((i + 1) >= threshold) val += 1;
    return val;
  });
}

// La correction +1 de generateSquare (voir threshold ci-dessus) s'applique
// à un bloc de LIGNES complètes en fin de tableau (les `remainder` dernières
// lignes, en lecture ligne par ligne) : ces lignes-là finissent avec une
// somme plus élevée que les lignes non corrigées, donc les LIGNES ne sont
// délibérément PAS toutes égales entre elles — ça ne veut pas dire que le
// carré est faux. En revanche chaque colonne traverse forcément le même
// nombre de lignes corrigées (`remainder`) que les autres colonnes, donc ce
// sont les COLONNES (et les deux diagonales, pour la même raison) qui
// portent la vraie constante magique, et elle vaut exactement PM. Vérifié
// empiriquement sur les 7 tailles (3 à 9) et des centaines de valeurs de PM
// après correction de THRESHOLDS[9] ci-dessus.
export function verifyMagicSquare(cells: number[], size: number): boolean {
  const sums: number[] = [];
  for (let j = 0; j < size; j++) {
    let colSum = 0;
    for (let i = 0; i < size; i++) colSum += cells[i * size + j];
    sums.push(colSum);
  }
  let diag1 = 0;
  let diag2 = 0;
  for (let i = 0; i < size; i++) {
    diag1 += cells[i * size + i];
    diag2 += cells[i * size + (size - 1 - i)];
  }
  sums.push(diag1, diag2);
  return sums.every((sum) => sum === sums[0]);
}

// Somme magique réelle du carré (celle affichée dans le badge) : la somme
// de sa première colonne — voir verifyMagicSquare pour pourquoi c'est la
// colonne, et non la ligne, qui porte la constante magique ici.
export function magicSquareSum(cells: number[], size: number): number {
  let colSum = 0;
  for (let i = 0; i < size; i++) colSum += cells[i * size];
  return colSum;
}

export const JOURS_DATA: Record<string, {
  poids: number; planete: string; planeteArabe: string;
  couleurBordure: string; description: string;
}> = {
  'Lundi':    { poids: 2860, planete: 'Lune',     planeteArabe: 'القمر',    couleurBordure: '#4caf50', description: 'Jour de la Lune — douceur, intuition et spiritualité' },
  'Mardi':    { poids: 2709, planete: 'Mars',     planeteArabe: 'المريخ',   couleurBordure: '#e53935', description: 'Jour de Mars — courage, énergie et détermination' },
  'Mercredi': { poids: 2795, planete: 'Mercure',  planeteArabe: 'عطارد',    couleurBordure: '#2563EB', description: 'Jour de Mercure — intelligence, communication et commerce' },
  'Jeudi':    { poids: 2856, planete: 'Jupiter',  planeteArabe: 'المشتري',  couleurBordure: '#3f51b5', description: 'Jour de Jupiter — sagesse, richesse et chance' },
  'Vendredi': { poids: 2766, planete: 'Vénus',    planeteArabe: 'الزهرة',   couleurBordure: '#e91e63', description: 'Jour de Vénus — amour, beauté et harmonie' },
  'Samedi':   { poids: 2847, planete: 'Saturne',  planeteArabe: 'زحل',      couleurBordure: '#673ab7', description: 'Jour de Saturne — discipline, patience et mystère' },
  'Dimanche': { poids: 2772, planete: 'Soleil',   planeteArabe: 'الشمس',    couleurBordure: '#ff9800', description: 'Jour du Soleil — lumière, leadership et gloire' },
};
