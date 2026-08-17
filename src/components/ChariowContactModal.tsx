import { useState } from 'react';
import { getCountries, getCountryCallingCode, isPossiblePhoneNumber, type CountryCode } from 'libphonenumber-js/min';
import countries from 'i18n-iso-countries';
import frLocale from 'i18n-iso-countries/langs/fr.json';

countries.registerLocale(frLocale);

// Drapeau à partir du code ISO alpha-2 : chaque lettre convertie en son
// "regional indicator symbol" Unicode (A -> U+1F1E6, etc.) — technique
// standard, fonctionne pour les ~243 codes à 2 lettres renvoyés par
// getCountries(). Rendu dépend de la police système (Windows n'affiche
// historiquement pas ces emojis nativement dans un <select>) — le nom du
// pays reste disponible au survol via l'attribut title de <option>.
function flagEmoji(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

// Chariow exige un indicatif pays séparé du numéro (confirmé en live le
// 2026-08-09) : le code appelant nu ("225") est rejeté, le code ISO
// alpha-2 ("CI") est accepté — mais chariow-initiate-checkout ne valide
// ce code contre AUCUNE liste blanche côté serveur (voir
// supabase/functions/chariow-initiate-checkout/index.ts), donc élargir
// cette liste ici n'a besoin d'aucun changement backend. Construite
// depuis libphonenumber-js (indicatifs + validation, ~245 pays/
// territoires) et i18n-iso-countries (noms en français, utilisé pour le
// tri et le survol uniquement — remplacé par le drapeau dans le libellé
// affiché) plutôt que recréée à la main — remplace l'ancienne liste
// codée en dur limitée à 9 pays francophones d'Afrique. Un pays sans nom
// français dans i18n-iso-countries (2 micro-territoires, AC/TA) est
// simplement omis.
const COUNTRY_CODES: { code: CountryCode; name: string; label: string }[] = getCountries()
  .flatMap((code) => {
    const name = countries.getName(code, 'fr');
    if (!name) return [];
    return [{ code, name, label: `${flagEmoji(code)} (+${getCountryCallingCode(code)})` }];
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// Guinée reste le pays présélectionné par défaut (usage historique
// principal de Secret Divin), mais n'importe quel pays du monde reste
// choisissable.
const DEFAULT_COUNTRY: CountryCode = 'GN';

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
  const [phoneCountryCode, setPhoneCountryCode] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function handleConfirm() {
    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setFormError('Merci de remplir prénom, nom et téléphone.');
      return;
    }
    // isPossiblePhoneNumber (longueur plausible pour l'indicatif choisi)
    // plutôt que isValidPhoneNumber (beaucoup plus strict) — évite de
    // rejeter un numéro déjà accepté par Chariow aujourd'hui pour un
    // client existant (Guinée/Afrique) simplement parce qu'il ne colle
    // pas exactement aux plans de numérotation stricts de libphonenumber.
    if (!isPossiblePhoneNumber(phoneNumber.trim(), phoneCountryCode)) {
      setFormError('Numéro de téléphone invalide pour le pays sélectionné.');
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
              <select value={phoneCountryCode} onChange={(e) => setPhoneCountryCode(e.target.value as CountryCode)} className={INPUT_CLASS} style={{ flex: '0 0 40%' }}>
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code} title={c.name}>{c.label}</option>
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
