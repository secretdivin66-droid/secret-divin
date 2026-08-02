-- ============================================================
-- Secret Divin — Supprime les policies storage.objects dupliquées sur
-- blog-images
-- Migration ADDITIVE et IDEMPOTENTE (DROP POLICY IF EXISTS).
--
-- Contexte (découvert le 2026-08-03, audit de dérive) : deux policies
-- dashboard-era ("Public read blog-images", "Admin upload blog-images")
-- coexistaient avec leurs équivalents exacts créés par 0014
-- (blog_image_public_read, blog_image_admin_insert) — même qual/with_check,
-- donc redondance pure sans écart de comportement (contrairement à la
-- dérive marabouts de 0022, ici pas de trou de sécurité, juste du
-- nettoyage). On garde les versions au nommage conventionnel
-- (blog_image_*) créées par 0014.
-- ============================================================

drop policy if exists "Public read blog-images" on storage.objects;
drop policy if exists "Admin upload blog-images" on storage.objects;
