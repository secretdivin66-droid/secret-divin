import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fedapay-initiate-checkout`;

export interface CreditCheckoutParams {
  packId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export type CreditCheckoutResult =
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
  pack_not_payable: "Ce pack n'est pas payant.",
  unknown_pack: 'Pack inconnu.',
};

// Contrairement à Chariow, FedaPay n'a pas de notion de "produit"
// pré-configuré — le montant vient toujours de credit_packs côté serveur
// (voir fedapay-initiate-checkout), donc pas d'équivalent
// "pack_not_configured" possible ici. Même schéma d'appel que
// chariowCreditsCheckout.ts (fetch brut + Authorization Bearer depuis la
// session).
export async function initiateCreditPackCheckout(params: CreditCheckoutParams): Promise<CreditCheckoutResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'Tu dois être connecté pour acheter des crédits.' };
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
        packId: params.packId,
        callbackUrl: `${window.location.origin}/credits`,
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
