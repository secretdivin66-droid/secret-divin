// Rappel automatique quotidien pour les marabouts qui ont payé leur
// abonnement mais n'ont jamais terminé de remplir leur profil (voir
// migration 0037 : profile_completed_at reste NULL tant que le
// formulaire de MaraboutDashboardPage n'a pas été sauvegardé au moins
// une fois). Sans ça, un marabout peut payer puis fermer l'onglet et
// rester invisible indéfiniment sans jamais être relancé.
//
// Appelée par pg_cron une fois par jour (voir migration 0037,
// cron.schedule('marabout-completion-reminder', ...)) — authentification
// par secret partagé (x-marabout-reminder-cron-secret), même mécanisme
// que auto-blog (voir ce fichier pour le contexte complet sur pourquoi
// un secret dédié plutôt que la clé service_role). Doit être déployée
// avec --no-verify-jwt (pg_cron n'envoie pas de JWT Supabase).
//
// Deux seuils indépendants, chacun envoyé une seule fois (colonnes
// reminder_48h_sent_at/reminder_7d_sent_at, migration 0037) : 48h après
// le début de l'abonnement (marabout_abonnements.started_at le plus
// récent), puis 7 jours. Notification envoyée directement à l'API Novu
// (pas via novu-proxy, qui exige un JWT utilisateur — absent ici, comme
// notifyMaraboutActivated dans chariow-pulse-webhook) sur un workflow
// dédié 'marabout-profile-completion-reminder', distinct de
// marabout-registration-and-activation — à créer côté dashboard Novu
// avec les événements 'reminder_48h'/'reminder_7d'.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-marabout-reminder-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOVU_WORKFLOW_ID = 'marabout-profile-completion-reminder';
const DASHBOARD_URL = 'https://secretdivin.com/marabout-dashboard';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

interface MaraboutRow {
  id: string;
  user_id: string;
  nom_complet: string;
}

async function notifyReminder(
  supabase: ReturnType<typeof createClient>,
  novuKey: string,
  marabout: MaraboutRow,
  event: 'reminder_48h' | 'reminder_7d',
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('user_id', marabout.user_id)
    .maybeSingle();
  if (!profile?.email) return;

  await fetch('https://api.novu.co/v1/events/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `ApiKey ${novuKey}` },
    body: JSON.stringify({
      name: NOVU_WORKFLOW_ID,
      to: { subscriberId: profile.email, email: profile.email },
      payload: { name: marabout.nom_complet || null, event, dashboardUrl: DASHBOARD_URL },
    }),
  });
}

// Sélectionne les brouillons payés (abonnement_actif) mais jamais
// complétés (profile_completed_at NULL), dont le paiement le plus
// récent (marabout_abonnements.started_at) date d'au moins `hours`
// heures, et qui n'ont pas déjà reçu CE rappel précis (reminderColumn
// NULL) — évite tout doublon si le cron tourne plusieurs jours de
// suite sans que le marabout n'ait toujours pas complété son profil.
async function findDueMarabouts(
  supabase: ReturnType<typeof createClient>,
  hours: number,
  reminderColumn: 'reminder_48h_sent_at' | 'reminder_7d_sent_at',
): Promise<(MaraboutRow & { abonnement_id: string })[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('marabouts')
    .select('id, user_id, nom_complet')
    .eq('abonnement_actif', true)
    .is('profile_completed_at', null)
    .is(reminderColumn, null);

  if (error || !candidates || candidates.length === 0) return [];

  const due: (MaraboutRow & { abonnement_id: string })[] = [];
  for (const m of candidates as MaraboutRow[]) {
    const { data: lastSub } = await supabase
      .from('marabout_abonnements')
      .select('id, started_at')
      .eq('marabout_id', m.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastSub && lastSub.started_at <= cutoff) {
      due.push({ ...m, abonnement_id: lastSub.id as string });
    }
  }
  return due;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const cronSecret = req.headers.get('x-marabout-reminder-cron-secret') ?? '';
    const expectedCronSecret = Deno.env.get('MARABOUT_REMINDER_CRON_SECRET') ?? '';
    if (!expectedCronSecret || !timingSafeEqual(cronSecret, expectedCronSecret)) {
      return jsonResponse({ error: 'not_authorized' }, 403);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const novuKey = Deno.env.get('NOVU_API_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let sent48h = 0;
    let sent7d = 0;

    const due48h = await findDueMarabouts(supabase, 48, 'reminder_48h_sent_at');
    for (const m of due48h) {
      if (novuKey) await notifyReminder(supabase, novuKey, m, 'reminder_48h').catch((err) => {
        console.error('marabout-completion-reminder: notify 48h failed', { maraboutId: m.id, error: err });
      });
      const { error: updateError } = await supabase
        .from('marabouts')
        .update({ reminder_48h_sent_at: new Date().toISOString() })
        .eq('id', m.id);
      if (!updateError) sent48h += 1;
    }

    const due7d = await findDueMarabouts(supabase, 24 * 7, 'reminder_7d_sent_at');
    for (const m of due7d) {
      if (novuKey) await notifyReminder(supabase, novuKey, m, 'reminder_7d').catch((err) => {
        console.error('marabout-completion-reminder: notify 7d failed', { maraboutId: m.id, error: err });
      });
      const { error: updateError } = await supabase
        .from('marabouts')
        .update({ reminder_7d_sent_at: new Date().toISOString() })
        .eq('id', m.id);
      if (!updateError) sent7d += 1;
    }

    return jsonResponse({ sent48h, sent7d }, 200);
  } catch (err) {
    console.error('marabout-completion-reminder: unexpected error', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});
