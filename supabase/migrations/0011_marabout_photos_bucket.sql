-- ============================================================
-- Secret Divin — Bucket Storage pour les photos de profil marabout
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- Même schéma que le bucket "avatars" (voir 0009_profile_avatar_contact.sql) :
-- bucket public (une photo de profil marabout, affichée publiquement sur
-- l'annuaire, n'est pas une donnée sensible), et policies qui vérifient que
-- le premier segment du chemin correspond à l'utilisateur connecté —
-- convention de chemin "<user_id>/photo-<timestamp>.<ext>".
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marabout-photos',
  'marabout-photos',
  true,
  5242880, -- 5 Mo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "marabout_photo_public_read" ON storage.objects;
CREATE POLICY "marabout_photo_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marabout-photos');

DROP POLICY IF EXISTS "marabout_photo_user_insert" ON storage.objects;
CREATE POLICY "marabout_photo_user_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'marabout-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "marabout_photo_user_update" ON storage.objects;
CREATE POLICY "marabout_photo_user_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'marabout-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "marabout_photo_user_delete" ON storage.objects;
CREATE POLICY "marabout_photo_user_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'marabout-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
