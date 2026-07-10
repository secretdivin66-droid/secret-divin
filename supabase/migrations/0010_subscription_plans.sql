-- ============================================================
-- Secret Divin — Plans d'abonnement (Free / Premium / Pro)
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- N'introduit AUCUN changement de comportement pour les utilisateurs
-- existants : le plan Free correspond exactement au fonctionnement actuel
-- (paiement à l'usage en crédits), et Pro est un simple renommage du plan
-- "unlimited" qui existait déjà. Premium est la seule vraie nouveauté :
-- un abonnement mensuel qui recharge des crédits (qui, comme aujourd'hui,
-- n'expirent jamais).
--
-- Aucune passerelle de paiement n'est branchée ici : grant_subscription()
-- reste réservée à service_role (donc à une future Edge Function/webhook
-- CinetPay), exactement comme avant. Le bouton "S'abonner" côté client
-- n'écrit rien en base tant qu'aucun paiement n'a réellement eu lieu.
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price integer NOT NULL DEFAULT 0,
  monthly_credits integer NOT NULL DEFAULT 0,
  is_unlimited boolean NOT NULL DEFAULT false,
  features text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

INSERT INTO plans (id, name, price, monthly_credits, is_unlimited, features, sort_order) VALUES
  ('free', 'Free', 0, 0, false,
    ARRAY['Poids mystique et tutoriels gratuits', 'Paiement à l''usage avec des crédits', 'Crédits sans expiration'],
    0),
  ('premium', 'Premium', 9900, 80, false,
    ARRAY['80 crédits offerts chaque mois', 'Crédits cumulables, sans expiration', 'Support prioritaire par WhatsApp'],
    1),
  ('pro', 'Pro', 49000, 0, true,
    ARRAY['Accès illimité à tous les outils', 'Aucun crédit à gérer', 'Support prioritaire par WhatsApp'],
    2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  monthly_credits = EXCLUDED.monthly_credits,
  is_unlimited = EXCLUDED.is_unlimited,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_plans" ON plans;
CREATE POLICY "public_read_plans" ON plans FOR SELECT USING (true);

-- ------------------------------------------------------------
-- subscriptions : ajout du lien vers plans + traçabilité paiement
-- ------------------------------------------------------------

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id text REFERENCES plans(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_reference text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('pending', 'active', 'cancelled', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Toute souscription existante ("unlimited" avant ce renommage) devient Pro.
UPDATE subscriptions SET plan_id = 'pro', plan = 'pro' WHERE plan_id IS NULL;

-- ------------------------------------------------------------
-- billing_events : historique des paiements d'abonnement, affiché sur la
-- page Billing. Même principe que credit_transactions : lecture seule pour
-- le client, écrite uniquement par grant_subscription() (SECURITY DEFINER).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text REFERENCES plans(id),
  provider text,
  provider_reference text,
  amount integer,
  status text CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  description text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_read_own_billing" ON billing_events;
CREATE POLICY "user_read_own_billing" ON billing_events
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON billing_events FROM authenticated, anon;
GRANT SELECT ON billing_events TO authenticated;

-- ------------------------------------------------------------
-- grant_subscription() : remplace la version précédente pour accepter un
-- plan_id (au lieu d'un simple libellé texte), journaliser dans
-- billing_events, et créditer automatiquement les crédits mensuels du plan
-- (ex: Premium). Toujours réservée à service_role — jamais appelée
-- directement par le client, en attendant le webhook du futur fournisseur
-- de paiement.
-- ------------------------------------------------------------

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
    PERFORM grant_credits(p_user_id, v_plan.monthly_credits, v_plan.id, 'Crédits mensuels ' || v_plan.name);
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION grant_subscription(uuid, text, integer, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription(uuid, text, integer, text, text) TO service_role;

-- cancel_own_subscription() : self-service, ne fait que désactiver
-- l'abonnement de l'appelant (auth.uid()) — ne peut donc jamais affecter
-- un autre compte ni accorder quoi que ce soit.
CREATE OR REPLACE FUNCTION cancel_own_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE subscriptions SET is_active = false, status = 'cancelled'
    WHERE user_id = auth.uid() AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION cancel_own_subscription() FROM public, anon;
GRANT EXECUTE ON FUNCTION cancel_own_subscription() TO authenticated;
