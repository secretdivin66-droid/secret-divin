-- ============================================================
-- Secret Divin — Corrige le type de marabouts.specialite (text -> text[])
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contexte (découvert le 2026-08-06, immédiatement après avoir activé le
-- tout premier marabout jamais visible sur /marabouts) : `specialite` est
-- une colonne `text` alors que TOUT le code (MaraboutsPage.tsx,
-- MaraboutProfilPage.tsx) la traite comme un tableau JS
-- (`.map()`/`.slice()`/`.includes()`) — comme `langues`, qui elle est
-- bien `text[]`. Résultat : quand MaraboutInscriptionPage.tsx insère un
-- vrai tableau JS via supabase-js, PostgREST le sérialise en JSON et
-- Postgres stocke la chaîne littérale '["Géomancie","Talismans"...]'
-- dans la colonne text au lieu d'un vrai tableau Postgres.
-- `visibleSpecialites.map((s) => ...)` (MaraboutsPage.tsx, sur
-- `m.specialite.slice(0, 3)`) plante alors avec "visibleSpecialites.map
-- is not a function" — String n'a pas de .map() — et fait crasher TOUT
-- le rendu de /marabouts (une seule ligne dans .map() qui throw casse le
-- composant entier). Resté invisible jusqu'ici car `filtered` était
-- toujours vide (aucun marabout vérifié+actif+abonné n'existait avant
-- aujourd'hui) : le bug dormait depuis l'écriture de ce code.
--
-- Convertit la colonne en text[] (comme langues) et migre la valeur
-- existante (JSON stringifié -> vrai tableau Postgres) plutôt que de
-- patcher chaque site de lecture avec un JSON.parse() côté client — ça
-- rend aussi les futurs INSERT (déjà envoyés comme tableau JS par
-- MaraboutInscriptionPage.tsx) corrects nativement, sans changement de
-- code nécessaire.
--
-- ALTER COLUMN ... TYPE text[] USING n'accepte pas de sous-requête dans
-- l'expression de transformation (erreur Postgres 0A000), donc migration
-- en 2 temps : nouvelle colonne + UPDATE (qui autorise les sous-requêtes)
-- + bascule. Le GRANT UPDATE colonne-par-colonne (voir 0026) ne survit
-- pas à un DROP COLUMN : reconstitué explicitement à la fin.
-- ============================================================

ALTER TABLE marabouts ADD COLUMN IF NOT EXISTS specialite_tmp text[];

UPDATE marabouts SET specialite_tmp =
  CASE
    WHEN specialite IS NULL OR specialite = '' THEN ARRAY[]::text[]
    ELSE ARRAY(SELECT jsonb_array_elements_text(specialite::jsonb))
  END
WHERE specialite_tmp IS NULL;

ALTER TABLE marabouts DROP COLUMN specialite;
ALTER TABLE marabouts RENAME COLUMN specialite_tmp TO specialite;

GRANT UPDATE (specialite) ON marabouts TO authenticated;
