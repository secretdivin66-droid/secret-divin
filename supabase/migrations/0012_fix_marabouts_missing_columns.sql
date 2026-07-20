-- ============================================================
-- Secret Divin — Corrige la table marabouts en production
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Diagnostic (voir rapport de debug) : l'inscription marabout échoue
-- en production avec "column marabouts.user_id does not exist"
-- (Postgres 42703), alors que le code et 0006_marabouts.sql
-- définissent bien cette colonne (et toutes celles ci-dessous).
--
-- Cause probable : 0006_marabouts.sql utilise CREATE TABLE
-- IF NOT EXISTS, qui ne modifie JAMAIS une table déjà existante. Si
-- `marabouts` a été créée en production par un autre moyen (SQL
-- Editor manuel, version antérieure du schéma...) avant que ce
-- fichier n'existe, le rejouer ne corrige rien — la table reste
-- figée dans son état d'origine, même incomplet.
--
-- Cette migration complète la table colonne par colonne avec
-- ADD COLUMN IF NOT EXISTS, qui lui fonctionne sur une table déjà
-- existante, quel que soit son état actuel exact (inconnu depuis le
-- code seul, faute d'accès direct à la base de production).
-- ============================================================

-- Filet de sécurité si la table n'existait vraiment pas du tout.
CREATE TABLE IF NOT EXISTS marabouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Ces deux tables sont référencées par les policies/fonctions plus bas
-- (marabout_avis.user_id, marabout_abonnements) — filet de sécurité au
-- cas où elles n'existent pas non plus en production.
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

ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS nom_complet text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS specialites text[];
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS pays text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS ville text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS langues text[];
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS tarifs_description text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS annees_experience integer DEFAULT 0;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS abonnement_actif boolean DEFAULT false;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS abonnement_expire_le timestamp;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS vues integer DEFAULT 0;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- NOT NULL et UNIQUE(user_id) protégés par des blocs à part : si des
-- lignes existantes ont déjà des valeurs NULL (ou des doublons de
-- user_id) suite au bug, forcer ces contraintes ferait échouer toute
-- la migration. On les applique seulement si c'est déjà safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE nom_complet IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN nom_complet SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE description IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN description SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE specialites IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN specialites SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE pays IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN pays SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE ville IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN ville SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE langues IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN langues SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marabouts WHERE whatsapp IS NULL) THEN
    ALTER TABLE marabouts ALTER COLUMN whatsapp SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT user_id FROM marabouts WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING count(*) > 1
  ) THEN
    ALTER TABLE marabouts ADD CONSTRAINT marabouts_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_marabouts_user_id ON marabouts(user_id);
CREATE INDEX IF NOT EXISTS idx_marabouts_visible ON marabouts(is_verified, is_active, abonnement_actif);

-- RLS + policies : identiques à 0006_marabouts.sql. DROP POLICY IF EXISTS
-- + CREATE les rend safe à rejouer, que la version précédente ait
-- échoué à la création (faute des colonnes qu'elles référencent) ou non.
ALTER TABLE marabouts ENABLE ROW LEVEL SECURITY;

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

-- Fonctions SECURITY DEFINER : CREATE OR REPLACE est toujours safe à
-- rejouer. Identiques à 0006_marabouts.sql — répétées ici uniquement
-- au cas où leur création avait aussi échoué faute des colonnes
-- qu'elles référencent (is_verified, abonnement_actif, is_active, vues).
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

ALTER TABLE marabout_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabout_abonnements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_avis" ON marabout_avis;
CREATE POLICY "public_read_avis" ON marabout_avis
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "user_write_avis" ON marabout_avis;
CREATE POLICY "user_write_avis" ON marabout_avis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner_read_own_abonnements" ON marabout_abonnements;
CREATE POLICY "owner_read_own_abonnements" ON marabout_abonnements
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_marabout_avis_marabout_id ON marabout_avis(marabout_id);
CREATE INDEX IF NOT EXISTS idx_marabout_abonnements_marabout_id ON marabout_abonnements(marabout_id);
