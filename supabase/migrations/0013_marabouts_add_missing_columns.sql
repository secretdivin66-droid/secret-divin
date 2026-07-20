-- ============================================================
-- Secret Divin — Ajoute les colonnes manquantes de marabouts
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Liste réelle des colonnes de marabouts, confirmée par l'utilisateur
-- le 2026-07-20 : id, nom_complet, numero_whatsapp, specialite, pays,
-- ville, description, photo_url, created_at, is_verified, is_active,
-- abonnement_actif, user_id. Il manquait langues, tarifs_description,
-- annees_experience et updated_at — ces 4 colonnes sont utilisées par
-- le code (formulaire d'édition MaraboutDashboardPage.tsx) et par les
-- fonctions admin verify_marabout/activate_marabout_subscription/
-- set_marabout_active (voir 0006_marabouts.sql), qui échoueraient
-- toutes avec la même erreur 42703 sans updated_at.
--
-- whatsapp/specialites (mal nommées dans le code, colonnes existantes
-- numero_whatsapp/specialite) ne sont PAS concernées ici : ce n'est
-- pas un problème de colonne manquante mais de nom différent, corrigé
-- côté code (MaraboutDashboardPage.tsx), pas par une migration.
-- ============================================================

ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS langues text[];
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS tarifs_description text;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS annees_experience integer DEFAULT 0;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- Trouvées en cherchant plus largement (lecture seule, pas de 400 direct
-- sur l'inscription, mais même bug : utilisées par MaraboutDashboardPage,
-- MaraboutProfilPage, AdminPage et la fonction increment_marabout_views).
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS abonnement_expire_le timestamp;
ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS vues integer DEFAULT 0;
