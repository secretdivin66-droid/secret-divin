import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import type { PlanId } from '../hooks/useSubscription';

const PLAN_LABEL: Record<PlanId, string> = { free: 'Free', premium: 'Premium', pro: 'Pro' };

interface Props {
  minPlan: PlanId;
  children: ReactNode;
  fallback?: ReactNode;
}

// Gate réutilisable pour protéger une fonctionnalité derrière un plan
// minimum. N'est appliqué à aucune page/outil existant dans ce projet :
// choisir quelles fonctionnalités deviennent payantes est une décision
// produit, pas une décision technique — ce composant est prêt à être posé
// sur n'importe quelle page le moment venu.
export function RequirePlan({ minPlan, children, fallback }: Props) {
  const { user } = useAuth();
  const { loading, hasAtLeast } = useSubscription(user?.id ?? null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-4 border-or border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAtLeast(minPlan)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="rounded-lg p-6 text-center flex flex-col items-center gap-3" style={{ background: '#111a55', border: '1px solid #2563EB' }}>
        <p className="text-or font-bold">Fonctionnalité réservée au plan {PLAN_LABEL[minPlan]}</p>
        <p className="text-sm" style={{ color: '#b0b8d4' }}>
          Passe au plan {PLAN_LABEL[minPlan]} pour débloquer cette fonctionnalité.
        </p>
        <Link to="/pricing" className="btn-principal rounded inline-block">Voir les plans</Link>
      </div>
    );
  }

  return <>{children}</>;
}
