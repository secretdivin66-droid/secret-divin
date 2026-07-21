import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { TOOL_COSTS, TOOLS } from '../utils/mystique';

export function DashboardPage() {
  const { user, profile } = useAuth();
  const credits = profile?.credits ?? 0;
  const displayName = profile?.prenom || user?.email || '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">
          Bienvenue, <span className="text-divine-blue">{displayName}</span>
        </h1>
        <span
          className={`px-4 py-2 rounded-full font-bold text-sm w-fit ${
            credits > 3 ? 'bg-or text-white' : 'bg-red-600 text-white'
          }`}
        >
          Solde : {credits} crédit{credits > 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TOOLS.map((tool) => {
          const cost = TOOL_COSTS[tool.id];
          return (
            <Link key={tool.id} to={tool.route} className="carte rounded-lg hover:border-or/50 flex flex-col gap-3">
              <div>
                {tool.nameArabic && (
                  <p className="arabic font-bold text-[1.15em] mb-1" style={{ color: '#f5c842' }}>
                    {tool.nameArabic}
                  </p>
                )}
                <h2 className="font-bold text-white">{tool.name}</h2>
              </div>
              <span className={`self-start text-xs font-bold px-2 py-1 rounded ${cost === 0 ? 'bg-green-600/20 text-green-400' : 'bg-or/10 text-or'}`}>
                {cost === 0 ? 'Gratuit' : `${cost} crédits`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
