import { supabase } from './supabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;

// Passe par l'Edge Function gemini-proxy au lieu d'appeler Google directement :
// la clé Gemini n'est plus jamais présente dans le bundle client.
export async function callGeminiProxy(model: string, body: Record<string, unknown>): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('not-authenticated');

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ model, body }),
  });

  if (!response.ok) throw new Error('network');
  return response.json();
}
