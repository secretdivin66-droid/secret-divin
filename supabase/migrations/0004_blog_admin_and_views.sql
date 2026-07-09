-- ============================================================
-- Secret Divin — Écriture admin sur blog_articles + compteur de vues public
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- blog_articles n'avait qu'une policy SELECT (lecture des articles
-- publiés). Sans policy d'écriture, le formulaire d'admin ne pouvait
-- rien enregistrer (RLS bloque par défaut). Ajoute :
-- 1) une policy FOR ALL réservée aux admins (user_roles.role='admin')
-- 2) une fonction increment_blog_views() pour la seule écriture que le
--    grand public (page /blog/:slug, sans connexion) a légitimement
--    besoin de faire, sans ouvrir UPDATE à tout le monde sur la table.
-- ============================================================

DROP POLICY IF EXISTS "admin_manage_blog" ON blog_articles;
CREATE POLICY "admin_manage_blog" ON blog_articles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

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
