import { useState } from 'react';
import { Link } from 'react-router-dom';
import { initiateSubscriptionCheckout } from '../lib/payments/fedapaySubscriptionCheckout';
import { ChariowContactModal, type ChariowContactFields } from './ChariowContactModal';
import type { PlanId } from '../hooks/useSubscription';
import { WHATSAPP_NUMBER } from '../utils/mystique';

const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

interface Props {
  planId: PlanId;
  planName: string;
  userId: string | null;
  className?: string;
  children?: React.ReactNode;
}

// Bouton "S'abonner" partagé entre PricingPage et BillingPage. FedaPay est
// le seul moyen de paiement réel branché pour ce domaine (Free/Premium/Pro)
// — Chariow a été réorienté vers les packs de crédits le 2026-08-10 et n'a
// jamais été rebranché ici, donc pas de repli à faire, juste l'appel
// direct à fedapaySubscriptionCheckout.ts (même modale de contact que
// CreditsPage/MaraboutPaymentButton). Si l'appel échoue, WhatsApp reste
// affiché comme solution de repli manuelle.
export function SubscribeButton({ planId, planName, userId, className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleConfirm(fields: ChariowContactFields) {
    setNotice(null);
    setLoading(true);
    const result = await initiateSubscriptionCheckout({ planId, ...fields });
    setLoading(false);

    if (result.status === 'redirect') {
      window.location.href = result.redirectUrl;
      return;
    }
    setShowContactForm(false);
    setNotice(result.message);
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
      <button onClick={() => setShowContactForm(true)} disabled={loading} className={className}>
        {loading ? 'Chargement...' : (children ?? `S'abonner à ${planName}`)}
      </button>

      {showContactForm && (
        <ChariowContactModal
          loading={loading}
          errorMessage={null}
          onSubmit={handleConfirm}
          onCancel={() => setShowContactForm(false)}
        />
      )}

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
