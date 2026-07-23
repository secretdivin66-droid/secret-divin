import { supabase } from '../lib/supabaseClient';

// Supprime tous les fichiers existants du dossier de l'utilisateur — les
// nouvelles photos marabout sont désormais uploadées vers Cloudinary (voir
// PhotoUpload.tsx), mais cette fonction reste nécessaire pour nettoyer les
// photos encore hébergées sur Supabase Storage depuis avant la migration.
async function clearExistingFiles(userId: string) {
  const { data: existing } = await supabase.storage.from('marabout-photos').list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from('marabout-photos').remove(existing.map((f) => `${userId}/${f.name}`));
  }
}

// Appelée avant la suppression de compte (voir ProfilPage.tsx) : la
// suppression en cascade des tables ne touche pas le Storage, donc sans cet
// appel une photo marabout resterait orpheline dans le bucket.
export async function deleteMaraboutPhoto(userId: string): Promise<void> {
  await clearExistingFiles(userId);
}
