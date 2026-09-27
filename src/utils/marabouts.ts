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

// Formules annuelles (migration 0038, remplace l'ancien abonnement mensuel
// unique à 5900 FCFA). Source unique du prix affiché côté frontend — même
// principe que `plans`/`credit_packs`, évite de reproduire la duplication
// à 4 endroits déjà rencontrée avec l'ancien prix (voir migration 0033).
export const MARABOUT_TIERS = [
  {
    id: 'standard' as const,
    label: 'Standard',
    priceFcfa: 9900,
    features: ['Profil visible sur l\'annuaire public'],
  },
  {
    id: 'vip' as const,
    label: 'VIP',
    priceFcfa: 29000,
    features: [
      'Profil visible sur l\'annuaire public',
      'Badge VIP bleu sur le profil et dans l\'annuaire',
      'Profil mis en avant (priorité sur les profils Standard)',
      'Reçoit des demandes de consultation sur des secrets/travaux spécifiques',
      'Accès direct au fondateur par WhatsApp depuis son espace membre',
    ],
  },
];

export type MaraboutTierId = (typeof MARABOUT_TIERS)[number]['id'];

export function maraboutTierLabel(tierId: string): string {
  return MARABOUT_TIERS.find((t) => t.id === tierId)?.label ?? tierId;
}

export function maraboutTierPrice(tierId: string): number {
  return MARABOUT_TIERS.find((t) => t.id === tierId)?.priceFcfa ?? 0;
}

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
  subscription_tier: MaraboutTierId;
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
