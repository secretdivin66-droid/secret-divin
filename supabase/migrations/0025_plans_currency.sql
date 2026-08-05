-- ============================================================
-- Secret Divin — Devise des plans, pour vérifier le montant PawaPay
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte : pawapay-initiate-deposit / pawapay-callback doivent vérifier
-- que le montant payé correspond au prix réel du plan avant d'appeler
-- grant_subscription() (jamais faire confiance au montant envoyé par le
-- client). `plans.price` existe déjà (schema.sql) et est déjà affiché en
-- FCFA (= XOF) dans PricingPage.tsx/CreditsPage.tsx — plutôt que de
-- dupliquer ce prix dans une table séparée (risque de drift, voir tout
-- l'historique d'audits plus haut dans ce fichier), on rend juste sa
-- devise explicite ici. `plans` reste l'unique source de vérité prix.
-- ============================================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'XOF';
