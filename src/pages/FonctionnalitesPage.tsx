import { Link } from 'react-router-dom';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

interface FeatureCard {
  title: string;
  titleArabic?: string;
  free: boolean;
  description: string;
  items: string[];
}

const FEATURES: FeatureCard[] = [
  {
    title: 'Poids Mystique',
    free: true,
    description:
      "Le calcul du poids mystique est basé sur la table Abjad islamique traditionnelle, qui attribue une valeur numérique à chaque lettre arabe. En combinant le poids de ton prénom et de celui de ta mère, tu obtiens un nombre unique qui révèle ton élément dominant et les grandes lignes de ta personnalité.",
    items: ['Translittération en arabe', 'Poids de chaque lettre', 'PM total calculé', 'Élément dominant', 'Chiffres arabes-indiens'],
  },
  {
    title: 'Secret de ton Destin',
    titleArabic: 'سر قدرك',
    free: false,
    description:
      "Le destin complet révèle 17 points mystiques de ton profil spirituel : ton élément, ta planète, ton nom divin personnel, un verset coranique adapté, et bien plus. Une lecture profonde et personnalisée de ta destinée.",
    items: ['17 points mystiques complets', 'Nom divin personnalisé', 'Verset coranique', 'Talisman avec carré magique', 'Sacrifice recommandé', 'Plante mystique', 'Export PDF', 'Lecture vocale'],
  },
  {
    title: 'Secret de ton Jour',
    titleArabic: 'سر يومك',
    free: false,
    description:
      "Chaque jour de la semaine est lié à une planète et une énergie propre. En croisant ton jour de naissance avec ton poids mystique, révèle l'influence planétaire qui façonne ta personnalité et les périodes les plus favorables pour agir.",
    items: ['Planète associée à ton jour', 'Influence sur ta personnalité', 'Nom divin et verset adaptés', 'Talisman du jour', 'Plante recommandée'],
  },
  {
    title: 'Carrés Magiques',
    titleArabic: 'المربعات السحرية',
    free: false,
    description:
      "Génère ton carré magique personnel selon la tradition islamique, de 3x3 Moussalas à 9x9 Moutassi'ou. Chaque carré est calculé mathématiquement à partir de ton poids mystique, avec vérification de la somme magique.",
    items: ['7 types de carrés (3x3 à 9x9)', 'Calcul basé sur ton poids mystique', 'Vérification automatique de la somme', 'Export en image', 'Chiffres en français et en arabe'],
  },
  {
    title: 'Géomancie',
    titleArabic: 'علم الرمل',
    free: false,
    description:
      "L'art divinatoire ancestral du Khatt ar-Raml, pratiqué depuis des siècles en Afrique de l'Ouest. Pose ta question et reçois un thème géomantique complet basé sur les 16 figures traditionnelles.",
    items: ['16 figures géomantiques', 'Thème complet sur les 16 maisons', 'Lecture ciblée pour ta question', 'Sacrifices et plantes recommandés', 'Figure dominante identifiée'],
  },
  {
    title: 'Interprétation des Rêves',
    titleArabic: 'تفسير الأحلام',
    free: false,
    description:
      "Comprends le sens caché de tes rêves selon la tradition islamique (tabir al-ru'ya) et la sagesse spirituelle africaine. Une analyse complète des symboles et du message que ton rêve te transmet.",
    items: ['Analyse symbole par symbole', 'Vision islamique et africaine', 'Invocation et nom divin recommandés', 'Plan d\'action pratique', 'Sacrifice si nécessaire'],
  },
  {
    title: 'Secrets mystiques',
    titleArabic: 'الأسرار الروحانية',
    free: false,
    description:
      "Des secrets spirituels ciblés selon ton objectif précis : protection, amour, richesse, santé, élévation spirituelle... Un talisman personnalisé pour t'accompagner.",
    items: ['Objectif personnalisé', 'Nom divin et verset adaptés', 'Talisman avec carré magique', 'Sacrifice recommandé', 'Export PDF'],
  },
  {
    title: 'Secrets des Plantes',
    titleArabic: 'أسرار النباتات',
    free: false,
    description:
      "Découvre les plantes sacrées d'Afrique de l'Ouest et leurs usages spirituels selon ton objectif. De 1 à 7 plantes selon la complexité de ta situation, avec un rituel complet.",
    items: ['1 à 7 plantes selon ton besoin', 'Nom scientifique et bambara', 'Préparation du rituel complet', 'Versets coraniques associés', 'Sacrifice recommandé'],
  },
  {
    title: 'Compatibilité',
    titleArabic: 'التوافق',
    free: false,
    description:
      "Analyse l'harmonie entre deux personnes à travers leurs poids mystiques et leurs éléments respectifs. Un score de compatibilité, les forces et tensions de la relation, et des conseils concrets pour l'équilibrer.",
    items: ['Score de compatibilité', 'Analyse des deux profils', 'Interaction entre les éléments', 'Forces et défis de la relation', 'Conseils pour harmoniser'],
  },
  {
    title: 'Attraper ou Réconcilier',
    titleArabic: 'الجذب أو المصالحة',
    free: false,
    description:
      "Génère un talisman personnalisé basé sur les noms arabes de deux personnes pour atteindre un objectif précis : mariage, réconciliation, travail, protection...",
    items: ['Basé sur 2 profils (toi et ta cible)', '2 noms divins combinés', 'Carré magique sur mesure', 'Zikr quotidien avec audio', 'Plantes et parfum recommandés'],
  },
  {
    title: 'Tutoriels',
    titleArabic: 'الدروس التعليمية',
    free: true,
    description:
      "15 tutoriels détaillés pour apprendre à utiliser chaque outil pas à pas : calculs, constructions de carrés magiques, interprétation des symboles et bien plus.",
    items: ['15 tutoriels complets', 'Filtrage par catégorie et niveau', 'Exemples pratiques résolus', 'Erreurs courantes à éviter', 'Accès illimité et gratuit'],
  },
  {
    title: 'Formation',
    titleArabic: 'التكوين',
    free: false,
    description:
      "9 modules structurés en 3 niveaux (débutant, intermédiaire, expert) pour comprendre en profondeur les sciences ésotériques islamiques, de l'Ilm al-Huruf jusqu'aux techniques avancées. Chaque leçon se termine par un quiz noté.",
    items: ['9 modules, 3 niveaux', '27 leçons au total', 'Quiz noté après chaque leçon', 'Suivi de ta progression'],
  },
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

export function FonctionnalitesPage() {
  useRevealOnScroll();

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Commence gratuitement, va aussi loin que tu veux</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          12 outils de guidance spirituelle — du calcul gratuit à la lecture complète de ton destin
        </p>

        <Separateur />

        <div className="flex flex-col gap-5">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="reveal carte rounded-lg">
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4"
                style={feature.free ? { background: '#1b3a1f', color: '#4caf50' } : { background: 'rgba(245,200,66,0.1)', color: '#f5c842' }}
              >
                {feature.free ? 'GRATUIT' : '2 crédits par génération'}
              </span>
              {feature.titleArabic && (
                <p className="arabic font-bold text-[1.15em]" style={{ color: '#f5c842' }}>
                  {feature.titleArabic}
                </p>
              )}
              <h2 className="text-white font-bold text-xl">{feature.title}</h2>
              <p className="mt-3" style={{ color: '#a0aec0' }}>{feature.description}</p>

              <p className="text-or font-bold mt-5 mb-2">Ce que tu obtiens</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {feature.items.map((item, i) => (
                  <p key={i} className="text-white text-sm">✅ {item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separateur />

        <div className="reveal carte rounded-lg text-center">
          <h2 className="text-white font-bold text-xl">Prêt à découvrir tes secrets ?</h2>
          <Link to="/auth?mode=register" className="btn-principal rounded mt-5 inline-block">
            Créer mon compte gratuitement
          </Link>
        </div>
      </div>
    </div>
  );
}
