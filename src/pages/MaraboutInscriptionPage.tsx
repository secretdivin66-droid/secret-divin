import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { PAYS_LIST, ABONNEMENT_PRIX_FCFA, whatsappContactUrl } from '../utils/marabouts';
import { WHATSAPP_NUMBER } from '../utils/mystique';
import { MaraboutPaymentButton } from '../components/MaraboutPaymentButton';

const AVANTAGES = [
  'Profil visible sur la plateforme',
  'Filtres par spécialité et pays',
  'Bouton WhatsApp direct',
  "Système d'avis clients",
  'Dashboard personnel',
  'Visibilité auprès de nouveaux clients potentiels',
];

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

// Paiement AVANT remplissage du profil (voir migration 0037) : cette page
// ne collecte plus aucune information de profil, elle se contente de
// s'assurer qu'une ligne `marabouts` brouillon existe (nécessaire aux
// Edge Functions de paiement, qui résolvent le marabout via user_id — voir
// chariow-marabout-checkout/fedapay-marabout-checkout) puis affiche le
// paiement. Le vrai formulaire (nom, spécialités, tarifs...) vit sur
// /marabout-dashboard, débloqué uniquement une fois abonnement_actif=true.
export function MaraboutInscriptionPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        navigate('/auth');
        return;
      }
      setUser(authUser);

      const { data: existing, error: existingError } = await supabase
        .from('marabouts')
        .select('id, abonnement_actif')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existingError) {
        setError('Erreur de chargement. Réessaie dans quelques instants.');
        setLoading(false);
        return;
      }

      // Abonnement déjà payé : plus rien à faire ici, direction le
      // dashboard (qui affichera soit le formulaire à compléter, soit
      // le dashboard complet si déjà rempli — voir MaraboutDashboardPage).
      if (existing?.abonnement_actif) {
        navigate('/marabout-dashboard');
        return;
      }

      // Aucune ligne : premier passage sur cette page, on crée le
      // brouillon. Champs vides — sans risque de fuite, la policy
      // public_read_marabouts (migration 0037) exige profile_completed_at
      // non nul pour qu'une fiche soit visible publiquement.
      if (!existing) {
        const { error: insertError } = await supabase.from('marabouts').insert({
          user_id: authUser.id,
          nom_complet: '',
          description: '',
          specialite: [],
          pays: PAYS_LIST[0],
          ville: '',
          langues: [],
          numero_whatsapp: '',
          is_verified: false,
          is_active: true,
          abonnement_actif: false,
        });
        // 23505 = violation UNIQUE(user_id) : un brouillon existe déjà
        // (double appel de cet effet en StrictMode, double-clic, ou un
        // autre onglet a créé la ligne entre-temps) — ce n'est pas un
        // échec réel, la ligne qu'on voulait existe bel et bien.
        if (insertError && insertError.code !== '23505') {
          console.error('[MaraboutInscriptionPage] création du brouillon échouée :', insertError);
          setError('Erreur lors de la préparation de ton inscription. Réessaie dans quelques instants.');
          setLoading(false);
          return;
        }
      }

      // Sinon : une ligne existe déjà mais l'abonnement n'est pas encore
      // actif (paiement démarré puis abandonné, ou webhook pas encore
      // reçu) — on reste sur cette page pour permettre de reprendre le
      // paiement, sans recréer de ligne (violerait UNIQUE(user_id)).
      setLoading(false);
    }
    check();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f2e' }}>
        <p className="text-or">Chargement...</p>
      </div>
    );
  }

  const paymentMessage =
    'Bonjour, je souhaite payer mon abonnement marabout sur Secret Divin pour ' +
    ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR') + ' FCFA. Mon email : ' + (user?.email ?? '');

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Devenir Marabout sur Secret Divin</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Rejoins notre plateforme et trouve de nouveaux clients
        </p>

        <Separateur />

        <div className="rounded-lg p-8 max-w-[400px] mx-auto text-center" style={{ background: '#0d1545', border: '1px solid #f5c842' }}>
          <p className="text-or font-bold">Abonnement Marabout</p>
          <p className="text-or font-bold text-[2.5rem] mt-2">{ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA / mois</p>
          <div className="flex flex-col gap-2 mt-5 text-left">
            {AVANTAGES.map((a) => (
              <p key={a} className="text-white text-sm">✅ {a}</p>
            ))}
          </div>
          <p className="italic text-sm mt-5" style={{ color: '#a0aec0' }}>
            Paiement en ligne sécurisé. Tu complètes ton profil (nom, spécialités, tarifs...) juste après, une fois le paiement confirmé.
          </p>
        </div>

        <Separateur />

        <div className="carte rounded-lg text-center">
          {error && (
            <div className="rounded-lg p-3 mb-4" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          <p className="text-white mb-5">
            Le paiement se fait maintenant, avant de remplir ton profil — c'est l'étape unique qui te donne accès au formulaire d'inscription.
          </p>
          <MaraboutPaymentButton
            label={`Payer ${ABONNEMENT_PRIX_FCFA.toLocaleString('fr-FR')} FCFA et démarrer mon inscription`}
            className="rounded font-bold py-3 px-6"
            style={{ background: '#f5c842', color: '#0a0f2e' }}
          />
          <button
            onClick={() => window.open(whatsappContactUrl(WHATSAPP_NUMBER, paymentMessage), '_blank', 'noopener,noreferrer')}
            className="block mt-3 mx-auto text-sm underline"
            style={{ color: '#a0aec0' }}
          >
            Un souci avec le paiement en ligne ? Paie via WhatsApp à la place
          </button>
        </div>
      </div>
    </div>
  );
}
