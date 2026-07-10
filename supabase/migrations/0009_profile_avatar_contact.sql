-- ============================================================
-- Secret Divin — Photo de profil, téléphone, pays
-- Migration ADDITIVE et IDEMPOTENTE : peut être rejouée sans erreur.
--
-- N'ajoute PAS de colonnes "credits"/"subscription_plan" sur profiles :
-- ces valeurs restent la propriété exclusive de user_credits/subscriptions,
-- modifiables uniquement via les fonctions SECURITY DEFINER spend_credits()/
-- grant_credits()/grant_subscription() (voir schema.sql). Les dupliquer en
-- colonnes normales sur profiles, avec la policy "l'utilisateur modifie
-- son propre profil", permettrait à n'importe quel utilisateur de s'auto-
-- attribuer des crédits/un abonnement gratuit via un appel direct à l'API
-- REST de Supabase (RLS est une sécurité par ligne, pas par colonne). Le
-- solde/abonnement réels sont exposés en lecture sur la page profil via
-- les tables existantes.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text;

-- Bucket public : une photo de profil n'est pas une donnée sensible, et le
-- rendre public évite d'avoir à gérer le renouvellement d'URLs signées côté
-- client pour un simple avatar.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Convention de chemin : "<user_id>/avatar-<timestamp>.<ext>". Les policies
-- ci-dessous vérifient que le premier segment du chemin correspond bien à
-- l'utilisateur connecté, empêchant quiconque d'écrire/supprimer dans le
-- dossier d'un autre utilisateur.
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatar_user_insert" ON storage.objects;
CREATE POLICY "avatar_user_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_user_update" ON storage.objects;
CREATE POLICY "avatar_user_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_user_delete" ON storage.objects;
CREATE POLICY "avatar_user_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
