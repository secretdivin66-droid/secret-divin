-- ============================================================
-- Secret Divin — Schéma Supabase complet
-- À exécuter dans l'éditeur SQL de Supabase (ou via `supabase db push`)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  phone text,
  country text,
  mother_name text,
  gender text CHECK (gender IN ('homme','femme')),
  religion text,
  language text DEFAULT 'fr',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'user',
  created_at timestamp DEFAULT now()
);

CREATE TABLE user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer DEFAULT 0 CHECK (balance >= 0),
  total_purchased integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text DEFAULT 'unlimited',
  price integer DEFAULT 49000,
  started_at timestamp DEFAULT now(),
  expires_at timestamp,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text CHECK (type IN ('purchase','use','refund')),
  amount integer,
  tool text,
  pack text,
  balance_after integer,
  description text,
  created_at timestamp DEFAULT now()
);

-- Source de vérité serveur pour le coût de chaque outil : le client ne
-- doit jamais pouvoir dicter combien lui coûte une action.
CREATE TABLE tool_costs (
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
  ('formation', 2);

CREATE TABLE saved_rituals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  content jsonb,
  page_source text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE formation_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id integer,
  lesson_id integer,
  is_completed boolean DEFAULT false,
  quiz_score integer DEFAULT 0,
  quiz_passed boolean DEFAULT false,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  UNIQUE (user_id, module_id, lesson_id)
);

CREATE TABLE formation_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id integer,
  is_unlocked boolean DEFAULT false,
  is_completed boolean DEFAULT false,
  best_score integer DEFAULT 0,
  completed_at timestamp,
  UNIQUE (user_id, module_id)
);

CREATE TABLE blog_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text,
  category text,
  cover_image text,
  is_published boolean DEFAULT false,
  published_at timestamp,
  views integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Un marabout est un utilisateur qui s'inscrit pour figurer dans la
-- marketplace (/marabouts) : marketplace payante, abonnement 5000 FCFA/mois.
-- is_verified (validation admin) et abonnement_actif (paiement confirmé)
-- ne sont JAMAIS écrits par le client — voir verify_marabout(),
-- activate_marabout_subscription() et le GRANT de colonnes plus loin.
-- UNIQUE(user_id) : un seul profil marabout par utilisateur (nécessaire
-- pour que le .single() de la page d'inscription/dashboard soit fiable).
CREATE TABLE marabouts (
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

-- Un avis client par marabout maximum (UNIQUE) pour éviter le spam de notes.
CREATE TABLE marabout_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marabout_id uuid REFERENCES marabouts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  note integer NOT NULL CHECK (note >= 1 AND note <= 5),
  commentaire text,
  created_at timestamp DEFAULT now(),
  UNIQUE (marabout_id, user_id)
);

-- Journal des paiements d'abonnement. Alimenté uniquement par
-- activate_marabout_subscription() (SECURITY DEFINER) — jamais par le
-- client, exactement comme credit_transactions pour les crédits.
CREATE TABLE marabout_abonnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marabout_id uuid REFERENCES marabouts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  montant integer DEFAULT 5000,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','actif','expire')),
  started_at timestamp DEFAULT now(),
  expires_at timestamp,
  created_at timestamp DEFAULT now()
);

-- Fenêtre glissante pour le rate limit serveur sur l'appel Gemini (voir
-- check_gemini_rate_limit() plus bas et supabase/functions/gemini-proxy).
-- Un compteur client-side (utils/security.ts) est facilement contourné en
-- appelant l'Edge Function directement ; celui-ci ne l'est pas, puisqu'il
-- vit dans la base de données et est vérifié par la fonction elle-même.
CREATE TABLE gemini_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamp NOT NULL DEFAULT now(),
  call_count integer NOT NULL DEFAULT 0
);

-- ============================================================
-- INDEX (accélère les jointures / filtres sur user_id)
-- ============================================================

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_saved_rituals_user_id ON saved_rituals(user_id);
CREATE INDEX idx_formation_progress_user_id ON formation_progress(user_id);
CREATE INDEX idx_formation_modules_user_id ON formation_modules(user_id);
CREATE INDEX idx_blog_articles_author_id ON blog_articles(author_id);
CREATE INDEX idx_blog_articles_slug ON blog_articles(slug);
CREATE INDEX idx_marabouts_user_id ON marabouts(user_id);
CREATE INDEX idx_marabouts_visible ON marabouts(is_verified, is_active, abonnement_actif);
CREATE INDEX idx_marabout_avis_marabout_id ON marabout_avis(marabout_id);
CREATE INDEX idx_marabout_abonnements_marabout_id ON marabout_abonnements(marabout_id);

-- ============================================================
-- TRIGGER : initialisation automatique à chaque inscription
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name text := NEW.raw_user_meta_data->>'first_name';
  v_last_name text := NEW.raw_user_meta_data->>'last_name';
  v_display_name text := NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), '');
