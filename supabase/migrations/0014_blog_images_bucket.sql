-- ============================================================
-- Secret Divin — Bucket Storage pour les images de couverture du blog
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Contrairement à "avatars"/"marabout-photos" (scopés par dossier
-- utilisateur), ce bucket n'est écrit que par les admins (formulaire
-- /admin/blog) : les policies d'écriture vérifient donc user_roles.role =
-- 'admin' plutôt qu'un segment de chemin. Lecture publique, comme les
-- articles publiés eux-mêmes.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,
  5242880, -- 5 Mo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "blog_image_public_read" ON storage.objects;
CREATE POLICY "blog_image_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "blog_image_admin_insert" ON storage.objects;
CREATE POLICY "blog_image_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'blog-images'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

DROP POLICY IF EXISTS "blog_image_admin_update" ON storage.objects;
CREATE POLICY "blog_image_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'blog-images'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

DROP POLICY IF EXISTS "blog_image_admin_delete" ON storage.objects;
CREATE POLICY "blog_image_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'blog-images'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );
