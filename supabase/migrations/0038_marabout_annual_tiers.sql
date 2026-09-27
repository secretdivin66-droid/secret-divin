-- ============================================================
-- Secret Divin — remplace l'abonnement marabout mensuel unique (5900
-- FCFA/mois) par deux formules annuelles : Standard (9900 FCFA/an) et VIP
-- (29000 FCFA/an, badge + priorité d'affichage + consultations + accès
-- WhatsApp au fondateur). Migration ADDITIVE et IDEMPOTENTE.
--
-- Pas de nouveau champ d'expiration séparé : abonnement_expire_le
-- (migrations 0006/0012/0032/0036) reste la seule source de vérité pour
-- la date de fin d'abonnement, quelle que soit la formule — dupliquer
-- cette info aurait recréé exactement le genre de drift déjà rencontré
-- plusieurs fois sur ce projet (schema.sql/grants désynchronisés, prix
-- codé à 4 endroits en 0033...).
-- ============================================================

ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marabouts_subscription_tier_check'
  ) THEN
    ALTER TABLE marabouts ADD CONSTRAINT marabouts_subscription_tier_check
      CHECK (subscription_tier IN ('standard', 'vip'));
  END IF;
END $$;

-- marabout_subscription_plan passe de 1 ligne ('standard' seul) à 2
-- (comme plans/credit_packs). duration_days évite de recoder "365" en dur
-- dans 2 fonctions PL/pgSQL — même leçon que le prix en 0033.
ALTER TABLE marabout_subscription_plan ADD COLUMN IF NOT EXISTS duration_days integer NOT NULL DEFAULT 365;

-- chariow_product_id remis à NULL : l'ancien produit Chariow
-- (prd_3j3oskk3) est configuré à 5000/5900 FCFA côté dashboard Chariow
-- (c'est Chariow qui détermine le montant facturé par le produit, pas
-- notre requête) — le laisser référencé causerait un rejet silencieux au
-- webhook (amount/currency mismatch, fail-closed) tant que le produit
-- n'est pas recréé/reprix à 9900 FCFA/an sur app.chariow.com. En
-- attendant, le repli FedaPay silencieux déjà en place
-- (MaraboutPaymentButton) prend le relais, comme pour chaque rollout
-- Chariow précédent sur ce projet.
UPDATE marabout_subscription_plan
  SET price = 9900, duration_days = 365, chariow_product_id = NULL, updated_at = now()
  WHERE id = 'standard';

INSERT INTO marabout_subscription_plan (id, price, currency, duration_days)
  VALUES ('vip', 29000, 'XOF', 365)
  ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, duration_days = EXCLUDED.duration_days;

-- Traçabilité de la formule achetée à chaque paiement historique.
ALTER TABLE marabout_abonnements ADD COLUMN IF NOT EXISTS tier text;

-- activate_marabout_subscription() (admin manuel, AdminPage.tsx) — gagne
-- p_tier (DEFAULT 'standard' pour rester compatible avec un appel non mis
-- à jour pendant le déploiement), lit prix ET durée depuis
-- marabout_subscription_plan au lieu de coder 5900/'30 days' en dur.
-- Contrôle d'autorisation admin INCHANGÉ.
CREATE OR REPLACE FUNCTION public.activate_marabout_subscription(p_marabout_id uuid, p_tier text DEFAULT 'standard')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marabout_user_id uuid;
  v_expires_at timestamp;
  v_price integer;
  v_duration_days integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_tier NOT IN ('standard', 'vip') THEN
    RAISE EXCEPTION 'INVALID_TIER';
  END IF;
  SELECT user_id INTO v_marabout_user_id FROM marabouts WHERE id = p_marabout_id;
  IF v_marabout_user_id IS NULL THEN
    RAISE EXCEPTION 'MARABOUT_NOT_FOUND';
  END IF;
  SELECT price, duration_days INTO v_price, v_duration_days FROM marabout_subscription_plan WHERE id = p_tier;
  v_expires_at := now() + make_interval(days => COALESCE(v_duration_days, 365));
  UPDATE marabouts
    SET abonnement_actif = true, is_verified = true, subscription_tier = p_tier,
        abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider, tier)
    VALUES (p_marabout_id, v_marabout_user_id, COALESCE(v_price, 9900), 'actif', now(), v_expires_at, 'admin_manual', p_tier);
END;
$function$;

-- activate_marabout_subscription_via_payment() (webhooks Chariow/FedaPay)
-- — même changement : p_tier choisit la ligne marabout_subscription_plan
-- à utiliser pour le prix ET la durée. Toujours service_role uniquement,
-- toujours sans contrôle admin (le webhook a déjà authentifié l'appel via
-- signature + revérifié le montant avant d'appeler ceci).
CREATE OR REPLACE FUNCTION public.activate_marabout_subscription_via_payment(
  p_marabout_id uuid,
  p_provider text,
  p_provider_reference text,
  p_tier text DEFAULT 'standard'
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marabout_user_id uuid;
  v_expires_at timestamp;
  v_price integer;
  v_duration_days integer;
BEGIN
  IF p_tier NOT IN ('standard', 'vip') THEN
    RAISE EXCEPTION 'INVALID_TIER';
  END IF;
  SELECT user_id INTO v_marabout_user_id FROM marabouts WHERE id = p_marabout_id;
  IF v_marabout_user_id IS NULL THEN
    RAISE EXCEPTION 'MARABOUT_NOT_FOUND';
  END IF;
  SELECT price, duration_days INTO v_price, v_duration_days FROM marabout_subscription_plan WHERE id = p_tier;
  v_expires_at := now() + make_interval(days => COALESCE(v_duration_days, 365));
  UPDATE marabouts
    SET abonnement_actif = true, is_verified = true, subscription_tier = p_tier,
        abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider, provider_reference, tier)
    VALUES (p_marabout_id, v_marabout_user_id, v_price, 'actif', now(), v_expires_at, p_provider, p_provider_reference, p_tier);
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_marabout_subscription_via_payment(uuid, text, text, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.activate_marabout_subscription_via_payment(uuid, text, text, text) TO service_role;

-- Expiration automatique J+365 si non renouvelé : masquage complet
-- (abonnement_actif -> false), pas d'état "dégradé" intermédiaire —
-- cohérent avec l'absence de tout plan gratuit (public_read_marabouts
-- exige déjà abonnement_actif=true pour être listé). Même pattern que
-- expire_credit_batches (migration 0030) : cron direct sur une fonction
-- SQL, pas d'Edge Function nécessaire pour une simple UPDATE.
CREATE OR REPLACE FUNCTION public.expire_marabout_subscriptions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE marabouts
    SET abonnement_actif = false, updated_at = now()
    WHERE abonnement_actif = true
      AND abonnement_expire_le IS NOT NULL
      AND abonnement_expire_le < now();
END;
$function$;

SELECT cron.schedule(
  'expire-marabout-subscriptions-daily',
  '30 3 * * *',
  $$ SELECT public.expire_marabout_subscriptions(); $$
);
