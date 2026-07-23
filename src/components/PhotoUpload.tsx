import { useState } from 'react';
import { openCloudinaryUploadWidget } from '../lib/cloudinary';

interface Props {
  userId: string;
  currentPhotoUrl?: string | null;
  onUploadSuccess: (url: string) => void;
}

// Distinct de AvatarUploader.tsx : ce composant ne persiste rien en base
// lui-même — à l'inscription, la ligne marabouts n'existe pas encore, donc
// seul l'appelant sait quand/où sauvegarder l'URL (voir
// MaraboutInscriptionPage/MaraboutDashboardPage).
export function PhotoUpload({ currentPhotoUrl, onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl ?? null);

  function handleOpenWidget() {
    setError(null);
    setUploading(true);
    openCloudinaryUploadWidget({
      uploadPreset: 'marabout_images',
      folder: 'secret-divin/marabouts',
      onSuccess: (url) => {
        setUploading(false);
        setPreview(url);
        onUploadSuccess(url);
      },
      onError: (message) => {
        setUploading(false);
        setError(message);
      },
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[100px] h-[100px] sm:w-[120px] sm:h-[120px]">
        {preview ? (
          <img
            src={preview}
            alt="Photo de profil"
            className="w-full h-full rounded-full object-cover border-2 border-or"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-bleu border-2 border-or flex items-center justify-center text-center px-2">
            <span className="text-xs" style={{ color: '#a0aec0' }}>
              Aucune photo
            </span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleOpenWidget}
        disabled={uploading}
        className="btn-secondaire rounded text-sm px-4 py-1.5 disabled:opacity-50"
      >
        {uploading ? 'Envoi en cours...' : preview ? 'Changer la photo' : 'Ajouter une photo'}
      </button>

      <span className="text-xs text-center" style={{ color: '#a0aec0' }}>
        JPG, PNG ou WEBP — 5 Mo maximum
      </span>

      {error && <p className="text-red-400 text-xs text-center max-w-[240px]">{error}</p>}
    </div>
  );
}
