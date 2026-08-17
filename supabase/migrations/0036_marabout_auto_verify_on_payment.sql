-- ============================================================
-- Un marabout devient visible dès le paiement de son abonnement, sans
-- attendre une validation manuelle admin séparée (demande explicite du
-- propriétaire — auparavant is_verified restait false tant qu'un admin
-- n'avait pas cliqué "Valider" dans /admin, même après paiement confirmé).
--
-- is_verified reste une colonne réelle (pas supprimée) : verify_marabout()
-- reste disponible pour un admin qui voudrait vérifier un profil AVANT
-- paiement, et is_active reste le levier admin pour masquer un profil
-- après coup si besoin (voir set_marabout_active) — ce n'est donc pas la
-- suppression de la modération, juste son déplacement d'un gate
-- bloquant-avant-visibilité à un gate corrective-après-coup.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_marabout_subscription_via_payment(
  p_marabout_id uuid,
  p_provider text,
  p_provider_reference text
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
BEGIN
  SELECT user_id INTO v_marabout_user_id FROM marabouts WHERE id = p_marabout_id;
  IF v_marabout_user_id IS NULL THEN
    RAISE EXCEPTION 'MARABOUT_NOT_FOUND';
  END IF;
  SELECT price INTO v_price FROM marabout_subscription_plan WHERE id = 'standard';
  v_expires_at := now() + interval '30 days';
  UPDATE marabouts
    SET abonnement_actif = true, is_verified = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider, provider_reference)
    VALUES (p_marabout_id, v_marabout_user_id, v_price, 'actif', now(), v_expires_at, p_provider, p_provider_reference);
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_marabout_subscription(p_marabout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marabout_user_id uuid;
  v_expires_at timestamp;
  v_price integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT user_id INTO v_marabout_user_id FROM marabouts WHERE id = p_marabout_id;
  IF v_marabout_user_id IS NULL THEN
    RAISE EXCEPTION 'MARABOUT_NOT_FOUND';
  END IF;
  SELECT price INTO v_price FROM marabout_subscription_plan WHERE id = 'standard';
  v_expires_at := now() + interval '30 days';
  UPDATE marabouts
    SET abonnement_actif = true, is_verified = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider)
    VALUES (p_marabout_id, v_marabout_user_id, COALESCE(v_price, 5900), 'actif', now(), v_expires_at, 'admin_manual');
END;
$function$;
