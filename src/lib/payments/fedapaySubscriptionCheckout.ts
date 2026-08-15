import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fedapay-subscription-checkout`;

export interface SubscriptionCheckoutParams {
  planId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export type SubscriptionCheckoutResult =
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
  plan_not_payable: "Ce plan n'est pas payant.",
  unknown_plan: 'Plan inconnu.',
};

// Seul moyen de paiement réel branché pour ce domaine (Free/Premium/Pro,
// `plans`) — Chariow a été réorienté vers les packs de crédits le
// 2026-08-10 et n'y est jamais revenu (voir fedapay-subscription-checkout).
// Même schéma d'appel que fedapayCreditsCheckout.ts/fedapayMaraboutCheckout.ts.
export async function initiateSubscriptionCheckout(params: SubscriptionCheckoutParams): Promise<SubscriptionCheckoutResult> {
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
        callbackUrl: `${window.location.origin}/billing`,
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
