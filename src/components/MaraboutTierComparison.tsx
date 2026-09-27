import { MARABOUT_TIERS } from '../utils/marabouts';
import { MaraboutPaymentButton } from './MaraboutPaymentButton';

interface Props {
  // Formule déjà active (si le marabout paie déjà) — change le libellé du
  // bouton correspondant en "Renouveler" au lieu de "Payer" et met en
  // évidence la colonne courante. Absent lors du tout premier paiement
  // (MaraboutInscriptionPage).
  currentTier?: 'standard' | 'vip';
}

// Tableau comparatif Standard/VIP, réutilisé tel quel par
// MaraboutInscriptionPage (premier paiement) et MaraboutDashboardPage
// (renouvellement/changement de formule) — une seule source de markup au
// lieu de dupliquer le bloc comme LandingPage/CreditsPage l'avaient fait
// par le passé pour la grille de packs de crédits.
export function MaraboutTierComparison({ currentTier }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {MARABOUT_TIERS.map((tier) => {
        const isVip = tier.id === 'vip';
        const isCurrent = tier.id === currentTier;
        return (
          <div
            key={tier.id}
            className="rounded-lg p-6 flex flex-col"
            style={{
              background: '#0d1545',
              border: isVip ? '1px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
            }}
          >
            <div className="text-center">
              {isVip && (
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-2"
                  style={{ background: '#f5c842', color: '#0a0f2e' }}
                >
                  RECOMMANDÉ
                </span>
              )}
              <p className="text-or font-bold">{tier.label}</p>
              <p className="text-or font-bold text-[2rem] mt-1">
                {tier.priceFcfa.toLocaleString('fr-FR')} FCFA
              </p>
              <p className="text-sm" style={{ color: '#a0aec0' }}>par an</p>
            </div>

            <div className="flex flex-col gap-2 mt-5 text-left flex-1">
              {tier.features.map((f) => (
                <p key={f} className="text-white text-sm">✅ {f}</p>
              ))}
            </div>

            {isCurrent && (
              <span
                className="inline-block mt-4 mx-auto px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: '#1b3a1f', color: '#4caf50' }}
              >
                Formule actuelle
              </span>
            )}

            <MaraboutPaymentButton
              tier={tier.id}
              label={isCurrent ? `Renouveler ${tier.label}` : `Payer ${tier.priceFcfa.toLocaleString('fr-FR')} FCFA`}
              className="rounded font-bold py-3 px-6 mt-5"
              style={{ background: isVip ? '#f5c842' : 'transparent', color: isVip ? '#0a0f2e' : '#f5c842', border: isVip ? 'none' : '1px solid #f5c842' }}
            />
          </div>
        );
      })}
    </div>
  );
}
