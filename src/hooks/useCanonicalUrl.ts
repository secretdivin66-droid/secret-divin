import { useEffect } from 'react';

const CANONICAL_ORIGIN = 'https://www.secretdivin.com';

// Pose (ou réutilise) <link rel="canonical"> dans <head>, restauré au
// démontage — même schéma que document.title dans BlogArticlePage.tsx :
// une SPA ne recharge jamais <head> entre deux pages, donc sans ce nettoyage
// la canonical d'une page resterait affichée après avoir navigué vers une
// autre.
//
// path : chemin relatif (ex. "/blog/mon-article"), jamais l'URL complète —
// pointe toujours vers www.secretdivin.com quel que soit le domaine réel
// d'où la page est servie (utile le temps que la redirection 301
// secretdivin.com -> www.secretdivin.com, voir vercel.json, se propage
// partout).
export function useCanonicalUrl(path: string): void {
  useEffect(() => {
    const href = `${CANONICAL_ORIGIN}${path}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;

    return () => {
      if (created) link?.remove();
    };
  }, [path]);
}
