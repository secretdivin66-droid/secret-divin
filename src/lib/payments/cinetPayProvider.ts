import type { PaymentProvider, SubscribeParams, SubscribeResult } from './types';

// Provider CinetPay — placeholder en attendant les accès API. Documente le
// contrat que l'implémentation réelle devra respecter (appeler l'API
// CinetPay depuis une Edge Function avec les clés secrètes côté serveur,
// jamais depuis le client, puis renvoyer une URL de paiement à
// rediriger). Tant qu'il n'est pas branché, initiateSubscription renvoie
// toujours 'unavailable' : aucune écriture en base n'a lieu tant qu'aucun
// paiement n'a réellement été initié.
//
// Pour brancher CinetPay plus tard :
// 1. Ajouter CINETPAY_API_KEY/CINETPAY_SITE_ID aux secrets d'une Edge
//    Function (voir supabase/functions/gemini-proxy pour le même schéma).
// 2. Remplacer le corps de initiateSubscription() par un appel à cette
//    Edge Function, qui retourne { status: 'redirect', redirectUrl }.
// 3. Le webhook de confirmation de paiement CinetPay appelle
//    grant_subscription() (SECURITY DEFINER, réservée à service_role,
//    voir supabase/schema.sql) pour activer réellement l'abonnement.
export class CinetPayProvider implements PaymentProvider {
  name = 'cinetpay';

  async initiateSubscription(_params: SubscribeParams): Promise<SubscribeResult> {
    return {
      status: 'unavailable',
      message: "Le paiement en ligne arrive bientôt. En attendant, contacte-nous sur WhatsApp pour activer ton abonnement.",
    };
  }
}
