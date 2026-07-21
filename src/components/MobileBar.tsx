import { Link, useLocation } from 'react-router-dom';

const HIDDEN_PREFIXES = ['/auth', '/fonctionnalites', '/credits', '/blog', '/contact', '/marabouts'];

const ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/carres-magiques', label: 'Carrés' },
  { to: '/destin', label: 'Destin' },
  { to: '/plantes', label: 'Plantes' },
  { to: '/profil', label: 'Profil' },
];

export function MobileBar() {
  const location = useLocation();
  const hidden = HIDDEN_PREFIXES.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)
  );

  if (hidden) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-around items-center py-2"
      style={{ background: '#0d1545', borderTop: '1px solid #f5c842' }}
    >
      {ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`text-xs px-2 py-1 ${
            location.pathname === item.to ? 'text-or font-bold' : 'text-white'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
