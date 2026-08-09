// Contrat que tout fournisseur de paiement doit respecter. Brancher un
// nouveau moyen de paiement (CinetPay, Stripe...) ne nécessite que
// d'implémenter cette interface — rien côté pages/composants n'a besoin de
// changer.

export interface SubscribeParams {
  planId: string;
  userId: string;
  userEmail: string;
  // Optionnels : certains fournisseurs (Chariow) exigent ces infos de
  // contact au checkout alors que le profil permanent ne les contient pas
  // forcément — collectées à la volée juste avant le paiement plutôt que
  // stockées sur `profiles`. Un fournisseur qui n'en a pas besoin les
  // ignore simplement.
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
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
