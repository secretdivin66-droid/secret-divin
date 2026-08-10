import { useState } from 'react';

// Chariow exige un indicatif pays séparé du numéro (confirmé en live le
// 2026-08-09) : le code appelant nu ("225") est rejeté, le code ISO
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

export interface ChariowContactFields {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

interface Props {
  loading: boolean;
  errorMessage: string | null;
  onSubmit: (fields: ChariowContactFields) => void;
  onCancel: () => void;
}

// Petit formulaire (prénom/nom/téléphone+pays) requis par Chariow au
// checkout — partagé entre les packs de crédits et l'abonnement marabout
// (2 usages identiques avant extraction, voir CreditsPage.tsx/
// MaraboutInscriptionPage.tsx/MaraboutDashboardPage.tsx).
export function ChariowContactModal({ loading, errorMessage, onSubmit, onCancel }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState(COUNTRY_CODES[0].code);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function handleConfirm() {
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setFormError('Merci de remplir prénom, nom et téléphone.');
      return;
    }
    setFormError(null);
    onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), phoneNumber: phoneNumber.trim(), phoneCountryCode });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={() => !loading && onCancel()}
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

        {(formError || errorMessage) && <p className="text-red-400 text-sm mt-3">{formError ?? errorMessage}</p>}

        <div className="flex flex-col md:flex-row gap-3 mt-5">
          <button onClick={handleConfirm} disabled={loading} className="btn-principal rounded w-full md:flex-1 disabled:opacity-50">
            {loading ? 'Chargement...' : 'Continuer vers le paiement'}
          </button>
          <button onClick={onCancel} disabled={loading} className="btn-secondaire rounded w-full md:flex-1">Annuler</button>
        </div>
      </div>
    </div>
  );
}
