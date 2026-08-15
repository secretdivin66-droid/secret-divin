import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chariow-marabout-checkout`;

export interface MaraboutCheckoutParams {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export type MaraboutCheckoutResult =
  | { status: 'redirect'; redirectUrl: string }
  | { status: 'unavailable' | 'error'; message: string; errorCode?: string };

interface ChariowFunctionResponse {
  step?: 'payment' | 'completed' | 'already_purchased';
  checkoutUrl?: string;
  message?: string | null;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_contact_info: 'Prénom, nom et téléphone sont requis pour payer avec Chariow.',
  incomplete_profile: 'Un email est requis sur ton compte pour payer avec Chariow.',
  no_marabout_profile: "Tu n'as pas encore de profil marabout — inscris-toi d'abord.",
  not_configured_for_chariow: "Le paiement en ligne n'est pas encore disponible, réessaie plus tard.",
};

// Même schéma d'appel que chariowCreditsCheckout.ts (fetch brut +
// Authorization Bearer depuis la session) — abonnement marabout, voir
// chariow-marabout-checkout/chariow-pulse-webhook (migration 0032).
export async function initiateMaraboutSubscriptionCheckout(params: MaraboutCheckoutParams): Promise<MaraboutCheckoutResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'Tu dois être connecté pour payer ton abonnement.' };
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
        redirectUrl: `${window.location.origin}/marabout-dashboard`,
        firstName: params.firstName,
        lastName: params.lastName,
        phone: { number: params.phoneNumber, countryCode: params.phoneCountryCode },
      }),
    });
  } catch {
    return { status: 'error', message: 'Impossible de contacter le serveur de paiement, réessaie plus tard.', errorCode: 'network_error' };
  }

  const json: ChariowFunctionResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (json.error && ERROR_MESSAGES[json.error]) ?? 'Le paiement Chariow a échoué, réessaie plus tard.';
    return { status: 'error', message, errorCode: json.error };
  }

  if (json.step === 'payment' && json.checkoutUrl) {
    return { status: 'redirect', redirectUrl: json.checkoutUrl };
  }

  if (json.step === 'completed' || json.step === 'already_purchased') {
    return { status: 'unavailable', message: json.message ?? 'Cet achat a déjà été finalisé.' };
  }

  // Voir chariowCreditsCheckout.ts : même traitement, réponse 200 de forme
  // inattendue considérée comme "Chariow ne peut pas servir cette requête"
  // plutôt qu'une simple erreur générique.
  return { status: 'error', message: 'Réponse inattendue du serveur de paiement.', errorCode: 'unexpected_response' };
}
