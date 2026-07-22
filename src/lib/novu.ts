import { supabase } from './supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/novu-proxy`;

// Passe par l'Edge Function novu-proxy au lieu d'appeler Novu directement :
// la clé Novu n'est jamais présente dans le bundle client, et l'email du
// destinataire est résolu côté serveur (jamais fourni par l'appelant).
async function triggerNovu(event: 'registration' | 'activation', maraboutId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ event, marabout_id: maraboutId }),
    });
  } catch {
    // Une notification manquée ne doit pas bloquer l'inscription/l'activation.
  }
}

export function notifyMaraboutRegistration(maraboutId: string): Promise<void> {
  return triggerNovu('registration', maraboutId);
}

export function notifyMaraboutActivation(maraboutId: string): Promise<void> {
  return triggerNovu('activation', maraboutId);
}
