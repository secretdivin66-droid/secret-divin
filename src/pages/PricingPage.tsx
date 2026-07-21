import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { SubscribeButton } from '../components/SubscribeButton';

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PricingPage() {
  const { user } = useAuth();
  const { loading, planId, plans, expiresAt } = useSubscription(user?.id ?? null);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Nos Plans d'Abonnement</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Choisis le plan qui correspond à ton usage. Les crédits n'expirent jamais, quel que soit le plan.
        </p>

        <Separateur />

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-or border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center" style={{ color: '#a0aec0' }}>Les plans ne sont pas encore configurés.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = !!user && planId === plan.id;
              const isPopular = plan.id === 'premium';

              return (
                <div
                  key={plan.id}
                  className="rounded-lg p-6 flex flex-col text-center"
                  style={{
                    background: '#0d1545',
                    border: isPopular ? '2px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
                  }}
                >
                  {isPopular && (
                    <span className="self-center px-3 py-1 rounded-full text-xs font-bold bg-or text-white mb-3">
                      POPULAIRE
                    </span>
                  )}
                  <h2 className="text-white font-bold text-xl">{plan.name}</h2>
                  <p className="text-or font-bold text-[2.2rem] mt-2">
                    {plan.price === 0 ? 'Gratuit' : `${plan.price.toLocaleString('fr-FR')} FCFA`}
                  </p>
                  {plan.price > 0 && <p className="text-sm" style={{ color: '#a0aec0' }}>par mois</p>}

                  <ul className="text-left mt-5 flex flex-col gap-2 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="text-white text-sm flex gap-2">
                        <span className="text-or">✦</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {isCurrent ? (
                      <span className="rounded inline-block w-full py-2 font-bold opacity-70 cursor-default border border-or/40 text-or">
                        Plan actuel
                      </span>
                    ) : plan.id === 'free' ? (
                      user ? (
                        <Link to="/billing" className="btn-secondaire rounded inline-block w-full py-2">
                          Gérer mon abonnement
                        </Link>
                      ) : (
                        <Link to="/auth" className="btn-principal rounded inline-block w-full py-2">
                          Créer un compte
                        </Link>
                      )
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        userId={user?.id ?? null}
                        userEmail={user?.email ?? null}
                        className="btn-principal rounded w-full py-2 inline-block"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {user && expiresAt && (
          <p className="text-center text-sm mt-6" style={{ color: '#a0aec0' }}>
            Ton abonnement actuel se renouvelle le {formatDate(expiresAt)}.
          </p>
        )}
      </div>
    </div>
  );
}
