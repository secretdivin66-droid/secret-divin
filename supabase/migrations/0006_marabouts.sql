-- ============================================================
-- Secret Divin — Marketplace de marabouts (abonnement 5000 FCFA/mois)
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Modélise l'inscription "/marabouts/inscrire", la marketplace publique
-- "/marabouts", la fiche individuelle "/marabouts/:id", le tableau de
-- bord "/marabout-dashboard" et l'onglet Marabouts de /admin.
--
-- Sécurité : is_verified (validation admin) et abonnement_actif
-- (paiement confirmé) ne sont jamais écrits par le client. Un GRANT de
-- colonnes limite ce qu'un marabout peut modifier sur sa propre fiche à
-- son contenu de profil ; l'approbation et l'activation d'abonnement ne
-- passent que par verify_marabout()/activate_marabout_subscription(),
-- réservées aux admins. Sans ça, n'importe quel marabout pourrait
-- s'auto-valider et s'auto-activer un abonnement gratuitement via
-- l'API, contournant entièrement la modération et le paiement.
-- ============================================================

CREATE TABLE IF NOT EXISTS marabouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom_complet text NOT NULL,
  photo_url text,
  description text NOT NULL,
  specialites text[] NOT NULL,
  pays text NOT NULL,
  ville text NOT NULL,
  langues text[] NOT NULL,
  whatsapp text NOT NULL,
  tarifs_description text,
  annees_experience integer DEFAULT 0,
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  abonnement_actif boolean DEFAULT false,
  abonnement_expire_le timestamp,
  vues integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS marabout_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marabout_id uuid REFERENCES marabouts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  note integer NOT NULL CHECK (note >= 1 AND note <= 5),
  commentaire text,
  created_at timestamp DEFAULT now(),
  UNIQUE (marabout_id, user_id)
);

CREATE TABLE IF NOT EXISTS marabout_abonnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marabout_id uuid REFERENCES marabouts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  montant integer DEFAULT 5000,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','actif','expire')),
  started_at timestamp DEFAULT now(),
  expires_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marabouts_user_id ON marabouts(user_id);
CREATE INDEX IF NOT EXISTS idx_marabouts_visible ON marabouts(is_verified, is_active, abonnement_actif);
CREATE INDEX IF NOT EXISTS idx_marabout_avis_marabout_id ON marabout_avis(marabout_id);
CREATE INDEX IF NOT EXISTS idx_marabout_abonnements_marabout_id ON marabout_abonnements(marabout_id);

ALTER TABLE marabouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabout_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabout_abonnements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_marabouts" ON marabouts;
CREATE POLICY "public_read_marabouts" ON marabouts
  FOR SELECT USING (is_verified = true AND is_active = true AND abonnement_actif = true);

DROP POLICY IF EXISTS "owner_read_own_marabout" ON marabouts;
CREATE POLICY "owner_read_own_marabout" ON marabouts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_marabouts" ON marabouts;
CREATE POLICY "admin_read_all_marabouts" ON marabouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

DROP POLICY IF EXISTS "user_register_as_marabout" ON marabouts;
CREATE POLICY "user_register_as_marabout" ON marabouts
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_verified = false AND abonnement_actif = false);

DROP POLICY IF EXISTS "owner_update_own_marabout" ON marabouts;
CREATE POLICY "owner_update_own_marabout" ON marabouts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE ON marabouts FROM authenticated, anon;
GRANT UPDATE (
  nom_complet, photo_url, description, specialites, pays, ville,
  langues, whatsapp, tarifs_description, annees_experience, updated_at
) ON marabouts TO authenticated;

DROP POLICY IF EXISTS "admin_delete_marabouts" ON marabouts;
CREATE POLICY "admin_delete_marabouts" ON marabouts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

DROP POLICY IF EXISTS "public_read_avis" ON marabout_avis;
CREATE POLICY "public_read_avis" ON marabout_avis
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "user_write_avis" ON marabout_avis;
CREATE POLICY "user_write_avis" ON marabout_avis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner_read_own_abonnements" ON marabout_abonnements;
CREATE POLICY "owner_read_own_abonnements" ON marabout_abonnements
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION verify_marabout(p_marabout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE marabouts SET is_verified = true, updated_at = now() WHERE id = p_marabout_id;
END;
$$;

REVOKE ALL ON FUNCTION verify_marabout(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION verify_marabout(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION activate_marabout_subscription(p_marabout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE marabouts
    SET abonnement_actif = true, abonnement_expire_le = v_expires_at, updated_at = now()
    WHERE id = p_marabout_id;

  INSERT INTO marabout_abonnements (marabout_id, user_id, montant, statut, started_at, expires_at)
    VALUES (p_marabout_id, v_marabout_user_id, 5000, 'actif', now(), v_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION activate_marabout_subscription(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION activate_marabout_subscription(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION set_marabout_active(p_marabout_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE marabouts SET is_active = p_is_active, updated_at = now() WHERE id = p_marabout_id;
END;
$$;

REVOKE ALL ON FUNCTION set_marabout_active(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_marabout_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION increment_marabout_views(p_marabout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE marabouts SET vues = vues + 1
    WHERE id = p_marabout_id AND is_verified = true AND is_active = true AND abonnement_actif = true;
END;
$$;

REVOKE ALL ON FUNCTION increment_marabout_views(uuid) FROM public;
GRANT EXECUTE ON FUNCTION increment_marabout_views(uuid) TO anon, authenticated;
