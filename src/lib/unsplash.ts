const UNSPLASH_API_URL = 'https://api.unsplash.com';

export interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
    links: { html: string };
  };
  links: { html: string; download: string };
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
}

// Recherche de photos Unsplash (endpoint /search/photos), authentifiée par
// le header Authorization: Client-ID (clé publique, appel fait côté client).
export async function searchUnsplashPhotos(query: string, perPage = 10): Promise<UnsplashPhoto[]> {
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
  const url = `${UNSPLASH_API_URL}/search/photos?query=${encodeURIComponent(query)}&per_page=${String(perPage)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!response.ok) {
    throw new Error(`Unsplash search failed: ${String(response.status)}`);
  }

  const data = (await response.json()) as UnsplashSearchResponse;
  return data.results;
}
