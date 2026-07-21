import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCredits } from '../hooks/useCredits';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabaseClient';
import { RequirePlan } from '../components/RequirePlan';

interface BillingEvent {
  id: string;
  plan_id: string | null;
  amount: number | null;
  status: string | null;
  description: string | null;
  created_at: string;
}

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
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const STATUS_LABEL: Record<string, string> = {
  succeeded: 'Réussi',
  pending: 'En attente',
  failed: 'Échoué',
  cancelled: 'Annulé',
};

export function BillingPage() {
  const { user } = useAuth();
  const { credits } = useCredits(user?.id ?? null);
  const { loading, planId, plan, expiresAt, cancelSubscription } = useSubscription(user?.id ?? null);

  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('billing_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setEvents(data ?? []));
  }, [user]);

  async function handleCancel() {
    setCancelling(true);
    const ok = await cancelSubscription();
    setCancelling(false);
    setShowCancelModal(false);
    setMessage(ok ? 'Ton abonnement a été annulé. Tu es repassé au plan Free.' : "Erreur lors de l'annulation. Réessaie dans quelques instants.");
    setTimeout(() => setMessage(null), 4000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-or border-t-transparent rounded-full animate-spin" />
          <p className="text-or">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-[800px] mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Facturation</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Gère ton abonnement et consulte ton historique
        </p>

        <Separateur />

        {message && (
          <div className="rounded-lg p-3 mb-4 text-center" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
            <p className="text-green-400 text-sm">{message}</p>
          </div>
        )}

        {/* Plan actuel */}
        <div className="carte rounded-lg text-center">
          <p className="text-sm" style={{ color: '#a0aec0' }}>Plan actuel</p>
          <p className="text-or font-bold text-[2rem] mt-1">{plan?.name ?? 'Free'}</p>
          {expiresAt && (
            <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>Renouvellement le {formatDate(expiresAt)}</p>
          )}
          <p className="text-white mt-3">
            {credits.isUnlimited ? 'Accès illimité à tous les outils' : `${credits.balance} crédits disponibles`}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
            <Link to="/pricing" className="btn-secondaire rounded px-4 py-2">Changer de plan</Link>
            {planId !== 'free' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="rounded px-4 py-2 font-bold"
                style={{ border: '1px solid #e53935', color: '#e53935', background: 'transparent' }}
              >
                Annuler mon abonnement
              </button>
            )}
          </div>
        </div>

        <Separateur />

        {/* Avantage Pro — démonstration concrète de RequirePlan, sans
            restreindre l'accès à un outil existant */}
        <RequirePlan
          minPlan="pro"
          fallback={
            <div className="rounded-lg p-5 text-center" style={{ background: '#0d1545', border: '1px solid rgba(245,200,66,0.2)' }}>
              <p className="text-white">
                Le plan Pro débloque un support prioritaire dédié et un accès illimité à tous les outils.
              </p>
              <Link to="/pricing" className="btn-principal rounded mt-4 inline-block">Découvrir le plan Pro</Link>
            </div>
          }
        >
          <div className="rounded-lg p-5 text-center" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
            <p className="text-or font-bold">Avantage Pro actif</p>
            <p className="text-white mt-2">Support prioritaire par WhatsApp et accès illimité débloqués.</p>
          </div>
        </RequirePlan>

        <Separateur />

        {/* Historique de facturation */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Historique de Facturation</h2>
        {events.length === 0 ? (
          <p className="text-center" style={{ color: '#a0aec0' }}>Aucun événement de facturation pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="carte rounded-lg min-w-[500px]">
              <div className="grid grid-cols-4 gap-3 pb-3 font-bold text-sm" style={{ color: '#a0aec0', borderBottom: '1px solid rgba(245,200,66,0.2)' }}>
                <span>Date</span>
                <span>Description</span>
                <span className="text-right">Montant</span>
                <span className="text-right">Statut</span>
              </div>
              {events.map((event) => (
                <div key={event.id} className="grid grid-cols-4 gap-3 py-3 text-sm" style={{ borderBottom: '1px solid rgba(245,200,66,0.1)' }}>
                  <span style={{ color: '#a0aec0' }}>{formatDate(event.created_at)}</span>
                  <span className="text-white">{event.description ?? '—'}</span>
                  <span className="text-right text-white">
                    {event.amount != null ? `${event.amount.toLocaleString('fr-FR')} FCFA` : '—'}
                  </span>
                  <span className="text-right" style={{ color: event.status === 'succeeded' ? '#4caf50' : '#a0aec0' }}>
                    {event.status ? STATUS_LABEL[event.status] ?? event.status : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCancelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#0d1545', border: '1px solid #f5c842', borderRadius: '8px', padding: '28px', maxWidth: '400px', width: '100%' }} className="text-center">
            <p className="text-white mb-5">
              Es-tu sûr de vouloir annuler ton abonnement {plan?.name} ? Tu repasseras immédiatement au plan Free.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded py-2 font-bold disabled:opacity-50"
                style={{ background: '#e53935', color: 'white' }}
              >
                {cancelling ? 'Annulation...' : 'Confirmer'}
              </button>
              <button onClick={() => setShowCancelModal(false)} className="btn-secondaire rounded">Retour</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
