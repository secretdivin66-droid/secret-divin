import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCreditPacks, type CreditPack } from '../hooks/useCreditPacks';
import { initiateCreditPackCheckout } from '../lib/payments/chariowCreditsCheckout';
import { useCanonicalUrl } from '../hooks/useCanonicalUrl';

// Chariow exige un indicatif pays séparé du numéro (voir
// chariow-initiate-checkout) — confirmé en live le 2026-08-09 : le code
// appelant nu ("225") est rejeté, le code ISO alpha-2 ("CI") est accepté.
// Pays couverts : ceux où Secret Divin a de l'usage réel (FCFA/zone
// francophone).
const COUNTRY_CODES = [
  { code: 'CI', label: "Côte d'Ivoire (+225)" },
  { code: 'SN', label: 'Sénégal (+221)' },
  { code: 'BF', label: 'Burkina Faso (+226)' },
  { code: 'ML', label: 'Mali (+223)' },
  { code: 'BJ', label: 'Bénin (+229)' },
  { code: 'TG', label: 'Togo (+228)' },
  { code: 'GN', label: 'Guinée (+224)' },
  { code: 'CM', label: 'Cameroun (+237)' },
  { code: 'GA', label: 'Gabon (+241)' },
];

const INPUT_CLASS = 'w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or';

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState(COUNTRY_CODES[0].code);
  const [phoneNumber, setPhoneNumber] = useState('');

  const ctaLabel = pack.credits ? `Recharger ${pack.credits} crédits` : "Activer l'accès illimité";

  async function handleConfirm() {
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setErrorMessage('Merci de remplir prénom, nom et téléphone.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    const result = await initiateCreditPackCheckout({
      packId: pack.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: phoneNumber.trim(),
      phoneCountryCode,
    });
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
        onClick={() => setShowContactForm(true)}
        disabled={loading}
        className="w-full rounded font-bold py-3"
        style={{ background: '#f5c842', color: '#0a0f2e' }}
      >
        {loading ? 'Chargement...' : ctaLabel}
      </button>

      {showContactForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => !loading && setShowContactForm(false)}
        >
          <div
            className="carte rounded-lg"
            style={{ maxWidth: 420, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold mb-1">Tes infos pour le paiement</h3>
            <p className="text-sm mb-4" style={{ color: '#a0aec0' }}>Requises par notre prestataire de paiement pour confirmer ta transaction.</p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Prénom</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Nom</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: '#a0aec0' }}>Téléphone</label>
                <div className="flex gap-2">
                  <select value={phoneCountryCode} onChange={(e) => setPhoneCountryCode(e.target.value)} className={INPUT_CLASS} style={{ flex: '0 0 40%' }}>
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="00 00 00 00" className={INPUT_CLASS} style={{ flex: 1 }} />
                </div>
              </div>
            </div>

            {errorMessage && <p className="text-red-400 text-sm mt-3">{errorMessage}</p>}

            <div className="flex flex-col md:flex-row gap-3 mt-5">
              <button onClick={handleConfirm} disabled={loading} className="btn-principal rounded w-full md:flex-1 disabled:opacity-50">
                {loading ? 'Chargement...' : 'Continuer vers le paiement'}
              </button>
              <button onClick={() => setShowContactForm(false)} disabled={loading} className="btn-secondaire rounded w-full md:flex-1">Annuler</button>
            </div>
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
