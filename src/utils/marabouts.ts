import countries from 'i18n-iso-countries';
import frLocale from 'i18n-iso-countries/langs/fr.json';

countries.registerLocale(frLocale);

export const SPECIALITES = [
  'Géomancie',
  'Carrés magiques',
  'Talismans et rituels',
  'Interprétation des rêves',
  'Plantes mystiques',
  'Destin et numérologie',
  'Protection spirituelle',
  'Mariage et amour',
  'Désenvoûtement',
  'Autre',
];

// Tous les pays (noms français, via i18n-iso-countries — même source que
// ChariowContactModal.tsx pour les indicatifs téléphoniques), plutôt que
// la précédente liste de 12 pays codée en dur. Guinée reste en tête
// (usage historique principal de Secret Divin, voir ChariowContactModal),
// le reste trié alphabétiquement. "Autre" conservé en dernier — déjà
// utilisé par des profils marabouts existants avant cet élargissement.
const ALL_COUNTRY_NAMES = Object.values(countries.getNames('fr', { select: 'official' })).sort((a, b) =>
  a.localeCompare(b, 'fr')
);

export const PAYS_LIST = ['Guinée', ...ALL_COUNTRY_NAMES.filter((p) => p !== 'Guinée'), 'Autre'];

export const LANGUES = ['Français', 'Arabe', 'Bambara', 'Wolof', 'Peul', 'Soussou', 'Malinké', 'Anglais', 'Autre'];

export const ABONNEMENT_PRIX_FCFA = 5900;

export interface MaraboutAvis {
  id: string;
  note: number;
  commentaire: string | null;
  created_at: string;
  user_id: string;
}

export interface Marabout {
  id: string;
  user_id: string;
  nom_complet: string;
  photo_url: string | null;
  description: string;
  specialite: string[];
  pays: string;
  ville: string;
  langues: string[];
  numero_whatsapp: string;
  tarifs_description: string | null;
  annees_experience: number;
  is_verified: boolean;
  is_active: boolean;
  abonnement_actif: boolean;
  abonnement_expire_le: string | null;
  profile_completed_at: string | null;
  vues: number;
  created_at: string;
  updated_at: string;
  marabout_avis?: MaraboutAvis[];
}

export function averageNote(avis: { note: number }[] | undefined): string | null {
  if (!avis || avis.length === 0) return null;
  return (avis.reduce((sum, a) => sum + a.note, 0) / avis.length).toFixed(1);
}

export function whatsappContactUrl(whatsapp: string, message: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
}
