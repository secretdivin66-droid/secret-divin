-- ============================================================
-- Secret Divin — Sécurisation du système de crédits
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
-- À exécuter dans l'éditeur SQL de Supabase sur le projet déjà déployé
-- (schema.sql a été mis à jour en parallèle pour les futurs projets
-- créés de zéro — les deux fichiers doivent rester cohérents).
--
-- Corrige : les policies RLS permettaient à n'importe quel utilisateur
-- authentifié de modifier directement sa ligne dans user_credits
-- (ex: `supabase.from('user_credits').update({ balance: 999999 })`
-- depuis la console du navigateur). Le solde est désormais en lecture
-- seule pour le client ; toute écriture passe par des fonctions
-- SECURITY DEFINER qui valident tout côté serveur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contraintes d'intégrité sur user_credits
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_credits_user_id_unique'
  ) THEN
    ALTER TABLE user_credits ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_credits_balance_nonnegative'
  ) THEN
    ALTER TABLE user_credits ADD CONSTRAINT user_credits_balance_nonnegative CHECK (balance >= 0);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Table de référence des coûts (source de vérité côté serveur —
--    le client ne doit jamais pouvoir dicter combien lui coûte une
--    action).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tool_costs (
  tool text PRIMARY KEY,
  cost integer NOT NULL CHECK (cost >= 0)
);

INSERT INTO tool_costs (tool, cost) VALUES
  ('poids-mystique', 0),
  ('tutoriels', 0),
  ('carres-magiques', 2),
  ('destin', 2),
  ('attraper', 2),
  ('secrets', 2),
  ('geomancie', 2),
  ('compatibilite', 2),
  ('reves', 2),
  ('plantes', 2),
  ('jours', 2),
  ('formation', 2)
ON CONFLICT (tool) DO UPDATE SET cost = EXCLUDED.cost;

ALTER TABLE tool_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_tool_costs" ON tool_costs;
CREATE POLICY "public_read_tool_costs" ON tool_costs
  FOR SELECT USING (true);

-- ------------------------------------------------------------
-- 3. user_credits / credit_transactions : lecture seule pour le
--    client. Plus aucune écriture directe possible depuis le
--    navigateur.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "user_own_credits" ON user_credits;
DROP POLICY IF EXISTS "user_read_own_credits" ON user_credits;
CREATE POLICY "user_read_own_credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_own_transactions" ON credit_transactions;
CREATE POLICY "user_own_transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON user_credits FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON credit_transactions FROM authenticated, anon;
GRANT SELECT ON user_credits TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;

-- ------------------------------------------------------------
-- 4. spend_credits() — seul chemin autorisé pour dépenser des crédits.
--    - dérive l'utilisateur de auth.uid() (jamais d'un paramètre client)
--    - lit le coût réel dans tool_costs (jamais fourni par le client)
--    - verrouille la ligne (FOR UPDATE) => sérialise les requêtes
--      concurrentes pour un même utilisateur, empêche le double spending
--    - refuse si solde insuffisant (le solde ne peut jamais devenir
--      négatif, en plus de la contrainte CHECK en base)
--    - journalise systématiquement dans credit_transactions
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION spend_credits(
  p_tool text,
  p_description text DEFAULT NULL
)
RETURNS TABLE(success boolean, balance integer, error_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cost integer;
  v_balance integer;
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

  UPDATE user_credits
    SET balance = v_balance - v_cost, updated_at = now()
    WHERE user_id = v_user_id;

  INSERT INTO credit_transactions (user_id, type, amount, tool, balance_after, description)
    VALUES (v_user_id, 'use', -v_cost, p_tool, v_balance - v_cost, COALESCE(p_description, 'Utilisation ' || p_tool));

  RETURN QUERY SELECT true, (v_balance - v_cost), NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION spend_credits(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION spend_credits(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. grant_credits() — seul chemin autorisé pour créditer un compte
--    (achat confirmé, bonus, remboursement). Réservé à service_role :
--    ni "authenticated" ni "anon" ne peuvent l'appeler. Destiné à une
--    Edge Function / un webhook de paiement futur, jamais au navigateur
--    avec la clé anonyme.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_pack text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

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
$$;

REVOKE ALL ON FUNCTION grant_credits(uuid, integer, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_credits(uuid, integer, text, text) TO service_role;
