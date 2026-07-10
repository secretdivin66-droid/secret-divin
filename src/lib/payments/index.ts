import type { PaymentProvider } from './types';
import { CinetPayProvider } from './cinetPayProvider';

export * from './types';

// Point d'extension unique : brancher un nouveau fournisseur de paiement ne
// nécessite que d'implémenter PaymentProvider et de changer cette ligne.
export const paymentProvider: PaymentProvider = new CinetPayProvider();
