import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fedapay-marabout-checkout`;

export interface MaraboutCheckoutParams {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export type MaraboutCheckoutResult =
  | { status: 'redirect'; redirectUrl: string }
  | { status: 'error'; message: string; errorCode?: string };

interface FedaPayFunctionResponse {
  checkoutUrl?: string;
  reference?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_contact_info: 'Prénom, nom et téléphone sont requis pour payer avec FedaPay.',
  unsupported_country: "Ce pays n'est pas encore pris en charge pour ce moyen de paiement.",
  incomplete_profile: 'Un email est requis sur ton compte pour payer avec FedaPay.',
  no_marabout_profile: "Tu n'as pas encore de profil marabout — inscris-toi d'abord.",
};

// Même schéma d'appel que fedapayCreditsCheckout.ts (fetch brut +
// Authorization Bearer depuis la session) — abonnement marabout, voir
// fedapay-marabout-checkout/fedapay-webhook.
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
        callbackUrl: `${window.location.origin}/marabout-dashboard`,
        firstName: params.firstName,
        lastName: params.lastName,
        phone: { number: params.phoneNumber, countryCode: params.phoneCountryCode },
      }),
    });
  } catch {
    return { status: 'error', message: 'Impossible de contacter le serveur de paiement, réessaie plus tard.', errorCode: 'network_error' };
  }

  const json: FedaPayFunctionResponse = await response.json().catch(() => ({}));

  if (!response.ok || !json.checkoutUrl) {
    const message = (json.error && ERROR_MESSAGES[json.error]) ?? 'Le paiement FedaPay a échoué, réessaie plus tard.';
    return { status: 'error', message, errorCode: json.error };
  }

  return { status: 'redirect', redirectUrl: json.checkoutUrl };
}
