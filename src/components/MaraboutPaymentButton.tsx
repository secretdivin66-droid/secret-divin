import { useState } from 'react';
import { initiateMaraboutSubscriptionCheckout as initiateChariowCheckout } from '../lib/payments/chariowMaraboutCheckout';
import { initiateMaraboutSubscriptionCheckout as initiateFedaPayCheckout } from '../lib/payments/fedapayMaraboutCheckout';
import { ChariowContactModal, type ChariowContactFields } from './ChariowContactModal';

interface Props {
  label: string;
  className?: string;
  style?: React.CSSProperties;
}

// Repli silencieux vers FedaPay — même logique que CreditsPage.tsx : ne se
// déclenche que quand Chariow n'est structurellement pas en mesure de
// traiter la requête, jamais sur une erreur utilisateur qui échouerait
// identiquement sur les deux prestataires.
const CHARIOW_FALLBACK_ERROR_CODES = new Set(['not_configured_for_chariow', 'unexpected_response']);

// Bouton de paiement de l'abonnement marabout — partagé entre l'écran de
// confirmation d'inscription (MaraboutInscriptionPage) et les deux
// boutons "payer"/"renouveler" du dashboard (MaraboutDashboardPage),
// 3 usages identiques avant extraction. Chariow en premier, FedaPay en
// repli silencieux (voir fedapayMaraboutCheckout.ts).
export function MaraboutPaymentButton({ label, className, style }: Props) {
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm(fields: ChariowContactFields) {
    setErrorMessage(null);
    setLoading(true);
    let result = await initiateChariowCheckout(fields);

    if (result.status === 'error' && result.errorCode && CHARIOW_FALLBACK_ERROR_CODES.has(result.errorCode)) {
      result = await initiateFedaPayCheckout(fields);
    }

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
