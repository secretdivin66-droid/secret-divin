import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Props {
  userId: string;
  avatarUrl: string | null;
  fallbackLabel: string;
  onChange: (newUrl: string | null) => void;
}

// Supprime tous les fichiers existants du dossier de l'utilisateur avant
// d'uploader/de supprimer : évite d'accumuler des fichiers orphelins
// (ex: ancienne photo en .png remplacée par une en .jpg) puisque le nom de
// fichier inclut un timestamp et change à chaque upload.
async function clearExistingFiles(userId: string) {
  const { data: existing } = await supabase.storage.from('avatars').list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from('avatars').remove(existing.map((f) => `${userId}/${f.name}`));
  }
}

export function AvatarUploader({ userId, avatarUrl, fallbackLabel, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Format non supporté. Utilise une image JPEG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Image trop lourde (2 Mo maximum).');
      return;
    }

    setUploading(true);
    try {
      await clearExistingFiles(userId);

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      onChange(urlData.publicUrl);
    } catch {
      setError("Échec de l'envoi de la photo. Réessaie dans quelques instants.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setUploading(true);
    try {
      await clearExistingFiles(userId);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) throw updateError;

      onChange(null);
    } catch {
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelected}
        className="hidden"
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
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
