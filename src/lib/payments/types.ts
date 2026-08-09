// Contrat que tout fournisseur de paiement doit respecter. Brancher un
// nouveau moyen de paiement (CinetPay, Stripe...) ne nécessite que
// d'implémenter cette interface — rien côté pages/composants n'a besoin de
// changer.

export interface SubscribeParams {
  planId: string;
  userId: string;
  userEmail: string;
}

export type SubscribeStatus = 'redirect' | 'unavailable' | 'error';

export interface SubscribeResult {
  status: SubscribeStatus;
  redirectUrl?: string;
  message?: string;
}

export interface PaymentProvider {
  name: string;
  initiateSubscription(params: SubscribeParams): Promise<SubscribeResult>;
}
