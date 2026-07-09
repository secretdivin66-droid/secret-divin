-- ============================================================
-- Secret Divin — Sécurisation de la table subscriptions
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
-- À exécuter dans l'éditeur SQL de Supabase sur le projet déjà déployé
-- (schema.sql a été mis à jour en parallèle pour les futurs projets
-- créés de zéro).
--
-- Corrige : la policy RLS "user_own_subscription" était FOR ALL, donc
-- n'importe quel utilisateur authentifié pouvait s'auto-attribuer un
-- abonnement "illimité" actif via l'API Supabase directement
-- (ex: `supabase.from('subscriptions').insert({ plan:'unlimited',
-- is_active:true, expires_at:'2099-01-01' })`), sans jamais payer.
-- Même classe de bug que celle corrigée sur user_credits.
-- ============================================================

DROP POLICY IF EXISTS "user_own_subscription" ON subscriptions;
DROP POLICY IF EXISTS "user_read_own_subscription" ON subscriptions;
CREATE POLICY "user_read_own_subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated, anon;
GRANT SELECT ON subscriptions TO authenticated;

-- grant_subscription() : seul chemin autorisé pour activer un abonnement.
-- Réservé à service_role (Edge Function / webhook de paiement futur),
-- jamais au navigateur avec la clé anonyme.
CREATE OR REPLACE FUNCTION grant_subscription(
  p_user_id uuid,
  p_plan text DEFAULT 'unlimited',
  p_price integer DEFAULT 49000,
  p_duration_days integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  UPDATE subscriptions SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  INSERT INTO subscriptions (user_id, plan, price, expires_at, is_active)
    VALUES (p_user_id, p_plan, p_price, now() + (p_duration_days || ' days')::interval, true)
    RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION grant_subscription(uuid, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription(uuid, text, integer, integer) TO service_role;
