-- ============================================================
-- Secret Divin — dédoublonnage des Pulses (webhooks) Chariow via
-- x-pulse-delivery-id. Migration ADDITIVE et IDEMPOTENTE.
--
-- Format des Pulses confirmé le 2026-08-09 (documentation Chariow,
-- dashboard Automations → Pulses) : Chariow peut renvoyer la même
-- livraison plusieurs fois (retry) — x-pulse-delivery-id est la clé
-- d'idempotence associée. Cette colonne, couplée à la contrainte UNIQUE,
-- permet à chariow-pulse-webhook de détecter et ignorer un doublon avant
-- de rappeler grant_subscription(). NULL pour toutes les transactions
-- non-Chariow (PawaPay, et les insertions initiées par
-- chariow-initiate-checkout avant confirmation du Pulse) — une contrainte
-- UNIQUE standard autorise plusieurs NULL, aucun conflit avec l'existant.
-- ============================================================

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS pulse_delivery_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_pulse_delivery_id_key'
  ) THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT payment_transactions_pulse_delivery_id_key UNIQUE (pulse_delivery_id);
  END IF;
END $$;
