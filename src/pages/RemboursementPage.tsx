import { LegalLayout } from '../components/LegalLayout';
import { COMPANY } from '../utils/legalInfo';

export function RemboursementPage() {
  return (
    <LegalLayout
      title="Politique de Remboursement"
      sections={[
        {
          heading: '1. PRINCIPE GÉNÉRAL',
          content: (
            <p>
              Les crédits achetés sur Secret Divin ne sont pas remboursables une fois qu'ils ont été utilisés pour
              générer une consultation, car le service (génération de contenu personnalisé) est alors considéré comme
              rendu.
            </p>
          ),
        },
        {
          heading: '2. CAS DE REMBOURSEMENT ACCEPTÉS',
          content: (
            <div className="flex flex-col gap-2">
              <p>Un remboursement ou un recrédit peut être accordé dans les cas suivants :</p>
              <ul className="list-disc list-inside">
                <li>
                  Erreur technique empêchant la génération de la consultation après déduction des crédits (dans ce
                  cas, le système recrédite automatiquement ton compte)
                </li>
                <li>Double facturation lors d'un achat de pack de crédits</li>
                <li>Crédits non reçus dans les 24h suivant la confirmation d'un paiement Mobile Money vérifié</li>
              </ul>
            </div>
          ),
        },
        {
          heading: '3. CAS NON REMBOURSABLES',
          content: (
            <ul className="list-disc list-inside">
              <li>Insatisfaction concernant le contenu d'une consultation déjà générée</li>
              <li>Changement d'avis après achat d'un pack de crédits</li>
              <li>Non-utilisation des crédits achetés</li>
              <li>
                Résultats jugés non conformes aux attentes personnelles (les consultations sont de nature spirituelle
                et informative)
              </li>
            </ul>
          ),
        },
        {
          heading: '4. ABONNEMENT ILLIMITÉ',
          content: (
            <p>
              L'abonnement Illimité est facturé pour une durée d'un mois. Il n'est pas remboursable au prorata en cas
              d'annulation en cours de mois, mais reste actif jusqu'à la date d'expiration initialement prévue.
            </p>
          ),
        },
        {
          heading: '5. ABONNEMENT MARABOUT',
          content: (
            <p>
              L'abonnement mensuel de 5 000 FCFA payé par les marabouts pour être référencés sur la plateforme n'est
              pas remboursable une fois le profil validé et publié, sauf erreur de facturation de notre part.
            </p>
          ),
        },
        {
          heading: '6. PROCÉDURE DE DEMANDE',
          content: (
            <div className="flex flex-col gap-2">
              <p>Pour toute demande de remboursement éligible :</p>
              <ol className="list-decimal list-inside flex flex-col gap-1">
                <li>Contacte-nous sur WhatsApp au {COMPANY.telephone} ou par email à {COMPANY.email}</li>
                <li>Précise ton adresse email de compte, la date de la transaction et le motif</li>
                <li>Nous examinons chaque demande sous 48h ouvrées</li>
                <li>Si acceptée, le remboursement ou recrédit est effectué sous 5 jours ouvrés</li>
              </ol>
            </div>
          ),
        },
        {
          heading: '7. MOYENS DE REMBOURSEMENT',
          content: (
            <div className="flex flex-col gap-2">
              <p>Les remboursements approuvés sont effectués :</p>
              <ul className="list-disc list-inside">
                <li>Par recrédit du compte (cas les plus fréquents)</li>
                <li>Par retour sur le moyen de paiement Mobile Money utilisé, si applicable</li>
              </ul>
            </div>
          ),
        },
        {
          heading: '8. CONTACT',
          content: (
            <div className="flex flex-col gap-1">
              <p>{COMPANY.nomCommercial} — {COMPANY.formeJuridique}</p>
              <p>Email : {COMPANY.email}</p>
              <p>WhatsApp : {COMPANY.telephone}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
