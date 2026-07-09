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

export const PAYS_LIST = [
  'Guinée',
  'Sénégal',
  'Mali',
  "Côte d'Ivoire",
  'Burkina Faso',
  'Niger',
  'Mauritanie',
  'Cameroun',
  'France',
  'Belgique',
  'Canada',
  'Autre',
];

export const LANGUES = ['Français', 'Arabe', 'Bambara', 'Wolof', 'Peul', 'Soussou', 'Malinké', 'Anglais', 'Autre'];

export const ABONNEMENT_PRIX_FCFA = 5000;

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
  specialites: string[];
  pays: string;
  ville: string;
  langues: string[];
  whatsapp: string;
  tarifs_description: string | null;
  annees_experience: number;
  is_verified: boolean;
  is_active: boolean;
  abonnement_actif: boolean;
  abonnement_expire_le: string | null;
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
