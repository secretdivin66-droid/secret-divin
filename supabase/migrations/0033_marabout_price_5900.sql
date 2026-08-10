-- ============================================================
-- Secret Divin — corrige le prix de l'abonnement marabout : 5000 -> 5900
-- FCFA/mois. Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans
-- erreur.
--
-- Contexte : le prix était dupliqué en dur à 4 endroits (ABONNEMENT_PRIX_FCFA
-- côté frontend, le texte de MaraboutsPage.tsx, la ligne insérée par 0032
-- dans marabout_subscription_plan, ET codé en dur dans
-- activate_marabout_subscription()) — exactement le genre de duplication
-- qui oblige à changer 4 endroits à chaque changement de prix. Corrige les
-- 4 (les 2 premiers côté code, changés dans ce même commit) ET fait lire
-- activate_marabout_subscription() le montant depuis
-- marabout_subscription_plan au lieu de le recoder en dur, pour qu'un futur
-- changement de prix n'ait plus besoin de toucher au code SQL.
-- ============================================================

UPDATE marabout_subscription_plan SET price = 5900, updated_at = now() WHERE id = 'standard';

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
  UPDATE marabouts SET abonnement_actif = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider)
    VALUES (p_marabout_id, v_marabout_user_id, COALESCE(v_price, 5900), 'actif', now(), v_expires_at, 'admin_manual');
END;
$function$;
