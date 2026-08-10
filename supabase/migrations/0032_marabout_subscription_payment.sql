-- ============================================================
-- Secret Divin — branche le paiement de l'abonnement marabout (5000
-- FCFA/mois, jusqu'ici 100% manuel via WhatsApp + admin) sur Chariow.
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
-- ============================================================

-- Config à une seule ligne (prix + product_id Chariow) — pas de table à
-- plusieurs lignes comme `plans`/`credit_packs` car il n'existe qu'une
-- seule offre marabout. Pas de policy de lecture publique : contrairement
-- à plans/credit_packs, le prix est déjà affiché côté client via la
-- constante ABONNEMENT_PRIX_FCFA (src/utils/marabouts.ts) — seules les
-- Edge Functions (service_role) ont besoin de lire cette table.
CREATE TABLE IF NOT EXISTS marabout_subscription_plan (
  id text PRIMARY KEY DEFAULT 'standard',
  price integer NOT NULL,
  currency text NOT NULL DEFAULT 'XOF',
  chariow_product_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marabout_subscription_plan ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul service_role (qui bypass RLS) lit/écrit.

INSERT INTO marabout_subscription_plan (id, price, currency) VALUES ('standard', 5000, 'XOF')
ON CONFLICT (id) DO NOTHING;

-- Traçabilité : d'où vient chaque activation (paiement automatique
-- Chariow vs validation manuelle admin) — manquait jusqu'ici.
ALTER TABLE marabout_abonnements ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE marabout_abonnements ADD COLUMN IF NOT EXISTS provider_reference text;

-- activate_marabout_subscription() (admin manuel, voir AdminPage.tsx)
-- reste INCHANGÉE dans son contrôle d'autorisation (exige un admin
-- authentifié) — juste enrichie pour tracer provider='admin_manual'.
CREATE OR REPLACE FUNCTION public.activate_marabout_subscription(p_marabout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marabout_user_id uuid;
  v_expires_at timestamp;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT user_id INTO v_marabout_user_id FROM marabouts WHERE id = p_marabout_id;
  IF v_marabout_user_id IS NULL THEN
    RAISE EXCEPTION 'MARABOUT_NOT_FOUND';
  END IF;
  v_expires_at := now() + interval '30 days';
  UPDATE marabouts SET abonnement_actif = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider)
    VALUES (p_marabout_id, v_marabout_user_id, 5000, 'actif', now(), v_expires_at, 'admin_manual');
END;
$function$;

-- Nouvelle fonction dédiée au paiement automatique (Chariow) : PAS de
-- contrôle admin (le webhook a déjà authentifié l'appel via la signature
-- HMAC + revérifié le montant avant d'appeler ceci — même principe que
-- grant_credits/grant_subscription, jamais appelable par un client, seul
-- service_role a EXECUTE). Volontairement séparée de
-- activate_marabout_subscription() plutôt que de modifier son contrôle
-- d'accès, pour ne jamais affaiblir la vérification admin du flow manuel
-- existant.
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
  UPDATE marabouts SET abonnement_actif = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;
  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at, provider, provider_reference)
    VALUES (p_marabout_id, v_marabout_user_id, v_price, 'actif', now(), v_expires_at, p_provider, p_provider_reference);
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_marabout_subscription_via_payment(uuid, text, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.activate_marabout_subscription_via_payment(uuid, text, text) TO service_role;
