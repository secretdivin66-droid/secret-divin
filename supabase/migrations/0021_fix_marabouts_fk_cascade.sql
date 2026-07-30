-- ============================================================
-- Secret Divin — Corrige la FK marabouts.user_id pour qu'elle cascade réellement
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte (découvert le 2026-07-30) : 0006_marabouts.sql déclare déjà
-- "user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE", mais la
-- table marabouts existait déjà en prod avant que cette ligne soit écrite
-- (même dérive schéma-fichier-vs-réalité que documentée dans
-- 0020_reconcile_grant_subscription.sql) — le CREATE TABLE IF NOT EXISTS
-- de 0006 ne l'a donc jamais appliquée. Vérifié via pg_get_constraintdef :
-- marabouts_user_id_fkey est la SEULE FK vers auth.users(id) parmi toutes
-- les tables du projet à ne pas cascader. Conséquence réelle :
-- delete_own_account() (0005), qui se contente d'un
-- "DELETE FROM auth.users WHERE id = auth.uid()", échoue avec une erreur
-- de contrainte de clé étrangère pour tout marabout essayant de
-- supprimer son compte depuis /profil.
-- ============================================================

ALTER TABLE marabouts DROP CONSTRAINT IF EXISTS marabouts_user_id_fkey;
ALTER TABLE marabouts ADD CONSTRAINT marabouts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
