import { LegalLayout } from '../components/LegalLayout';
import { COMPANY } from '../utils/legalInfo';

export function MentionsLegalesPage() {
  return (
    <LegalLayout
      title="Mentions Légales"
      showUpdatedDate={false}
      sections={[
        {
          heading: '1. ÉDITEUR DU SITE',
          content: (
            <div className="flex flex-col gap-1">
              <p>Nom commercial enregistré : {COMPANY.nomCommercial}</p>
              <p>Marque affichée : {COMPANY.marque}</p>
              <p>Forme juridique : {COMPANY.formeJuridique}</p>
              <p>Pays d'immatriculation : {COMPANY.pays}</p>
              <p>Numéro RCCM : {COMPANY.rccm}</p>
              <p>Adresse : {COMPANY.adresse}</p>
              <p>Email : {COMPANY.email}</p>
              <p>Téléphone/WhatsApp : {COMPANY.telephone}</p>
            </div>
          ),
        },
        {
          heading: '2. RESPONSABLE DE PUBLICATION',
          content: (
            <p>
              Le responsable de la publication du site est le représentant légal de l'entreprise individuelle
              {' '}{COMPANY.nomCommercial}.
            </p>
          ),
        },
        {
          heading: '3. HÉBERGEMENT',
          content: (
            <div className="flex flex-col gap-4">
              <div>
                <p>Le site est hébergé par :</p>
                <p>{COMPANY.hebergeur.nom}</p>
                <p>{COMPANY.hebergeur.adresse}</p>
                <p>{COMPANY.hebergeur.url}</p>
              </div>
              <div>
                <p>Base de données hébergée par :</p>
                <p>{COMPANY.baseDeDonnees.nom}</p>
                <p>{COMPANY.baseDeDonnees.adresse}</p>
                <p>{COMPANY.baseDeDonnees.url}</p>
              </div>
            </div>
          ),
        },
        {
          heading: '4. PROPRIÉTÉ INTELLECTUELLE',
          content: (
            <p>
              L'ensemble des éléments du site Secret Divin (textes, logo, charte graphique, structure) est protégé
              par le droit d'auteur. Toute reproduction, même partielle, est interdite sans autorisation écrite
              préalable de {COMPANY.nomCommercial}.
            </p>
          ),
        },
        {
          heading: '5. LIENS EXTERNES',
          content: (
            <p>
              Le site contient des liens vers des plateformes tierces (WhatsApp, Wikipedia, CinetPay). Secret Divin
              n'est pas responsable du contenu de ces sites externes.
            </p>
          ),
        },
        {
          heading: '6. LIMITATION DE RESPONSABILITÉ',
          content: (
            <p>
              Secret Divin s'efforce d'assurer l'exactitude des informations diffusées sur le site, mais ne peut être
              tenu responsable des erreurs ou omissions, d'une absence de disponibilité des informations, ou de la
              présence de virus sur son site.
            </p>
          ),
        },
        {
          heading: '7. CONTACT',
          content: (
            <div className="flex flex-col gap-1">
              <p>{COMPANY.nomCommercial} — {COMPANY.formeJuridique}</p>
              <p>RCCM : {COMPANY.rccm}</p>
              <p>{COMPANY.adresse}</p>
              <p>Email : {COMPANY.email}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
