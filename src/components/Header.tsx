import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { CreditBadge } from './CreditBadge';

interface Profile {
  prenom: string | null;
  nom: string | null;
  fullName: string;
  credits: number;
  isAdmin: boolean;
}

interface Props {
  user: User | null;
  profile: Profile | null;
  onSignOut: () => void;
}

export function Header({ user, profile, onSignOut }: Props) {
  const isAdmin = profile?.isAdmin ?? false;
  const displayName = profile?.fullName || profile?.prenom || user?.email;
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = user
    ? [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/credits', label: 'Tarifs' },
        { to: '/pricing', label: 'Abonnements' },
        { to: '/marabouts', label: 'Marabouts' },
        { to: '/blog', label: 'Blog' },
        { to: '/contact', label: 'Contact' },
        ...(isAdmin ? [{ to: '/admin', label: 'Administration' }] : []),
      ]
    : [
        { to: '/fonctionnalites', label: 'Fonctionnalités' },
        { to: '/credits', label: 'Tarifs' },
        { to: '/pricing', label: 'Abonnements' },
        { to: '/marabouts', label: 'Marabouts' },
        { to: '/blog', label: 'Blog' },
        { to: '/contact', label: 'Contact' },
      ];

  return (
    <header className="bg-bleu border-b border-or/20 overflow-x-hidden relative">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/logo.svg" alt="Secrets Divins" className="h-10 w-10 rounded-full" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-or font-bold text-sm sm:text-lg truncate">Secret Divin</span>
            <span className="text-gray-400 text-[0.65rem] tracking-widest hidden sm:block">SAGESSE SPIRITUELLE</span>
          </div>
          <span className="arabic text-or text-sm hidden sm:inline">الحكمة الروحية</span>
        </Link>

        <nav className="hidden md:flex items-center gap-4 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={link.to === '/admin' ? 'text-red-400 hover:text-red-300 transition' : 'text-white hover:text-or transition'}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-1.5 sm:gap-3 shrink-0">
          {user ? (
            <>
              <CreditBadge userId={user.id} />
              <Link
                to="/billing"
                className="hidden sm:inline text-white hover:text-or transition text-sm whitespace-nowrap"
              >
                Facturation
              </Link>
              <Link
                to="/profil"
                className="text-white hover:text-or transition text-sm truncate max-w-[80px] sm:max-w-none"
                title={user.email}
              >
                {displayName}
              </Link>
              <button
                onClick={onSignOut}
                className="border border-or/40 text-or rounded font-bold transition text-xs px-2.5 py-1.5 whitespace-nowrap hover:bg-or/10"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              {/* Classes Tailwind directement ici plutôt que .btn-secondaire/.btn-principal :
                  ces classes globales (index.css) fixent un padding non responsive
                  (12px 28px) qui, à spécificité égale, l'emporterait sur des utilitaires
                  Tailwind de padding ajoutés en plus (elles sont déclarées après
                  @tailwind utilities dans le fichier). */}
              <Link
                to="/auth"
                className="border border-or text-or rounded font-bold transition text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap"
              >
                Se connecter
              </Link>
              <Link
                to="/auth"
                className="bg-or text-white rounded font-bold transition text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap"
              >
                S'inscrire
              </Link>
            </>
          )}
        </div>

        {/* Menu hamburger — visible uniquement sur mobile, le nav desktop
            (md:flex) est masqué au même point de rupture donc les liens
            n'existent qu'à un seul endroit à la fois dans le DOM visible. */}
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="md:hidden w-9 h-9 rounded flex flex-col items-center justify-center gap-1.5 shrink-0 border border-or/40"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span className="w-4 h-0.5 bg-or rounded-full" />
          <span className="w-4 h-0.5 bg-or rounded-full" />
          <span className="w-4 h-0.5 bg-or rounded-full" />
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-bleu border-t border-or/20 px-4 py-4 flex flex-col gap-3 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={link.to === '/admin' ? 'text-red-400' : 'text-white hover:text-or transition'}
            >
              {link.label}
            </Link>
          ))}

          <div className="border-t border-or/10 pt-3 flex flex-col gap-3">
            {user ? (
              <>
                <Link to="/billing" onClick={() => setMenuOpen(false)} className="text-white hover:text-or transition">
                  Facturation
                </Link>
                <Link to="/profil" onClick={() => setMenuOpen(false)} className="text-white hover:text-or transition">
                  {displayName}
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="border border-or/40 text-or rounded font-bold transition text-sm px-2.5 py-1.5 text-center hover:bg-or/10"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="border border-or text-or rounded font-bold transition text-sm px-2.5 py-2 text-center"
                >
                  Se connecter
                </Link>
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="bg-or text-white rounded font-bold transition text-sm px-2.5 py-2 text-center"
                >
                  S'inscrire
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
