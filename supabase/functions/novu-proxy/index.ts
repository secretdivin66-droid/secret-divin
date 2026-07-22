// Proxy Novu côté serveur : la clé Novu (NOVU_API_KEY, secret Supabase) ne
// quitte jamais ce runtime — voir src/lib/novu.ts pour le point d'appel.
//
// Sécurité :
// - exige un JWT Supabase valide (utilisateur réel connecté).
// - "registration" : seul le marabout propriétaire de la fiche peut se
//   notifier lui-même (empêche un utilisateur quelconque de déclencher des
//   emails vers n'importe quelle adresse).
// - "activation" : réservé aux admins (vérifié via user_roles).
// - l'email/le nom du destinataire sont TOUJOURS résolus côté serveur à
//   partir de marabout_id (via service_role, qui contourne les RLS) — le
//   client ne peut donc jamais faire passer une adresse email arbitraire en
//   paramètre et transformer ce proxy en relais de spam.
// - identifiant de workflow Novu fixe côté serveur, non contrôlable par le
//   client.
import { createClient } from 'npm:@supabase/supabase-js@2';

const WORKFLOW_ID = 'marabout-registration-and-activation';
const ALLOWED_EVENTS = new Set(['registration', 'activation']);

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

    const { event, marabout_id } = await req.json();

    if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
      return jsonResponse({ error: 'invalid_event' }, 400);
    }
    if (typeof marabout_id !== 'string' || !marabout_id) {
      return jsonResponse({ error: 'invalid_marabout_id' }, 400);
    }

    // Client admin (service_role) : seul lui peut lire le profil d'un AUTRE
    // utilisateur (nécessaire pour "activation", déclenché par un admin sur
    // la fiche d'un marabout tiers). Jamais exposé au client.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: marabout } = await adminClient
      .from('marabouts')
      .select('user_id, nom_complet')
      .eq('id', marabout_id)
      .maybeSingle();

    if (!marabout) {
      return jsonResponse({ error: 'marabout_not_found' }, 404);
    }

    if (event === 'registration') {
      if (marabout.user_id !== user.id) {
        return jsonResponse({ error: 'not_authorized' }, 403);
      }
    } else {
      const { data: roleRow } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleRow?.role !== 'admin') {
        return jsonResponse({ error: 'not_authorized' }, 403);
      }
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('email')
      .eq('user_id', marabout.user_id)
      .maybeSingle();

    if (!profile?.email) {
      return jsonResponse({ error: 'email_not_found' }, 404);
    }

    const novuKey = Deno.env.get('NOVU_API_KEY');
    if (!novuKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const novuResponse = await fetch('https://api.novu.co/v1/events/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${novuKey}`,
      },
      body: JSON.stringify({
        name: WORKFLOW_ID,
        to: { subscriberId: profile.email, email: profile.email },
        payload: { name: marabout.nom_complet, event },
      }),
    });

    const data = await novuResponse.json();
    return jsonResponse(data, novuResponse.status);
  } catch {
    return jsonResponse({ error: 'proxy_error' }, 500);
  }
});
