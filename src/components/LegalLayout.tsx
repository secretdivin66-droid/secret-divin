import type { ReactNode } from 'react';

interface Section {
  heading: string;
  content: ReactNode;
}

interface Props {
  title: string;
  showUpdatedDate?: boolean;
  sections: Section[];
}

// Accent volontairement différent de la classe Tailwind "text-or"/"bg-or"
// (qui vaut #2563EB, bleu, malgré son nom) : les pages légales demandent
// explicitement un or #f9a825, d'où l'usage de style inline ici plutôt que
// des classes utilitaires du reste du site.
const ACCENT = '#f9a825';
const GRAY = '#b0b8d4';

const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function Separateur() {
  return (
    <div className="flex items-center justify-center gap-2 my-6 text-sm" style={{ color: ACCENT }}>
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function LegalLayout({ title, showUpdatedDate = true, sections }: Props) {
  return (
    <div className="min-h-screen px-4 sm:px-8 py-10 sm:py-12" style={{ background: '#0a0e2e' }}>
      <div className="max-w-[800px] mx-auto w-full">
        <h1 className="text-center font-bold text-[1.6rem] sm:text-[2rem]" style={{ color: ACCENT }}>
          {title}
        </h1>
        {showUpdatedDate && (
          <p className="text-center text-sm mt-2" style={{ color: GRAY }}>
            Dernière mise à jour : {today}
          </p>
        )}

        <Separateur />

        {sections.map((section, i) => (
          <div key={i}>
            <h2 className="font-bold mb-3" style={{ color: ACCENT, fontSize: '1.1rem' }}>
              {section.heading}
            </h2>
            <div className="text-white" style={{ lineHeight: 1.7 }}>
              {section.content}
            </div>
            {i < sections.length - 1 && <Separateur />}
          </div>
        ))}
      </div>
    </div>
  );
}
