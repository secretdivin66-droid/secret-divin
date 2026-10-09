import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/saspay-marabout-checkout`;

export interface MaraboutCheckoutParams {
  tier: 'standard' | 'vip';
}

export type MaraboutCheckoutResult =
  | { status: 'redirect'; redirectUrl: string }
  | { status: 'unavailable' | 'error'; message: string; errorCode?: string };

interface SaspayFunctionResponse {
  checkoutUrl?: string;
  reference?: string;
  error?: string;
  message?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  no_marabout_profile: "Tu n'as pas encore de profil marabout — inscris-toi d'abord.",
  incomplete_profile: 'Un email est requis sur ton compte pour payer.',
  invalid_tier: 'Formule invalide, réessaie.',
  plan_not_configured: "Le paiement en ligne n'est pas encore disponible, réessaie plus tard.",
};

// SasPay est le prestataire PRINCIPAL pour l'abonnement marabout
// (2026-10) — voir MaraboutPaymentButton.tsx pour le repli silencieux
// vers Chariow puis FedaPay en cas d'erreur structurelle.
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
        tier: params.tier,
        returnUrl: `${window.location.origin}/marabout-dashboard`,
      }),
    });
  } catch {
    return { status: 'error', message: 'Impossible de contacter le serveur de paiement, réessaie plus tard.', errorCode: 'network_error' };
  }

  const json: SaspayFunctionResponse = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (json.error && ERROR_MESSAGES[json.error]) ?? 'Le paiement SasPay a échoué, réessaie plus tard.';
    return { status: 'error', message, errorCode: json.error };
  }

  if (json.checkoutUrl) {
    return { status: 'redirect', redirectUrl: json.checkoutUrl };
  }

  return { status: 'error', message: 'Réponse inattendue du serveur de paiement.', errorCode: 'unexpected_response' };
}
