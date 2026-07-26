-- ============================================================
-- Secret Divin — Blog : colonnes image_credit_name / image_credit_url
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Écrites par supabase/functions/auto-blog quand la couverture provient
-- d'Unsplash (recherche par mots-clés, voir searchUnsplashImage) : nom du
-- photographe et lien vers son profil, affichés sous l'image de couverture
-- par BlogArticlePage.tsx. Restent NULL quand la couverture vient du
-- fallback statique (MYSTICAL_IMAGES) — pas d'attribution à afficher dans
-- ce cas, ou quand l'article a été créé/édité manuellement via
-- BlogAdminPanel (upload direct, pas de recherche Unsplash).
-- ============================================================

ALTER TABLE blog_articles
  ADD COLUMN IF NOT EXISTS image_credit_name text,
  ADD COLUMN IF NOT EXISTS image_credit_url text;
