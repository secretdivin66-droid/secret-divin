-- ============================================================
-- Secret Divin — Blog : colonne cover_image_alt
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Texte alternatif de l'image de couverture, généré par Gemini (même appel
-- que title/excerpt/content/faq, voir supabase/functions/auto-blog) à
-- partir du sujet de l'article — affiché comme attribut alt sur la vraie
-- balise <img> de BlogArticlePage.tsx/BlogPage.tsx (converties depuis un
-- fond CSS backgroundImage, qui ne permet aucun texte alternatif).
-- NULL pour les 18 articles publiés avant cette migration (2026-07-29) et
-- pour tout article créé/édité manuellement via BlogAdminPanel : les deux
-- pages retombent alors sur article.title comme alt, toujours mieux
-- qu'aucun texte alternatif.
-- ============================================================

ALTER TABLE blog_articles
  ADD COLUMN IF NOT EXISTS cover_image_alt text;
