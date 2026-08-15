-- ============================================================
-- Secret Divin — support FedaPay (2e prestataire de paiement, en plus de
-- Chariow/PawaPay). Migration ADDITIVE et IDEMPOTENTE : peut être rejouée
-- sans erreur.
--
-- fedapay_processed_events : déduplication des webhooks FedaPay par
-- event_id — FedaPay retente jusqu'à 9 fois sur ~2h en cas d'échec (non-2xx),
-- cette table évite de retraiter le même événement (double grant_credits).
-- Même convention que payment_transactions/credit_batches : RLS activée
-- SANS policy, seul service_role (qui bypass RLS, utilisé par l'Edge
-- Function fedapay-webhook) lit/écrit cette table — jamais exposée au
-- client (authenticated/anon).
-- ============================================================

CREATE TABLE IF NOT EXISTS fedapay_processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fedapay_processed_events_event_id ON fedapay_processed_events(event_id);

ALTER TABLE fedapay_processed_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy, volontairement — voir commentaire ci-dessus.
