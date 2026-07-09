import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { CreditBadge } from './CreditBadge';

interface Profile {
  prenom: string | null;
  credits: number;
  isAdmin: boolean;
}

interface Props {
  user: User | null;
  profile: Profile | null;
}

export function Header({ user, profile }: Props) {
  const isAdmin = profile?.isAdmin ?? false;

  return (
    <header className="bg-bleu border-b border-or/20 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-or/10 border border-or flex items-center justify-center text-or font-bold shrink-0">
            ✦
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-or font-bold text-sm sm:text-lg truncate">Secret Divin</span>
            <span className="text-gray-400 text-[0.65rem] tracking-widest hidden sm:block">SAGESSE SPIRITUELLE</span>
          </div>
          <span className="arabic text-or text-sm hidden sm:inline">الحكمة الروحية</span>
        </Link>

        {user ? (
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link to="/dashboard" className="text-white hover:text-or transition">Dashboard</Link>
            <Link to="/credits" className="text-white hover:text-or transition">Tarifs</Link>
            <Link to="/marabouts" className="text-white hover:text-or transition">Marabouts</Link>
            <Link to="/blog" className="text-white hover:text-or transition">Blog</Link>
            <Link to="/contact" className="text-white hover:text-or transition">Contact</Link>
            {isAdmin && (
              <Link to="/admin" className="text-red-400 hover:text-red-300 transition">Administration</Link>
            )}
          </nav>
        ) : (
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <Link to="/fonctionnalites" className="text-white hover:text-or transition">Fonctionnalités</Link>
            <Link to="/credits" className="text-white hover:text-or transition">Tarifs</Link>
            <Link to="/marabouts" className="text-white hover:text-or transition">Marabouts</Link>
            <Link to="/blog" className="text-white hover:text-or transition">Blog</Link>
            <Link to="/contact" className="text-white hover:text-or transition">Contact</Link>
          </nav>
        )}

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {user ? (
            <>
              <CreditBadge userId={user.id} />
              <Link to="/profil" className="text-white hover:text-or transition text-sm truncate max-w-[100px] sm:max-w-none">
                {profile?.prenom || user.email}
              </Link>
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
      </div>
    </header>
  );
}
