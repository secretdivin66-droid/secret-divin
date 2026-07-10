import { LegalLayout } from '../components/LegalLayout';
import { COMPANY } from '../utils/legalInfo';

export function ConditionsPage() {
  return (
    <LegalLayout
      title="Conditions Générales d'Utilisation"
      sections={[
        {
          heading: '1. OBJET',
          content: (
            <p>
              Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la
              plateforme Secret Divin, éditée par {COMPANY.nomCommercial}, entreprise individuelle immatriculée en
              {' '}{COMPANY.pays} sous le numéro RCCM {COMPANY.rccm}. En créant un compte, tu acceptes ces conditions
              dans leur intégralité.
            </p>
          ),
        },
        {
          heading: '2. DESCRIPTION DU SERVICE',
          content: (
            <div className="flex flex-col gap-2">
              <p>
                Secret Divin est une plateforme de consultation spirituelle et mystique islamique ouest-africaine
                proposant :
              </p>
              <ul className="list-disc list-inside">
                <li>Calcul du poids mystique (gratuit)</li>
                <li>Génération de carrés magiques</li>
                <li>Consultations de destin, géomancie, interprétation de rêves</li>
                <li>Talismans et rituels personnalisés</li>
                <li>Contenu éducatif (tutoriels et formation)</li>
                <li>Mise en relation avec des marabouts professionnels indépendants</li>
              </ul>
            </div>
          ),
        },
        {
          heading: '3. NATURE DU SERVICE',
          content: (
            <p>
              Les consultations proposées relèvent de la tradition spirituelle et mystique islamique ouest-africaine.
              Elles sont fournies à titre informatif et culturel. Secret Divin ne garantit aucun résultat concret dans
              la vie de l'utilisateur. Les consultations ne remplacent en aucun cas un avis médical, juridique, ou
              psychologique professionnel.
            </p>
          ),
        },
        {
          heading: '4. INSCRIPTION ET COMPTE',
          content: (
            <p>
              Pour utiliser les outils payants, tu dois créer un compte avec une adresse email valide. Tu es
              responsable de la confidentialité de tes identifiants de connexion. Un compte est strictement personnel
              et non transférable.
            </p>
          ),
        },
        {
          heading: '5. SYSTÈME DE CRÉDITS',
          content: (
            <ul className="list-disc list-inside">
              <li>Le calcul du poids mystique et les tutoriels sont gratuits et illimités</li>
              <li>Toutes les autres consultations coûtent 2 crédits par génération</li>
              <li>Les crédits achetés n'expirent jamais</li>
              <li>Les crédits ne sont pas remboursables une fois utilisés (voir Politique de Remboursement)</li>
              <li>
                Les prix sont indiqués en Francs CFA (FCFA) et peuvent être modifiés à tout moment sans préavis pour
                les futurs achats
              </li>
            </ul>
          ),
        },
        {
          heading: '6. PAIEMENT',
          content: (
            <p>
              Le paiement s'effectue via Mobile Money (Orange Money, Wave, Moov Money, MTN) ou carte bancaire via
              notre partenaire de paiement CinetPay, ou manuellement via WhatsApp le temps de l'intégration complète
              du paiement automatique. Les crédits sont activés après confirmation du paiement.
            </p>
          ),
        },
        {
          heading: '7. OBLIGATIONS DE L\'UTILISATEUR',
          content: (
            <div className="flex flex-col gap-2">
              <p>Tu t'engages à :</p>
              <ul className="list-disc list-inside">
                <li>Fournir des informations exactes</li>
                <li>Ne pas utiliser la plateforme à des fins illégales ou frauduleuses</li>
                <li>Ne pas tenter de contourner le système de crédits</li>
                <li>Ne pas copier, revendre ou redistribuer le contenu généré sans autorisation</li>
                <li>Respecter les autres utilisateurs et les marabouts inscrits sur la plateforme</li>
              </ul>
            </div>
          ),
        },
        {
          heading: '8. MARKETPLACE MARABOUTS',
          content: (
            <div className="flex flex-col gap-3">
              <p>
                Secret Divin met en relation les utilisateurs avec des marabouts professionnels indépendants inscrits
                volontairement sur la plateforme moyennant un abonnement mensuel. Secret Divin :
              </p>
              <ul className="list-disc list-inside">
                <li>Ne garantit pas la compétence, l'éthique ou les résultats des services fournis par les marabouts référencés</li>
                <li>N'est pas partie prenante dans la transaction financière entre l'utilisateur et le marabout</li>
                <li>N'est pas responsable des litiges entre un utilisateur et un marabout</li>
                <li>Se réserve le droit de retirer tout profil marabout ne respectant pas la charte d'utilisation</li>
              </ul>
              <p>
                Tout utilisateur contactant un marabout via la plateforme le fait sous sa responsabilité personnelle.
              </p>
            </div>
          ),
        },
        {
          heading: '9. PROPRIÉTÉ INTELLECTUELLE',
          content: (
            <p>
              L'ensemble du contenu de la plateforme (design, logo, textes, structure) est la propriété de
              {' '}{COMPANY.nomCommercial}. Le contenu généré pour ta consultation personnelle t'est fourni pour un
              usage personnel uniquement.
            </p>
          ),
        },
        {
          heading: '10. LIMITATION DE RESPONSABILITÉ',
          content: (
            <div className="flex flex-col gap-2">
              <p>Secret Divin ne peut être tenu responsable :</p>
              <ul className="list-disc list-inside">
                <li>Des décisions prises par l'utilisateur sur la base des consultations</li>
                <li>D'une interruption temporaire du service (maintenance, panne technique)</li>
                <li>De l'usage fait par l'utilisateur des informations obtenues via la plateforme</li>
                <li>Des services rendus par les marabouts référencés</li>
              </ul>
            </div>
          ),
        },
        {
          heading: '11. SUSPENSION ET RÉSILIATION',
          content: (
            <div className="flex flex-col gap-3">
              <p>
                Secret Divin se réserve le droit de suspendre ou supprimer un compte en cas de non-respect de ces
                CGU, sans remboursement des crédits restants dans ce cas.
              </p>
              <p>Tu peux supprimer ton compte à tout moment depuis la page /profil.</p>
            </div>
          ),
        },
        {
          heading: '12. MODIFICATION DES CGU',
          content: (
            <p>
              Ces conditions peuvent être modifiées à tout moment. La version en vigueur est celle publiée sur cette
              page à la date de ton utilisation du service.
            </p>
          ),
        },
        {
          heading: '13. DROIT APPLICABLE',
          content: (
            <p>
              Les présentes CGU sont soumises au droit de la République de Guinée. Tout litige sera soumis aux
              tribunaux compétents de Guinée, sauf disposition légale contraire.
            </p>
          ),
        },
        {
          heading: '14. CONTACT',
          content: (
            <div className="flex flex-col gap-1">
              <p>{COMPANY.nomCommercial} — {COMPANY.formeJuridique}</p>
              <p>RCCM : {COMPANY.rccm}</p>
              <p>Email : {COMPANY.email}</p>
              <p>WhatsApp : {COMPANY.telephone}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
