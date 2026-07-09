export const BLOG_CATEGORIES = [
  'Spiritualité islamique',
  'Géomancie africaine',
  'Plantes mystiques',
  'Carrés magiques',
  'Rêves',
  'Poids mystique',
  'Talismans',
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
