import { LegalLayout } from '../components/LegalLayout';
import { COMPANY } from '../utils/legalInfo';

export function ConfidentialitePage() {
  return (
    <LegalLayout
      title="Politique de Confidentialité"
      sections={[
        {
          heading: '1. INTRODUCTION',
          content: (
            <p>
              Secret Divin (nom commercial enregistré : {COMPANY.nomCommercial}), entreprise individuelle immatriculée
              en {COMPANY.pays} sous le numéro RCCM {COMPANY.rccm}, s'engage à protéger la vie privée des utilisateurs
              de sa plateforme. Cette politique explique quelles données nous collectons, pourquoi, et comment elles
              sont utilisées et protégées.
            </p>
          ),
        },
        {
          heading: '2. DONNÉES COLLECTÉES',
          content: (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2">Lors de l'inscription :</p>
                <ul className="list-disc list-inside">
                  <li>Adresse email</li>
                  <li>Mot de passe (chiffré, jamais visible)</li>
                </ul>
              </div>
              <div>
                <p className="mb-2">Dans le profil (facultatif) :</p>
                <ul className="list-disc list-inside">
                  <li>Prénom et prénom de la mère</li>
                  <li>Genre</li>
                  <li>Religion</li>
                  <li>Langue préférée</li>
                </ul>
              </div>
              <div>
                <p className="mb-2">Lors de l'utilisation des outils :</p>
                <ul className="list-disc list-inside">
                  <li>Contenu des consultations (destin, rêves, géomancie, etc.) sauvegardé pour ton historique personnel</li>
                  <li>Historique des transactions de crédits</li>
                </ul>
              </div>
              <div>
                <p className="mb-2">Données techniques automatiques :</p>
                <ul className="list-disc list-inside">
                  <li>Adresse IP (via Supabase, pour la sécurité)</li>
                  <li>Type de navigateur</li>
                  <li>Pages visitées (statistiques anonymisées)</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          heading: '3. UTILISATION DES DONNÉES',
          content: (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2">Tes données sont utilisées uniquement pour :</p>
                <ul className="list-disc list-inside">
                  <li>Créer et gérer ton compte</li>
                  <li>Générer tes consultations mystiques personnalisées</li>
                  <li>Gérer ton solde de crédits et tes achats</li>
                  <li>Sauvegarder ton historique de consultations</li>
                  <li>Répondre à tes demandes de support</li>
                  <li>Améliorer nos services</li>
                </ul>
              </div>
              <p>Nous ne vendons JAMAIS tes données personnelles à des tiers.</p>
            </div>
          ),
        },
        {
          heading: '4. PARTAGE DES DONNÉES',
          content: (
            <div className="flex flex-col gap-4">
              <p>Tes données peuvent être partagées uniquement avec :</p>
              <ul className="list-disc list-inside">
                <li>Supabase (hébergement base de données)</li>
                <li>
                  Google Gemini API (génération de consultations) — le texte que tu soumets (prénoms, questions) est
                  envoyé à Google pour générer ta consultation, sans identification directe de ton compte
                </li>
                <li>Vercel (hébergement du site)</li>
                <li>CinetPay (traitement des paiements, uniquement lors d'un achat)</li>
              </ul>
              <p>Nous ne partageons jamais tes données avec des annonceurs ou des tiers commerciaux.</p>
            </div>
          ),
        },
        {
          heading: '5. SÉCURITÉ DES DONNÉES',
          content: (
            <ul className="list-disc list-inside">
              <li>Mots de passe chiffrés (jamais stockés en clair)</li>
              <li>Connexion sécurisée HTTPS sur tout le site</li>
              <li>Row Level Security (RLS) : chaque utilisateur ne peut voir que ses propres données</li>
              <li>Accès restreint aux données administratives</li>
            </ul>
          ),
        },
        {
          heading: '6. CONSERVATION DES DONNÉES',
          content: (
            <p>
              Tes données sont conservées tant que ton compte est actif. Si tu supprimes ton compte depuis la page
              /profil, toutes tes données sont supprimées définitivement et immédiatement de nos serveurs.
            </p>
          ),
        },
        {
          heading: '7. TES DROITS',
          content: (
            <div className="flex flex-col gap-4">
              <p>Tu as le droit de :</p>
              <ul className="list-disc list-inside">
                <li>Accéder à tes données (page /profil)</li>
                <li>Modifier tes données (page /profil)</li>
                <li>Supprimer ton compte et tes données (page /profil)</li>
                <li>Demander une copie de tes données en nous contactant</li>
              </ul>
              <p>Pour exercer ces droits, contacte-nous sur WhatsApp ou par email.</p>
            </div>
          ),
        },
        {
          heading: '8. COOKIES ET STOCKAGE LOCAL',
          content: (
            <p>
              Secret Divin utilise le stockage local du navigateur (sessionStorage) uniquement pour améliorer les
              performances (mise en cache temporaire de tes consultations). Aucune donnée de tracking publicitaire
              n'est utilisée.
            </p>
          ),
        },
        {
          heading: '9. MINEURS',
          content: (
            <p>
              Secret Divin est destiné aux personnes majeures. Nous ne collectons pas sciemment de données
              d'utilisateurs mineurs.
            </p>
          ),
        },
        {
          heading: '10. MODIFICATIONS',
          content: (
            <p>
              Cette politique peut être mise à jour. Toute modification importante sera communiquée sur cette page
              avec la date de mise à jour.
            </p>
          ),
        },
        {
          heading: '11. CONTACT',
          content: (
            <div className="flex flex-col gap-1">
              <p>{COMPANY.nomCommercial} — {COMPANY.formeJuridique}</p>
              <p>RCCM : {COMPANY.rccm}</p>
              <p>{COMPANY.adresse}</p>
              <p>Email : {COMPANY.email}</p>
              <p>WhatsApp : {COMPANY.telephone}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
