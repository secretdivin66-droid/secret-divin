-- ============================================================
-- Secret Divin — Corrige le GRANT UPDATE de marabouts + supprime les
-- colonnes mortes en doublon (whatsapp/specialites)
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte (découvert le 2026-08-06 en ajoutant un numéro WhatsApp à un
-- profil marabout) : `marabouts` a deux paires de colonnes quasi-
-- identiques — `whatsapp`/`numero_whatsapp` et `specialites`/
-- `specialite`. La migration 0013 documentait déjà que le CODE avait été
-- corrigé pour utiliser numero_whatsapp/specialite (les vrais noms de
-- colonnes), mais le GRANT UPDATE colonne-par-colonne dans schema.sql
-- (ligne ~416) n'a jamais été mis à jour — il listait encore whatsapp et
-- specialites. Résultat : le formulaire de MaraboutDashboardPage.tsx
-- (`.update({ ..., numero_whatsapp, specialite, ... })`) échouait
-- silencieusement avec "permission denied for table marabouts" (42501)
-- pour TOUT marabout essayant de sauvegarder son profil — un seul
-- champ sans le bon GRANT suffit à faire échouer tout l'UPDATE.
-- Confirmé en rejouant l'UPDATE exact du dashboard en tant que rôle
-- authenticated (même technique que la vérification post-fix de 0003).
--
-- whatsapp/specialites (les colonnes mortes) ne sont lues/écrites par
-- AUCUN code du repo (vérifié par recherche exhaustive) — supprimées
-- ici plutôt que juste corrigées dans le GRANT, pour ne plus jamais
-- risquer de mettre à jour la mauvaise colonne par erreur.
-- ============================================================

ALTER TABLE marabouts DROP COLUMN IF EXISTS whatsapp;
ALTER TABLE marabouts DROP COLUMN IF EXISTS specialites;

REVOKE UPDATE ON marabouts FROM authenticated;
GRANT UPDATE (
  nom_complet, photo_url, description, specialite, pays, ville,
  langues, numero_whatsapp, tarifs_description, annees_experience, updated_at
) ON marabouts TO authenticated;
