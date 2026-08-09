import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paymentProvider } from '../lib/payments';
import type { PlanId } from '../hooks/useSubscription';
import { WHATSAPP_NUMBER } from '../utils/mystique';

const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

// Chariow exige un indicatif pays séparé du numéro (voir
// chariow-initiate-checkout). Confirmé en live le 2026-08-09 : le code
// appelant nu ("225") est rejeté ("country not found"), le code ISO
// alpha-2 ("CI") est accepté. Pays couverts : ceux où Secret Divin a de
// l'usage réel (FCFA/zone francophone).
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
// en base directement. Le fournisseur actif (Chariow, voir
// src/lib/payments/index.ts) exige prénom/nom/téléphone au checkout, pas
// forcément déjà présents sur le profil permanent — collectés ici via un
// petit formulaire juste avant le paiement plutôt que d'aller les chercher
// dans `profiles` ou d'obliger l'utilisateur à éditer son profil d'abord.
export function SubscribeButton({ planId, planName, userId, userEmail, className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState(COUNTRY_CODES[0].code);
  const [phoneNumber, setPhoneNumber] = useState('');

  async function handleConfirm() {
    if (!userId) return;
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setFormError('Merci de remplir prénom, nom et téléphone.');
      return;
    }
    setFormError(null);

    setLoading(true);
    const result = await paymentProvider.initiateSubscription({
      planId,
      userId,
      userEmail: userEmail ?? '',
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber: phoneNumber.trim(),
      phoneCountryCode,
    });
    setLoading(false);

    if (result.status === 'redirect' && result.redirectUrl) {
      window.location.href = result.redirectUrl;
      return;
    }

    setShowContactForm(false);
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
      <button onClick={() => setShowContactForm(true)} disabled={loading} className={className}>
        {loading ? 'Chargement...' : (children ?? `S'abonner à ${planName}`)}
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

            {formError && <p className="text-red-400 text-sm mt-3">{formError}</p>}

            <div className="flex flex-col md:flex-row gap-3 mt-5">
              <button onClick={handleConfirm} disabled={loading} className="btn-principal rounded w-full md:flex-1 disabled:opacity-50">
                {loading ? 'Chargement...' : 'Continuer vers le paiement'}
              </button>
              <button onClick={() => setShowContactForm(false)} disabled={loading} className="btn-secondaire rounded w-full md:flex-1">Annuler</button>
            </div>
          </div>
        </div>
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
