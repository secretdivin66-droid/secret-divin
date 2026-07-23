import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { openCloudinaryUploadWidget } from '../lib/cloudinary';

interface Props {
  userId: string;
  avatarUrl: string | null;
  fallbackLabel: string;
  onChange: (newUrl: string | null) => void;
}

// Nettoie un éventuel ancien avatar Supabase Storage (avant la migration
// vers Cloudinary) — les nouveaux avatars ne sont plus écrits ici, mais on
// évite de laisser un fichier orphelin pour les comptes qui en avaient un.
async function clearLegacySupabaseAvatar(userId: string) {
  const { data: existing } = await supabase.storage.from('avatars').list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from('avatars').remove(existing.map((f) => `${userId}/${f.name}`));
  }
}

export function AvatarUploader({ userId, avatarUrl, fallbackLabel, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUploadSuccess(url: string) {
    setUploading(true);
    try {
      void clearLegacySupabaseAvatar(userId);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      onChange(url);
    } catch (err) {
      console.error("[AvatarUploader] Échec de l'enregistrement de la photo :", err);
      setError("Échec de l'enregistrement de la photo. Réessaie dans quelques instants.");
    } finally {
      setUploading(false);
    }
  }

  function handleOpenWidget() {
    setError(null);
    openCloudinaryUploadWidget({
      uploadPreset: 'avatar_images',
      folder: 'secret-divin/avatars',
      cropping: true,
      croppingAspectRatio: 1,
      onSuccess: (url) => {
        void handleUploadSuccess(url);
      },
      onError: setError,
    });
  }

  async function handleDelete() {
    setError(null);
    setUploading(true);
    try {
      await clearLegacySupabaseAvatar(userId);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      onChange(null);
    } catch (err) {
      console.error('[AvatarUploader] Échec de la suppression de la photo :', err);
      setError('Échec de la suppression de la photo. Réessaie dans quelques instants.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-24">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Photo de profil"
            className="w-24 h-24 rounded-full object-cover border-2 border-or"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-or text-white font-bold flex items-center justify-center text-3xl border-2 border-or">
            {fallbackLabel.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleOpenWidget}
          disabled={uploading}
          className="btn-secondaire rounded text-sm px-3 py-1.5 disabled:opacity-50"
        >
          {avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={uploading}
            className="rounded text-sm px-3 py-1.5 disabled:opacity-50"
            style={{ border: '1px solid #e53935', color: '#e53935', background: 'transparent' }}
          >
            Supprimer
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-xs text-center max-w-[240px]">{error}</p>}
    </div>
  );
}
