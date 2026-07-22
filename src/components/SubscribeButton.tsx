import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paymentProvider } from '../lib/payments';
import type { PlanId } from '../hooks/useSubscription';
import { WHATSAPP_NUMBER } from '../utils/mystique';

const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

interface Props {
  planId: PlanId;
  planName: string;
  userId: string | null;
  userEmail: string | null;
  className?: string;
  children?: React.ReactNode;
}

// Bouton "S'abonner" partagé entre PricingPage et BillingPage : appelle la
// couche d'abstraction de paiement (src/lib/payments) plutôt que d'écrire
// en base directement. Tant qu'aucun fournisseur réel n'est branché,
// paymentProvider.initiateSubscription() renvoie toujours 'unavailable' et
// ce composant se contente d'afficher le message — aucune ligne n'est
// créée dans subscriptions/billing_events pour un paiement qui n'a jamais
// eu lieu.
export function SubscribeButton({ planId, planName, userId, userEmail, className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClick() {
    if (!userId) return;

    setLoading(true);
    const result = await paymentProvider.initiateSubscription({ planId, userId, userEmail: userEmail ?? '' });
    setLoading(false);

    if (result.status === 'redirect' && result.redirectUrl) {
      window.location.href = result.redirectUrl;
      return;
    }

    setNotice(result.message ?? 'Le paiement en ligne arrive bientôt.');
  }

  if (!userId) {
    return (
      <Link to="/auth" className={className}>
        {children ?? `S'abonner à ${planName}`}
      </Link>
    );
  }

  return (
    <>
      <button onClick={handleClick} disabled={loading} className={className}>
        {loading ? 'Chargement...' : (children ?? `S'abonner à ${planName}`)}
      </button>

      {notice && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => setNotice(null)}
        >
          <div
            className="carte rounded-lg text-center"
            style={{ maxWidth: 400, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white mb-5">{notice}</p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-principal rounded w-full inline-block mb-3"
            >
              Écrire sur WhatsApp
            </a>
            <button onClick={() => setNotice(null)} className="btn-secondaire rounded w-full">Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