BEGIN
  INSERT INTO profiles (user_id, email, display_name, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(v_display_name, split_part(NEW.email, '@', 1)),
      v_first_name,
      v_last_name
    );
  INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  INSERT INTO user_credits (user_id, balance, total_purchased)
    VALUES (NEW.id, 0, 0);
  INSERT INTO formation_modules (user_id, module_id, is_unlocked)
    VALUES (NEW.id, 1, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_rituals ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabout_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE marabout_abonnements ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seule check_gemini_rate_limit() (SECURITY DEFINER) peut
-- lire/écrire cette table, ce qui est exactement ce qu'on veut.
ALTER TABLE gemini_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_profile" ON profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lecture seule : le solde ne peut être modifié que par les fonctions
-- SECURITY DEFINER spend_credits() / grant_credits() ci-dessous, jamais
-- directement par le client (voir REVOKE plus bas).
CREATE POLICY "user_read_own_credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "public_read_tool_costs" ON tool_costs
  FOR SELECT USING (true);

CREATE POLICY "user_own_rituals" ON saved_rituals
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_modules" ON formation_modules
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_progress" ON formation_progress
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Lecture seule : comme user_credits, un abonnement ne peut pas être
-- créé/activé par le client lui-même (voir grant_subscription() plus bas),
-- sinon n'importe quel utilisateur pourrait s'auto-attribuer un abonnement
-- "illimité" gratuit via l'API Supabase directement.
CREATE POLICY "user_read_own_subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "public_read_blog" ON blog_articles
  FOR SELECT USING (is_published = true);

-- Seuls les admins (user_roles.role = 'admin') peuvent créer/modifier/
-- supprimer/lire les brouillons. Sans cette policy, blog_articles n'a
-- aucune policy d'écriture : le formulaire admin ne pourrait rien
-- enregistrer (RLS bloque par défaut tout ce qui n'est couvert par
-- aucune policy).
CREATE POLICY "admin_manage_blog" ON blog_articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

CREATE POLICY "user_read_own_role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Le grand public (sans connexion) ne voit que les fiches vérifiées,
-- actives ET à jour d'abonnement ; le marabout voit toujours sa propre
-- fiche (y compris en attente de validation) ; un admin voit tout, pour
-- la modération.
CREATE POLICY "public_read_marabouts" ON marabouts
  FOR SELECT USING (is_verified = true AND is_active = true AND abonnement_actif = true);

CREATE POLICY "owner_read_own_marabout" ON marabouts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admin_read_all_marabouts" ON marabouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- Auto-inscription toujours non vérifiée et sans abonnement actif :
-- impossible de s'inscrire déjà "vérifié" ou "payé".
CREATE POLICY "user_register_as_marabout" ON marabouts
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_verified = false AND abonnement_actif = false);

-- Le propriétaire peut modifier sa fiche, mais le GRANT ci-dessous limite
-- les colonnes qu'il a le droit d'écrire : is_verified/is_active/
-- abonnement_actif/abonnement_expire_le/vues n'en font pas partie, donc
-- même avec cette policy, un marabout ne peut jamais s'auto-valider ni
-- s'auto-activer un abonnement (seules les fonctions admin plus bas le
-- peuvent).
CREATE POLICY "owner_update_own_marabout" ON marabouts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE ON marabouts FROM authenticated, anon;
GRANT UPDATE (
  nom_complet, photo_url, description, specialites, pays, ville,
  langues, whatsapp, tarifs_description, annees_experience, updated_at
) ON marabouts TO authenticated;

CREATE POLICY "admin_delete_marabouts" ON marabouts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

CREATE POLICY "public_read_avis" ON marabout_avis
  FOR SELECT USING (true);

CREATE POLICY "user_write_avis" ON marabout_avis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Journal de paiement en lecture seule pour son propriétaire ; jamais
-- écrit par le client (voir activate_marabout_subscription() plus bas).
CREATE POLICY "owner_read_own_abonnements" ON marabout_abonnements
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- SÉCURITÉ DU SYSTÈME DE CRÉDITS
-- Le client n'a plus que le droit de LIRE user_credits et
-- credit_transactions. Toute écriture passe obligatoirement par les
-- fonctions SECURITY DEFINER ci-dessous, qui s'exécutent avec les droits
-- du propriétaire de la table (donc hors RLS) mais valident tout côté
-- serveur : utilisateur réel (auth.uid()), coût réel (tool_costs),
-- solde suffisant, verrouillage de ligne anti-course, et journalisation
-- systématique.
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON user_credits FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON credit_transactions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated, anon;
GRANT SELECT ON user_credits TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;

-- spend_credits() : seul chemin autorisé pour dépenser des crédits.
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

  -- Verrouille la ligne jusqu'à la fin de la transaction : toute autre
  -- dépense concurrente du même utilisateur attend son tour, ce qui
  -- élimine les courses (double dépense) sur le solde.
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

-- grant_credits() : seul chemin autorisé pour créditer un compte (achat
-- confirmé, bonus, remboursement). Réservé à service_role : ni
-- "authenticated" ni "anon" ne peuvent l'appeler. Destiné à être invoqué
-- depuis une Edge Function / un webhook de paiement, jamais depuis le
-- navigateur avec la clé anonyme.
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

