import { supabase } from '../lib/supabaseClient';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Supprime tous les fichiers existants du dossier de l'utilisateur avant
// d'uploader/de supprimer : évite d'accumuler des fichiers orphelins (le
// nom de fichier inclut un timestamp et change à chaque upload) — même
// pattern que AvatarUploader.tsx (bucket "avatars").
async function clearExistingFiles(userId: string) {
  const { data: existing } = await supabase.storage.from('marabout-photos').list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from('marabout-photos').remove(existing.map((f) => `${userId}/${f.name}`));
  }
}

export async function uploadMaraboutPhoto(userId: string, file: File): Promise<UploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: 'Format non supporté. Utilise JPG, PNG ou WEBP.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: 'La photo ne doit pas dépasser 5 Mo.' };
  }

  try {
    await clearExistingFiles(userId);

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/photo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('marabout-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      return { success: false, error: "Erreur lors de l'upload. Réessaie." };
    }

    const { data: urlData } = supabase.storage.from('marabout-photos').getPublicUrl(path);
    return { success: true, url: urlData.publicUrl };
  } catch {
    return { success: false, error: 'Erreur inattendue. Réessaie.' };
  }
}

// Appelée avant la suppression de compte (voir ProfilPage.tsx) : la
// suppression en cascade des tables ne touche pas le Storage, donc sans cet
// appel une photo marabout resterait orpheline dans le bucket.
export async function deleteMaraboutPhoto(userId: string): Promise<void> {
  await clearExistingFiles(userId);
}
