import { useState } from 'react';
import { initiateMaraboutSubscriptionCheckout } from '../lib/payments/chariowMaraboutCheckout';
import { ChariowContactModal, type ChariowContactFields } from './ChariowContactModal';

interface Props {
  label: string;
  className?: string;
  style?: React.CSSProperties;
}

// Bouton de paiement de l'abonnement marabout via Chariow — partagé entre
// l'écran de confirmation d'inscription (MaraboutInscriptionPage) et les
// deux boutons "payer"/"renouveler" du dashboard (MaraboutDashboardPage),
// 3 usages identiques avant extraction.
export function MaraboutPaymentButton({ label, className, style }: Props) {
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm(fields: ChariowContactFields) {
    setErrorMessage(null);
    setLoading(true);
    const result = await initiateMaraboutSubscriptionCheckout(fields);
    setLoading(false);

    if (result.status === 'redirect') {
      window.location.href = result.redirectUrl;
      return;
    }
    setErrorMessage(result.message);
  }

  return (
    <>
      <button
        onClick={() => setShowContactForm(true)}
        disabled={loading}
        className={className ?? 'rounded font-bold py-3 px-6 mt-5'}
        style={style ?? { background: '#f5c842', color: '#0a0f2e' }}
      >
        {loading ? 'Chargement...' : label}
      </button>

      {showContactForm && (
        <ChariowContactModal
          loading={loading}
          errorMessage={errorMessage}
          onSubmit={handleConfirm}
          onCancel={() => setShowContactForm(false)}
        />
      )}
    </>
  );
}
