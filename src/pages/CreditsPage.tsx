import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCreditPacks, type CreditPack } from '../hooks/useCreditPacks';
import { initiateCreditPackCheckout as initiateChariowCheckout } from '../lib/payments/chariowCreditsCheckout';
import { initiateCreditPackCheckout as initiateFedaPayCheckout } from '../lib/payments/fedapayCreditsCheckout';
import { ChariowContactModal, type ChariowContactFields } from '../components/ChariowContactModal';

// Repli silencieux vers FedaPay uniquement quand Chariow n'est structurellement
// pas en mesure de traiter ce pack (pas configuré côté Chariow, ou réponse
// inattendue) — jamais sur une erreur utilisateur (infos de contact
// manquantes, profil incomplet) qui échouerait de la même façon sur les deux
// prestataires. Chariow n'a jamais produit de checkoutUrl dans ces cas, donc
// aucun risque de double paiement en retentant via FedaPay.
const CHARIOW_FALLBACK_ERROR_CODES = new Set(['pack_not_configured_for_chariow', 'unexpected_response']);
import { useCanonicalUrl } from '../hooks/useCanonicalUrl';

// Suspension temporaire des 5 packs crédits (Gemini API prod pas encore
// configuré) — ne concerne QUE cette page, pas l'Abonnement Marabout ni
// les abonnements Plans. Fail-safe volontairement : seule la valeur
// exacte "true" active, absent/"false"/mal défini désactive par défaut
// (même raisonnement que côté backend, voir chariow-initiate-checkout/
// fedapay-initiate-checkout).
const CREDIT_PACKS_ENABLED = import.meta.env.VITE_CREDIT_PACKS_ENABLED === 'true';
const CREDIT_PACKS_DISABLED_MESSAGE = 'Rechargement temporairement indisponible — Nous améliorons notre système. Merci de réessayer dans quelques instants 🙏';

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

function PackCard({ pack }: { pack: CreditPack }) {
  const badge = pack.credits ? `${pack.credits} crédits` : '∞ crédits illimités';
  const price = `${pack.price.toLocaleString('fr-FR')} FCFA${pack.period ? `/${pack.period}` : ''}`;

  return (
    <div
      className="rounded-lg p-6 flex flex-col items-center text-center"
      style={{
        background: '#0d1545',
        border: pack.popular ? '2px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
      }}
    >
      {pack.popular && (
        <span
          className="self-center px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ background: '#f5c842', color: '#0a0f2e' }}
        >
          POPULAIRE
        </span>
      )}
      <h3 className="text-white font-bold text-lg">{pack.name}</h3>
      <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>{pack.subtitle}</p>
      <p className="text-or font-bold text-[1.6rem] mt-4">{price}</p>
      <span
        className="mt-3 px-4 py-1 rounded-full text-sm font-bold"
        style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid #f5c842', color: '#f5c842' }}
      >
        {badge}
      </span>
      {pack.credits && (
        <p className="text-xs mt-1" style={{ color: '#a0aec0' }}>Valable 30 jours</p>
      )}
      <BuyButton pack={pack} />
    </div>
  );
}

function BuyButton({ pack }: { pack: CreditPack }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ctaLabel = pack.credits ? `Recharger ${pack.credits} crédits` : "Activer l'accès illimité";

  function handleClick() {
    if (!CREDIT_PACKS_ENABLED) {
      setErrorMessage(CREDIT_PACKS_DISABLED_MESSAGE);
      return;
    }
    setShowContactForm(true);
  }

  async function handleConfirm(fields: ChariowContactFields) {
    setErrorMessage(null);
    setLoading(true);
    let result = await initiateChariowCheckout({ packId: pack.id, ...fields });

    if (result.status === 'error' && result.errorCode && CHARIOW_FALLBACK_ERROR_CODES.has(result.errorCode)) {
      result = await initiateFedaPayCheckout({ packId: pack.id, ...fields });
    }

    setLoading(false);

    if (result.status === 'redirect') {
      window.location.href = result.redirectUrl;
      return;
    }
    setErrorMessage(result.message);
  }

  if (!user) {
    return (
      <Link to="/auth" className="w-full mt-5 rounded font-bold py-3 inline-block" style={{ background: '#f5c842', color: '#0a0f2e' }}>
        {ctaLabel}
      </Link>
    );
  }

  return (
    <div className="w-full mt-5">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded font-bold py-3"
        style={{ background: '#f5c842', color: '#0a0f2e' }}
      >
        {loading ? 'Chargement...' : ctaLabel}
      </button>

      {showContactForm && (
        <ChariowContactModal
          loading={loading}
          errorMessage={errorMessage}
          onSubmit={handleConfirm}
          onCancel={() => setShowContactForm(false)}
        />
      )}

      {!CREDIT_PACKS_ENABLED && errorMessage && !showContactForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => setErrorMessage(null)}
        >
          <div
            className="carte rounded-lg text-center"
            style={{ maxWidth: 400, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white mb-5">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="btn-principal rounded w-full">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CreditsPage() {
  useCanonicalUrl('/credits');
  const { packs, loading } = useCreditPacks();
  const gridPacks = packs.filter((p) => p.id !== 'unlimited');
  const unlimitedPack = packs.find((p) => p.id === 'unlimited');

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <h1 className="text-center font-bold text-or text-[2rem]">Des crédits flexibles, valables 1 mois</h1>
        <p className="text-center mt-3 text-white">
          Paye une fois, utilise pendant 30 jours — aucun engagement, aucun renouvellement automatique.
        </p>

        <Separateur />

        <h2 className="text-center text-or font-bold text-xl mb-6">Choisis ton pack ✦</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-or border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* GRILLE 2x2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {gridPacks.map((pack) => (
                <PackCard key={pack.id} pack={pack} />
              ))}
            </div>

            {/* CARTE CENTRÉE — ILLIMITÉ */}
            {unlimitedPack && (
              <div className="max-w-md mx-auto mt-5">
                <PackCard pack={unlimitedPack} />
              </div>
            )}
          </>
        )}

        <p className="text-center text-sm mt-6" style={{ color: '#a0aec0' }}>
          Paiement unique. Crédits valables 1 mois à compter de l'achat. Aucune carte enregistrée, aucun renouvellement automatique.
        </p>
      </div>
    </div>
  );
}
