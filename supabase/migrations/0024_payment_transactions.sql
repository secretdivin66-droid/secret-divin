-- ============================================================
-- Secret Divin — Paiements PawaPay (dépôts mobile money)
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Table miroir des dépôts PawaPay v2 (/deposits), écrite uniquement par les
-- Edge Functions pawapay-initiate-deposit / pawapay-callback via
-- service_role — jamais par le client. RLS activée sans aucune policy,
-- même convention que gemini_rate_limits (voir schema.sql) : seul
-- service_role (qui bypass RLS) peut lire/écrire.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id text UNIQUE NOT NULL,
  client_reference_id text,
  status text NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'COMPLETED', 'FAILED', 'REJECTED', 'DUPLICATE_IGNORED')),
  amount numeric,
  currency text,
  country text,
  phone_number text,
  provider text,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  failure_reason jsonb,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_client_reference_id ON payment_transactions(client_reference_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table contient des numéros de téléphone et les
-- payloads bruts PawaPay, jamais exposée au client (authenticated/anon).
