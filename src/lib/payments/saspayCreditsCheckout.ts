import { supabase } from '../supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/saspay-initiate-checkout`;

export interface CreditPackCheckoutParams {
  packId: string;
}

export type CreditPackCheckoutResult =
  | { status: 'redirect'; redirectUrl: string }
  | { status: 'unavailable' | 'error'; message: string; errorCode?: string };

interface SaspayFunctionResponse {
  checkoutUrl?: string;
  reference?: string;
  error?: string;
  message?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  credit_packs_disabled: 'Rechargement temporairement indisponible — Nous améliorons notre système. Merci de réessayer dans quelques instants 🙏',
  unknown_pack: 'Pack inconnu, réessaie.',
  incomplete_profile: 'Un email est requis sur ton compte pour payer.',
};

// SasPay est le prestataire PRINCIPAL pour les packs de crédits (2026-10)
// — aucune info de contact à collecter (contrairement à Chariow), email
// et nom résolus côté serveur. Voir CreditsPage.tsx pour le repli
// silencieux vers Chariow puis FedaPay en cas d'erreur structurelle.
export async function initiateCreditPackCheckout(params: CreditPackCheckoutParams): Promise<CreditPackCheckoutResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'Tu dois être connecté pour acheter un pack.' };
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
        returnUrl: `${window.location.origin}/credits`,
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
