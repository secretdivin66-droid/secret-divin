-- ============================================================
-- Secret Divin — Réconciliation de grant_subscription() avec la réalité
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte (découvert le 2026-07-30 en investiguant deux erreurs console
-- sur le blog) : la table supabase_migrations.schema_migrations de ce
-- projet est vide — aucune migration de ce dossier n'a jamais été
-- appliquée via la CLI (`supabase db push`), le schéma a été mis en place
-- puis fait évoluer par un autre moyen (SQL Editor, probablement). Ça a créé
-- deux types de dérive :
-- 1. Des migrations jamais appliquées du tout (0004, 0005, 0014 — corrigé
--    le 2026-07-30 en les rejouant directement).
-- 2. CETTE fonction : grant_subscription() a été modifiée DIRECTEMENT en
--    base après la rédaction de 0002_secure_subscriptions.sql, sans que ce
--    fichier soit mis à jour — la version réellement en prod gère un
--    plan_id référençant la table `plans` (migration 0010), journalise
--    dans `billing_events`, et attribue les crédits mensuels du plan via
--    grant_credits(). Si 0002 était un jour rejoué tel quel, ÇA
--    RÉGRESSERAIT grant_subscription() vers une version plus simple et
--    obsolète (constaté en tentant de le faire — DROP FUNCTION IF EXISTS
--    aurait été nécessaire, ce qui aurait supprimé ce comportement sans
--    prévenir). Cette migration documente donc la version RÉELLEMENT
--    actuelle, capturée via pg_get_functiondef(), pour que le fichier et
--    la prod concordent enfin — 0002 ne doit plus jamais être rejoué seul.
-- ============================================================

CREATE OR REPLACE FUNCTION grant_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_duration_days integer DEFAULT 30,
  p_provider text DEFAULT NULL,
  p_provider_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plans%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  SELECT * INTO v_plan FROM plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_PLAN';
  END IF;

  UPDATE subscriptions SET is_active = false, status = 'expired'
    WHERE user_id = p_user_id AND is_active = true;

  INSERT INTO subscriptions (user_id, plan, plan_id, price, started_at, expires_at, is_active, status, provider, provider_reference)
    VALUES (p_user_id, v_plan.id, v_plan.id, v_plan.price, now(), now() + (p_duration_days || ' days')::interval, true, 'active', p_provider, p_provider_reference)
    RETURNING id INTO v_new_id;

  INSERT INTO billing_events (user_id, plan_id, provider, provider_reference, amount, status, description)
    VALUES (p_user_id, v_plan.id, p_provider, p_provider_reference, v_plan.price, 'succeeded', 'Abonnement ' || v_plan.name);

  IF v_plan.monthly_credits > 0 THEN
    PERFORM grant_credits(p_user_id, v_plan.monthly_credits, v_plan.id, 'Credits mensuels ' || v_plan.name);
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION grant_subscription(uuid, text, integer, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription(uuid, text, integer, text, text) TO service_role;
