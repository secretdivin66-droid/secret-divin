import type { PaymentProvider } from './types';
import { ChariowProvider } from './chariowProvider';

export * from './types';

// Point d'extension unique : brancher un nouveau fournisseur de paiement ne
// nécessite que d'implémenter PaymentProvider et de changer cette ligne.
// CinetPayProvider (cinetPayProvider.ts) reste dispo mais inactive tant
// qu'elle n'est pas branchée à une vraie Edge Function — voir son propre
// commentaire.
export const paymentProvider: PaymentProvider = new ChariowProvider();
