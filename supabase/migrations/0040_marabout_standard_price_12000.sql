-- ============================================================
-- Secret Divin — corrige le prix de la formule Standard marabout : 9900 ->
-- 12000 FCFA/an. Migration ADDITIVE et IDEMPOTENTE.
--
-- marabout_subscription_plan reste la source de vérité lue dynamiquement
-- par chariow-marabout-checkout/fedapay-marabout-checkout (aucun code à
-- toucher côté Edge Functions). Seul le repli COALESCE codé en dur dans
-- activate_marabout_subscription() (chemin admin manuel) doit être
-- resynchronisé, même principe que la migration 0033.
-- ============================================================

UPDATE marabout_subscription_plan SET price = 12000, updated_at = now() WHERE id = 'standard';

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
    VALUES (p_marabout_id, v_marabout_user_id, COALESCE(v_price, 12000), 'actif', now(), v_expires_at, 'admin_manual', p_tier);
END;
$function$;
