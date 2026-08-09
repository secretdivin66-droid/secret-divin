-- ============================================================
-- Secret Divin — expiration des crédits à 30 jours après achat
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte : jusqu'ici user_credits.balance était un simple solde global,
-- sans notion de "quel achat" un crédit vient — impossible d'expirer un
-- achat individuellement sans suivre des lots par achat. Introduit
-- credit_batches (un lot par appel grant_credits, avec sa propre date
-- d'expiration), consommé en FIFO (lot le plus proche de l'expiration en
-- premier) par spend_credits. user_credits.balance reste la donnée
-- affichée (cache), mais son autorité pour AUTORISER une dépense ne
-- change pas — les lots ne servent qu'à déterminer ce qui expire.
--
-- Rétroactivité : décision explicite de l'utilisateur (2026-08-09) — les
-- crédits déjà accordés avant cette migration NE sont PAS rétroactivement
-- mis en lot ici (aucun backfill de credit_batches pour l'historique
-- existant, aucune expiration ne leur sera donc jamais appliquée par
-- expire_credit_batches puisqu'ils n'ont pas de lot). Un client réel a
-- déjà 240 crédits achetés sous la promesse "valable à vie" — l'utilisateur
-- gère ce cas lui-même, hors de cette logique générale. Seuls les crédits
-- accordés via grant_credits() APRÈS cette migration ont une expiration.
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  remaining integer NOT NULL CHECK (remaining >= 0),
  pack text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_batches_user_id ON credit_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_batches_expiry ON credit_batches(expires_at) WHERE remaining > 0;

ALTER TABLE credit_batches ENABLE ROW LEVEL SECURITY;
-- Même convention que payment_transactions : aucune policy, seules les
-- fonctions SECURITY DEFINER ci-dessous (qui tournent en service_role /
-- propriétaire de fonction) lisent/écrivent cette table.

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type = ANY (ARRAY['purchase'::text, 'use'::text, 'refund'::text, 'expiration'::text]));

-- grant_credits : crée maintenant un lot (credit_batches) à côté de la
-- mise à jour habituelle de user_credits/credit_transactions.
CREATE OR REPLACE FUNCTION public.grant_credits(p_user_id uuid, p_amount integer, p_pack text DEFAULT NULL::text, p_description text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  INSERT INTO credit_batches (user_id, amount, remaining, pack, expires_at)
    VALUES (p_user_id, p_amount, p_amount, p_pack, now() + interval '30 days');

  INSERT INTO user_credits (user_id, balance, total_purchased)
    VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + p_amount,
        total_purchased = user_credits.total_purchased + p_amount,
        updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO credit_transactions (user_id, type, amount, pack, balance_after, description)
    VALUES (p_user_id, 'purchase', p_amount, p_pack, v_new_balance, COALESCE(p_description, 'Achat crédits'));

  RETURN v_new_balance;
END;
$function$;

-- spend_credits : logique d'autorisation/décrément de user_credits.balance
-- INCHANGÉE (reste la source de vérité pour "peut dépenser ou pas", donc
-- les crédits pré-migration sans lot restent dépensables normalement) ;
-- ajoute juste la consommation FIFO des lots non expirés, pour que
-- expire_credit_batches sache plus tard ce qu'il reste à expirer.
CREATE OR REPLACE FUNCTION public.spend_credits(p_tool text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, balance integer, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_cost integer;
  v_balance integer;
  v_remaining_to_deduct integer;
  v_batch record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'NOT_AUTHENTICATED';
    RETURN;
  END IF;

  SELECT cost INTO v_cost FROM tool_costs WHERE tool = p_tool;
  IF v_cost IS NULL THEN
    RETURN QUERY SELECT false, 0, 'UNKNOWN_TOOL';
    RETURN;
  END IF;

  IF v_cost = 0 THEN
    SELECT uc.balance INTO v_balance FROM user_credits uc WHERE uc.user_id = v_user_id;
    RETURN QUERY SELECT true, COALESCE(v_balance, 0), NULL::text;
    RETURN;
  END IF;

  SELECT uc.balance INTO v_balance
  FROM user_credits uc
  WHERE uc.user_id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN QUERY SELECT false, 0, 'NO_CREDIT_ACCOUNT';
    RETURN;
  END IF;

  IF v_balance < v_cost THEN
    RETURN QUERY SELECT false, v_balance, 'INSUFFICIENT_CREDITS';
    RETURN;
  END IF;

  v_remaining_to_deduct := v_cost;
  FOR v_batch IN
    SELECT id, remaining FROM credit_batches
    WHERE user_id = v_user_id AND remaining > 0 AND expires_at > now()
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_deduct <= 0;
    IF v_batch.remaining <= v_remaining_to_deduct THEN
      UPDATE credit_batches SET remaining = 0 WHERE id = v_batch.id;
      v_remaining_to_deduct := v_remaining_to_deduct - v_batch.remaining;
    ELSE
      UPDATE credit_batches SET remaining = v_batch.remaining - v_remaining_to_deduct WHERE id = v_batch.id;
      v_remaining_to_deduct := 0;
    END IF;
  END LOOP;
  -- Si les lots suivis ne couvrent pas tout le coût (crédits pré-migration
  -- sans lot, voir la note de rétroactivité en tête de fichier), on
  -- continue quand même sans bloquer : user_credits.balance reste seul
  -- juge de l'autorisation de dépense.

  UPDATE user_credits
    SET balance = v_balance - v_cost, updated_at = now()
    WHERE user_id = v_user_id;

  INSERT INTO credit_transactions (user_id, type, amount, tool, balance_after, description)
    VALUES (v_user_id, 'use', -v_cost, p_tool, v_balance - v_cost, COALESCE(p_description, 'Utilisation ' || p_tool));

  RETURN QUERY SELECT true, (v_balance - v_cost), NULL::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(text, text) TO authenticated;

-- Purge quotidienne des lots expirés — décrémente user_credits.balance du
-- solde non consommé des lots expirés et logue une transaction
-- 'expiration'. Appelée directement par pg_cron (pas de HTTP, contrairement
-- à auto-blog qui appelle une Edge Function) : une simple fonction SQL
-- suffit ici.
CREATE OR REPLACE FUNCTION public.expire_credit_batches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch record;
BEGIN
  FOR v_batch IN
    SELECT id, user_id, remaining FROM credit_batches
    WHERE remaining > 0 AND expires_at <= now()
    FOR UPDATE
  LOOP
    UPDATE credit_batches SET remaining = 0 WHERE id = v_batch.id;

    UPDATE user_credits
      SET balance = GREATEST(balance - v_batch.remaining, 0), updated_at = now()
      WHERE user_id = v_batch.user_id;

    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
      SELECT v_batch.user_id, 'expiration', -v_batch.remaining, uc.balance, 'Crédits expirés (30 jours)'
      FROM user_credits uc WHERE uc.user_id = v_batch.user_id;
  END LOOP;
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- cron.schedule met à jour le job existant plutôt que d'en dupliquer un
-- si le nom existe déjà — même comportement idempotent que 0016.
SELECT cron.schedule(
  'expire-credit-batches-daily',
  '15 3 * * *',
  $$ SELECT public.expire_credit_batches(); $$
);
