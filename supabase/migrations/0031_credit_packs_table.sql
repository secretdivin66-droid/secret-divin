-- ============================================================
-- Secret Divin — migre PACKS (jusqu'ici un tableau codé en dur dans
-- src/utils/mystique.ts) vers une vraie table Supabase, pour pouvoir y
-- stocker chariow_product_id comme sur `plans` (voir 0028). Migration
-- ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte (2026-08-10) : Chariow a été réorienté des abonnements
-- (plans/subscriptions) vers les packs de crédits — voir la réécriture de
-- chariow-initiate-checkout/chariow-pulse-webhook dans ce même commit.
-- credits=NULL signifie "illimité" (le pack 'unlimited', qui n'accorde pas
-- des crédits mais un accès complet pendant `period` — voir
-- chariow-pulse-webhook, qui route ce cas vers grant_subscription('pro')
-- plutôt que grant_credits, réutilisant le mécanisme d'accès illimité déjà
-- existant côté abonnements plutôt que d'en recréer un second).
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_packs (
  id text PRIMARY KEY,
  name text NOT NULL,
  credits integer,
  price integer NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  period text,
  subtitle text,
  description text,
  popular boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  chariow_product_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_credit_packs ON credit_packs;
CREATE POLICY public_read_credit_packs ON credit_packs FOR SELECT USING (true);
-- Pas de policy d'écriture : seul service_role (qui bypass RLS) modifie
-- cette table, même convention que `plans`.

-- Reprend telles quelles les valeurs de PACKS/PACK_SUBTITLES
-- (src/utils/mystique.ts) au moment de la migration.
INSERT INTO credit_packs (id, name, credits, price, currency, period, subtitle, description, popular, sort_order) VALUES
  ('starter', 'Starter', 20, 4900, 'XOF', NULL, 'Pour découvrir, sans engagement', 'Pour découvrir nos outils mystiques.', false, 1),
  ('essentiel', 'Essentiel', 50, 6900, 'XOF', NULL, 'Pour un usage régulier', 'L''essentiel pour explorer ton destin.', false, 2),
  ('premium', 'Premium', 70, 9900, 'XOF', NULL, 'Le meilleur rapport crédit/prix', 'Le plus populaire pour un usage régulier.', true, 3),
  ('expert', 'Expert', 150, 19900, 'XOF', NULL, 'Pour aller plus loin', 'Pour les passionnés de mystique.', false, 4),
  ('unlimited', 'Illimité', NULL, 49000, 'XOF', 'mois', 'Accès total, un mois complet', 'Accès total à tous les outils pendant 1 mois.', false, 5)
ON CONFLICT (id) DO NOTHING;
