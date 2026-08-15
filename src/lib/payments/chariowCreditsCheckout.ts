import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chariow-initiate-checkout`;

export interface CreditCheckoutParams {
  packId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

export type CreditCheckoutResult =
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
  pack_not_configured_for_chariow: "Ce pack n'est pas encore disponible via ce moyen de paiement.",
  pack_not_payable: "Ce pack n'est pas payant.",
  unknown_pack: 'Pack inconnu.',
};

// Chariow ne sert que les packs de crédits sur ce projet (voir
// chariow-initiate-checkout/chariow-pulse-webhook, réorientés depuis les
// abonnements le 2026-08-10) — fetch brut + Authorization Bearer depuis la
// session, même schéma d'appel que geminiProxy.ts.
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
        redirectUrl: `${window.location.origin}/credits`,
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

  // Réponse 200 mais forme inattendue (ni step "payment" avec URL, ni
  // "completed"/"already_purchased") — traité comme le même genre
  // d'indisponibilité que "pack_not_configured_for_chariow" côté appelant
  // (voir CreditsPage.tsx), pas une erreur utilisateur.
  return { status: 'error', message: 'Réponse inattendue du serveur de paiement.', errorCode: 'unexpected_response' };
}
