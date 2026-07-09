-- ============================================================
-- Secret Divin — Correction upsert() sur formation_progress / formation_modules
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Corrige : aucune de ces deux tables n'avait de contrainte UNIQUE sur
-- (user_id, module_id[, lesson_id]). supabase-js .upsert() sans
-- onConflict cible la clé primaire (id) par défaut ; comme id n'est
-- jamais transmis par le client, chaque "upsert" de progression créait
-- en réalité une NOUVELLE ligne au lieu de mettre à jour l'existante —
-- accumulation de doublons et incohérence de la progression affichée.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formation_progress_user_module_lesson_unique'
  ) THEN
    ALTER TABLE formation_progress
      ADD CONSTRAINT formation_progress_user_module_lesson_unique UNIQUE (user_id, module_id, lesson_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formation_modules_user_module_unique'
  ) THEN
    ALTER TABLE formation_modules
      ADD CONSTRAINT formation_modules_user_module_unique UNIQUE (user_id, module_id);
  END IF;
END $$;
