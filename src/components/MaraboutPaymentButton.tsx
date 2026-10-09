import { useState } from 'react';
import { initiateMaraboutSubscriptionCheckout as initiateSaspayCheckout } from '../lib/payments/saspayMaraboutCheckout';
import { initiateMaraboutSubscriptionCheckout as initiateChariowCheckout } from '../lib/payments/chariowMaraboutCheckout';
import { initiateMaraboutSubscriptionCheckout as initiateFedaPayCheckout } from '../lib/payments/fedapayMaraboutCheckout';
import { ChariowContactModal, type ChariowContactFields } from './ChariowContactModal';

interface Props {
  label: string;
  tier: 'standard' | 'vip';
  className?: string;
  style?: React.CSSProperties;
}

// SasPay (2026-10) est le prestataire PRINCIPAL — essayé en silence au
// clic, sans collecter d'infos de contact. Le modal Chariow/FedaPay ne
// s'affiche qu'en repli, et seulement sur une erreur structurelle côté
// SasPay (jamais sur une erreur business qui échouerait identiquement
// partout).
const SASPAY_FALLBACK_ERROR_CODES = new Set(['saspay_unreachable', 'unexpected_response', 'network_error', 'server_misconfigured', 'db_error', 'country_not_supported_by_saspay']);

// Repli silencieux vers FedaPay — même logique que CreditsPage.tsx : ne se
// déclenche que quand Chariow n'est structurellement pas en mesure de
// traiter la requête, jamais sur une erreur utilisateur qui échouerait
// identiquement sur les deux prestataires.
const CHARIOW_FALLBACK_ERROR_CODES = new Set(['not_configured_for_chariow', 'unexpected_response']);

// Bouton de paiement de l'abonnement marabout — partagé entre l'écran de
// confirmation d'inscription (MaraboutInscriptionPage) et les deux
// boutons "payer"/"renouveler" du dashboard (MaraboutDashboardPage),
// 3 usages identiques avant extraction. SasPay en premier (silencieux),
// Chariow puis FedaPay en repli (voir fedapayMaraboutCheckout.ts).
export function MaraboutPaymentButton({ label, tier, className, style }: Props) {
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleButtonClick() {
    setErrorMessage(null);
    setLoading(true);
    const result = await initiateSaspayCheckout({ tier });
    setLoading(false);

    if (result.status === 'redirect') {
      window.location.href = result.redirectUrl;
      return;
    }
    if (result.errorCode && SASPAY_FALLBACK_ERROR_CODES.has(result.errorCode)) {
      setShowContactForm(true);
      return;
    }
    setErrorMessage(result.message);
  }

  async function handleConfirm(fields: ChariowContactFields) {
    setErrorMessage(null);
    setLoading(true);
    let result = await initiateChariowCheckout({ ...fields, tier });

    if (result.status === 'error' && result.errorCode && CHARIOW_FALLBACK_ERROR_CODES.has(result.errorCode)) {
      result = await initiateFedaPayCheckout({ ...fields, tier });
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
        onClick={handleButtonClick}
        disabled={loading}
        className={className ?? 'rounded font-bold py-3 px-6 mt-5'}
        style={style ?? { background: '#f5c842', color: '#0a0f2e' }}
      >
        {loading ? 'Chargement...' : label}
      </button>

      {errorMessage && !showContactForm && (
        <p className="text-sm mt-2" style={{ color: '#ff6b6b' }}>{errorMessage}</p>
      )}

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
