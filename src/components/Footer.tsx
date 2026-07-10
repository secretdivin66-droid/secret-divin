import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-bleu border-t border-or/20 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div>
          <h3 className="text-or font-bold mb-3">Services</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><Link to="/fonctionnalites" className="hover:text-or transition">Fonctionnalités</Link></li>
            <li><Link to="/credits" className="hover:text-or transition">Tarifs</Link></li>
            <li><Link to="/pricing" className="hover:text-or transition">Abonnements</Link></li>
            <li><Link to="/marabouts" className="hover:text-or transition">Marabouts</Link></li>
            <li><Link to="/formation" className="hover:text-or transition">Formation</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-or font-bold mb-3">À propos</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><Link to="/fonctionnalites" className="hover:text-or transition">Fonctionnalités</Link></li>
            <li><Link to="/credits" className="hover:text-or transition">Tarifs</Link></li>
            <li><Link to="/blog" className="hover:text-or transition">Blog</Link></li>
            <li><Link to="/contact" className="hover:text-or transition">Contact</Link></li>
            <li><Link to="/confidentialite" className="hover:text-or transition">Confidentialité</Link></li>
            <li><Link to="/conditions" className="hover:text-or transition">Conditions</Link></li>
            <li><Link to="/mentions-legales" className="hover:text-or transition">Mentions légales</Link></li>
            <li><Link to="/remboursement" className="hover:text-or transition">Remboursement</Link></li>
            <li><Link to="/marabouts/inscrire" className="hover:text-or transition">Devenir marabout</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-or font-bold mb-3">Contact</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li><Link to="/contact" className="hover:text-or transition">Nous contacter</Link></li>
          </ul>
        </div>
      </div>
      <div className="text-center text-xs text-gray-500 pb-6">
        © Secret Divin 2026. Tous droits réservés.
      </div>
    </footer>
  );
}