-- grant_subscription() : seul chemin autorisé pour activer un abonnement.
-- Réservé à service_role, mêmes raisons que grant_credits().
CREATE OR REPLACE FUNCTION grant_subscription(
  p_user_id uuid,
  p_plan text DEFAULT 'unlimited',
  p_price integer DEFAULT 49000,
  p_duration_days integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  UPDATE subscriptions SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  INSERT INTO subscriptions (user_id, plan, price, expires_at, is_active)
    VALUES (p_user_id, p_plan, p_price, now() + (p_duration_days || ' days')::interval, true)
    RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION grant_subscription(uuid, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription(uuid, text, integer, integer) TO service_role;

-- increment_blog_views() : seule écriture publique autorisée sur
-- blog_articles. Le blog est accessible sans connexion, donc n'importe
-- quel visiteur (y compris anonyme) doit pouvoir faire avancer le
-- compteur de vues — mais on ne veut surtout pas ouvrir UPDATE sur toute
-- la table à "anon" pour autant. Cette fonction ne touche que la colonne
-- views, uniquement sur un article déjà publié, par incrément atomique
-- (évite aussi la course lecture-puis-écriture du `views + 1` côté client).
CREATE OR REPLACE FUNCTION increment_blog_views(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE blog_articles SET views = views + 1 WHERE id = p_article_id AND is_published = true;
END;
$$;

REVOKE ALL ON FUNCTION increment_blog_views(uuid) FROM public;
GRANT EXECUTE ON FUNCTION increment_blog_views(uuid) TO anon, authenticated;

-- delete_own_account() : seul chemin pour la suppression de compte.
-- Supprime directement la ligne auth.users de l'utilisateur courant :
-- comme profiles/user_credits/subscriptions/credit_transactions/
-- saved_rituals/formation_modules/formation_progress référencent toutes
-- auth.users(id) ON DELETE CASCADE, cette seule suppression nettoie tout
-- automatiquement — et surtout supprime le compte de connexion lui-même
-- (une simple suppression table par table depuis le client laisserait le
-- compte auth.users vivant, avec un utilisateur qui peut encore se
-- connecter mais sans plus aucune donnée associée).
CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION delete_own_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;

-- verify_marabout() : seul chemin pour valider une fiche marabout
-- ("Valider" dans /admin). Vérifie le rôle admin via user_roles (pas de
-- rôle Postgres "admin" séparé dans ce projet). Le GRANT de colonnes sur
-- marabouts empêche déjà le propriétaire de changer is_verified
-- lui-même ; cette fonction est la seule à pouvoir le faire.
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

-- activate_marabout_subscription() : seul chemin pour activer/renouveler
-- l'abonnement 5000 FCFA/mois d'un marabout ("Activer abonnement" dans
-- /admin, après confirmation manuelle du paiement WhatsApp). Fixe
-- l'expiration à 30 jours et journalise le paiement dans
-- marabout_abonnements, exactement comme credit_transactions pour les
-- crédits.
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

-- set_marabout_active() : "Désactiver"/réactiver un profil dans /admin.
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

-- increment_marabout_views() : seule écriture publique sur marabouts. La
-- fiche profil est publique (sans connexion) ; même raisonnement que
-- increment_blog_views() pour ne pas ouvrir UPDATE à "anon" sur toute la
-- table.
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

-- check_gemini_rate_limit() : limite serveur (fenêtre fixe) sur le nombre
-- d'appels Gemini par utilisateur. Appelée depuis gemini-proxy avant de
-- relayer la requête à Google. Contrairement à un compteur en mémoire côté
-- client ou dans l'Edge Function elle-même (qui redémarre à froid entre
-- les invocations et n'est pas partagé entre régions), cet état vit dans
-- la base et est donc fiable et impossible à contourner en appelant l'API
-- directement.
CREATE OR REPLACE FUNCTION check_gemini_rate_limit(p_max_calls integer DEFAULT 20, p_window_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_window_start timestamp;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT window_start, call_count INTO v_window_start, v_count
  FROM gemini_rate_limits WHERE user_id = v_user_id FOR UPDATE;

  IF v_window_start IS NULL OR now() - v_window_start > (p_window_seconds || ' seconds')::interval THEN
    INSERT INTO gemini_rate_limits (user_id, window_start, call_count)
      VALUES (v_user_id, now(), 1)
      ON CONFLICT (user_id) DO UPDATE SET window_start = now(), call_count = 1;
    RETURN true;
  END IF;

  IF v_count >= p_max_calls THEN
    RETURN false;
  END IF;

  UPDATE gemini_rate_limits SET call_count = call_count + 1 WHERE user_id = v_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION check_gemini_rate_limit(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION check_gemini_rate_limit(integer, integer) TO authenticated;

-- ============================================================
-- STORAGE : photos de profil
-- Bucket public (une photo de profil n'est pas une donnée sensible, ce qui
-- évite d'avoir à gérer des URLs signées côté client). Convention de
-- chemin : "<user_id>/avatar-<timestamp>.<ext>" — les policies vérifient
-- que le premier segment du chemin correspond à l'utilisateur connecté.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatar_user_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatar_user_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatar_user_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
