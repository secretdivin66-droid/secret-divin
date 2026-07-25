export const BLOG_CATEGORIES = [
  'Spiritualité islamique',
  'Géomancie africaine',
  'Plantes mystiques',
  'Carrés magiques',
  'Rêves',
  'Poids mystique',
  'Talismans',
  // Ajoutées avec la file thématique d'auto-blog (voir
  // supabase/functions/auto-blog et la migration 0016) : ces thèmes de
  // référence n'avaient pas d'équivalent proche parmi les 7 catégories
  // ci-dessus, contrairement à "Poids mystique"/"Carrés magiques"/"Rêves"/
  // "Plantes mystiques" (réutilisées telles quelles) et "Géomancie"
  // (mappée sur "Géomancie africaine") — sans cet ajout, les articles
  // publiés sous ces thèmes resteraient invisibles au filtre par
  // catégorie de /blog (BlogPage.tsx ne montre que BLOG_CATEGORIES).
  'Secrets Mystiques',
  'Destin',
  'Jours de Naissance',
  'Compatibilité',
  'Formation',
  'Attraper ou Réconcilier',
  'Tutoriels',
];

const DIACRITICS_REGEX = new RegExp('[̀-ͯ]', 'g');

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
