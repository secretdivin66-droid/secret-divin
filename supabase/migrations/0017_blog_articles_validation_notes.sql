-- ============================================================
-- Secret Divin — Blog : colonne validation_notes (auto-blog)
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Écrite par supabase/functions/auto-blog : explique si un brouillon
-- généré automatiquement respecte les règles obligatoires du system
-- prompt (liens internes, CTA milieu, mentions de la marque) ou pas, et
-- pourquoi — pour relecture manuelle dans BlogAdminPanel avant
-- publication. L'article reste toujours inséré en is_published=false
-- quoi qu'il arrive (pas de publication automatique sur ce projet) :
-- cette colonne informe la relecture, elle ne bloque rien.
-- ============================================================

ALTER TABLE blog_articles
  ADD COLUMN IF NOT EXISTS validation_notes text;
