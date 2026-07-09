// Proxy Gemini côté serveur : la clé Google (GEMINI_API_KEY, secret Supabase)
// ne quitte jamais ce runtime. Le client envoie { model, body } et ne connaît
// jamais la clé — voir src/lib/geminiProxy.ts pour le point d'appel.
//
// Sécurité :
// - exige un JWT Supabase valide d'un VRAI utilisateur connecté (pas juste la
//   clé anon publique) : quiconque n'a pas de compte sur l'app ne peut pas
//   consommer le quota Gemini.
// - liste blanche de modèles : le client ne peut pas pointer vers un modèle
//   arbitraire/plus coûteux.
// - plafond serveur sur maxOutputTokens, indépendant de ce que le client demande.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview-tts',
]);

const MAX_OUTPUT_TOKENS = 4000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'missing_authorization' }, 401);
    }

    // Vérifie qu'il s'agit d'un JWT utilisateur réel, pas seulement la clé
    // anon (qui est de toute façon publique côté client).
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'not_authenticated' }, 401);
    }

    // Limite serveur (20 appels / 60s par utilisateur) : contrairement à un
    // compteur client, celle-ci ne peut pas être contournée en appelant
    // cette fonction directement.
    const { data: allowed } = await supabaseClient.rpc('check_gemini_rate_limit', {
      p_max_calls: 20,
      p_window_seconds: 60,
    });
    if (!allowed) {
      return jsonResponse({ error: 'rate_limited' }, 429);
    }

    const { model, body } = await req.json();

    if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
      return jsonResponse({ error: 'invalid_model' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }

    if (body.generationConfig?.maxOutputTokens > MAX_OUTPUT_TOKENS) {
      body.generationConfig.maxOutputTokens = MAX_OUTPUT_TOKENS;
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const data = await geminiResponse.json();
    return jsonResponse(data, geminiResponse.status);
  } catch {
    return jsonResponse({ error: 'proxy_error' }, 500);
  }
});
