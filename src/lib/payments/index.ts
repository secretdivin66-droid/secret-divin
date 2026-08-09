import type { PaymentProvider } from './types';
import { CinetPayProvider } from './cinetPayProvider';

export * from './types';

// Point d'extension unique : brancher un nouveau fournisseur de paiement ne
// nécessite que d'implémenter PaymentProvider et de changer cette ligne.
// Chariow (chariowProvider.ts) a été réorienté vers les packs de crédits
// (voir BuyButton/CreditsPage) plutôt que les abonnements — les
// abonnements Free/Premium/Pro n'ont pour l'instant aucun moyen de
// paiement réel branché, CinetPayProvider reste le placeholder en
// attendant (voir son propre commentaire).
export const paymentProvider: PaymentProvider = new CinetPayProvider();
