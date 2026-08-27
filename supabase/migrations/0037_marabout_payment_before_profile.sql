-- ============================================================
-- Secret Divin — Paiement AVANT remplissage du profil marabout
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Nouveau flux : /marabouts/inscrire crée désormais une ligne
-- `marabouts` "brouillon" (champs vides) dès que l'utilisateur démarre
-- son inscription — chariow-marabout-checkout/fedapay-marabout-checkout
-- résolvent le marabout à payer via `user_id`, une ligne doit donc
-- exister AVANT le premier paiement (voir ces Edge Functions,
-- migration 0032). Le formulaire réel (nom, spécialités, tarifs...)
-- n'est rempli qu'après paiement confirmé, sur /marabout-dashboard.
--
-- profile_completed_at distingue "payé" (abonnement_actif) de "payé ET
-- profil réellement rempli" — sans cette distinction, un brouillon vide
-- deviendrait visible publiquement dès le paiement confirmé
-- (is_verified + abonnement_actif passent tous les deux à true
-- automatiquement, voir activate_marabout_subscription_via_payment,
-- migration 0036), ce qui exposerait une fiche "" sur l'annuaire public
-- avant même que le marabout ait rien renseigné.
--
-- reminder_48h_sent_at/reminder_7d_sent_at : marquent les rappels déjà
-- envoyés par le job pg_cron marabout-completion-reminder (voir plus
-- bas), pour ne jamais renvoyer deux fois le même rappel.
-- ============================================================

ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS reminder_48h_sent_at timestamptz;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS reminder_7d_sent_at timestamptz;

-- Ferme la fuite décrite ci-dessus : un profil brouillon (payé mais pas
-- encore rempli) ne doit jamais apparaître publiquement.
DROP POLICY IF EXISTS "public_read_marabouts" ON marabouts;
CREATE POLICY "public_read_marabouts" ON marabouts
  FOR SELECT USING (
    is_verified = true AND is_active = true AND abonnement_actif = true
    AND profile_completed_at IS NOT NULL
  );

-- Le marabout doit pouvoir poser profile_completed_at lui-même au
-- premier enregistrement réussi de son formulaire (MaraboutDashboardPage,
-- même mécanisme que les autres champs de profil — RLS
-- owner_update_own_marabout restreint déjà ce GRANT à sa propre ligne).
REVOKE UPDATE ON marabouts FROM authenticated;
GRANT UPDATE (
  nom_complet, photo_url, description, specialite, pays, ville,
  langues, numero_whatsapp, tarifs_description, annees_experience,
  updated_at, profile_completed_at
) ON marabouts TO authenticated;

-- === Secret partagé pour marabout-completion-reminder (même mécanisme
-- que auto_blog_cron_secret, voir migration 0016) ===
-- À renseigner UNE FOIS, hors migration :
--   insert into private.pipeline_secrets (name, value)
--   values ('marabout_reminder_cron_secret', 'UN_SECRET_ALEATOIRE_LONG')
--   on conflict (name) do update set value = excluded.value;
-- Puis côté Edge Function (supabase secrets set) :
--   MARABOUT_REMINDER_CRON_SECRET=<la_même_valeur>
-- La fonction doit être déployée avec --no-verify-jwt (pg_cron n'envoie
-- pas de JWT Supabase).

select cron.schedule(
  'marabout-completion-reminder',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://rldkftitqtipmvtyiqqa.supabase.co/functions/v1/marabout-completion-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marabout-reminder-cron-secret', (
        select value from private.pipeline_secrets where name = 'marabout_reminder_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
