import { Cloudinary } from '@cloudinary/url-gen';

export const cld = new Cloudinary({
  cloud: { cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME },
});

interface CloudinaryUploadResult {
  event: string;
  info: { secure_url: string };
}

declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (
        options: Record<string, unknown>,
        callback: (error: unknown, result: CloudinaryUploadResult) => void
      ) => { open: () => void };
    };
  }
}

interface OpenUploadWidgetOptions {
  uploadPreset: string;
  folder: string;
  cropping?: boolean;
  croppingAspectRatio?: number;
  onSuccess: (url: string) => void;
  onError: (message: string) => void;
}

// Point d'entrée unique pour ouvrir le widget d'upload Cloudinary — partagé
// par AvatarUploader, PhotoUpload et BlogAdminPanel, pour éviter de dupliquer
// la config (cloudName, formats, taille max) et la vérification que le
// script global (chargé depuis index.html) est bien prêt.
export function openCloudinaryUploadWidget({
  uploadPreset,
  folder,
  cropping,
  croppingAspectRatio,
  onSuccess,
  onError,
}: OpenUploadWidgetOptions) {
  if (!window.cloudinary) {
    onError("Le widget d'upload n'est pas encore chargé. Réessaie dans quelques instants.");
    return;
  }

  const widget = window.cloudinary.createUploadWidget(
    {
      cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
      uploadPreset,
      folder,
      maxFileSize: 5000000,
      allowedFormats: ['jpg', 'png', 'webp'],
      ...(cropping ? { cropping, croppingAspectRatio } : {}),
    },
    (error, result) => {
      if (error) {
        onError("Erreur lors de l'upload.");
        return;
      }
      if (result?.event === 'success') {
        onSuccess(result.info.secure_url);
      }
    }
  );
  widget.open();
}
