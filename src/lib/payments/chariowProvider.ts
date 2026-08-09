import type { PaymentProvider, SubscribeParams, SubscribeResult } from './types';
import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chariow-initiate-checkout`;

interface ChariowFunctionResponse {
  step?: 'payment' | 'completed' | 'already_purchased';
  checkoutUrl?: string;
  message?: string | null;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_contact_info: 'Prénom, nom et téléphone sont requis pour payer avec Chariow.',
  incomplete_profile: 'Un email est requis sur ton compte pour payer avec Chariow.',
  plan_not_configured_for_chariow: "Ce plan n'est pas encore disponible via ce moyen de paiement.",
  plan_not_payable: "Ce plan n'est pas payant.",
  unknown_plan: 'Plan inconnu.',
};

// Même schéma d'appel que geminiProxy.ts (fetch brut + Authorization
// Bearer depuis la session) plutôt que supabase.functions.invoke, pour
// rester cohérent avec le reste du projet.
export class ChariowProvider implements PaymentProvider {
  name = 'chariow';

  async initiateSubscription(params: SubscribeParams): Promise<SubscribeResult> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return { status: 'error', message: 'Tu dois être connecté pour t\'abonner.' };
    }

    let response: Response;
    try {
      response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          planId: params.planId,
          redirectUrl: `${window.location.origin}/billing`,
          firstName: params.firstName,
          lastName: params.lastName,
          phone: { number: params.phoneNumber, countryCode: params.phoneCountryCode },
        }),
      });
    } catch {
      return { status: 'error', message: 'Impossible de contacter le serveur de paiement, réessaie plus tard.' };
    }

    const json: ChariowFunctionResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = (json.error && ERROR_MESSAGES[json.error]) ?? 'Le paiement Chariow a échoué, réessaie plus tard.';
      return { status: 'error', message };
    }

    if (json.step === 'payment' && json.checkoutUrl) {
      return { status: 'redirect', redirectUrl: json.checkoutUrl };
    }

    if (json.step === 'completed' || json.step === 'already_purchased') {
      return { status: 'unavailable', message: json.message ?? 'Cet achat a déjà été finalisé.' };
    }

    return { status: 'error', message: 'Réponse inattendue du serveur de paiement.' };
  }
}
