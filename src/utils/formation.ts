export interface Lesson { id: number; title: string; }
export interface Module {
  id: number; niveau: string; niveauColor: string;
  title: string; description: string;
  lessons: Lesson[]; isUnlockedByDefault: boolean;
}

export const MODULES: Module[] = [
  { id: 1, niveau: 'Débutant', niveauColor: '#4caf50',
    title: 'Introduction à la science des lettres (Ilm al-Huruf)',
    description: "Découvre les fondements de la science mystique islamique des lettres et des nombres.",
    lessons: [
      { id: 1, title: "Qu'est-ce que l'Ilm al-Huruf ?" },
      { id: 2, title: 'Histoire et origines de la science des lettres' },
      { id: 3, title: 'Les lettres arabes et leurs secrets mystiques' }
    ], isUnlockedByDefault: true },

  { id: 2, niveau: 'Débutant', niveauColor: '#4caf50',
    title: 'Le poids mystique et le système Abjad',
    description: "Maîtrise le calcul du poids mystique avec la table Abjad islamique traditionnelle.",
    lessons: [
      { id: 1, title: 'La table Abjad complète et ses origines' },
      { id: 2, title: "Calcul du poids mystique d'un nom" },
      { id: 3, title: 'Applications pratiques du poids mystique' }
    ], isUnlockedByDefault: false },

  { id: 3, niveau: 'Débutant', niveauColor: '#4caf50',
    title: 'Les carrés magiques de base (3x3 et 4x4)',
    description: "Apprends à construire et utiliser les carrés Moussalas et Mourabbah islamiques.",
    lessons: [
      { id: 1, title: 'Le carré 3x3 Moussalas — construction et utilisation' },
      { id: 2, title: 'Le carré 4x4 Mourabbah — méthode complète' },
      { id: 3, title: 'Vérification et utilisation des carrés' }
    ], isUnlockedByDefault: false },

  { id: 4, niveau: 'Intermédiaire', niveauColor: '#1565c0',
    title: 'La géomancie africaine — Les 16 figures',
    description: "Découvre les 16 figures géomantiques et leur signification spirituelle profonde.",
    lessons: [
      { id: 1, title: 'Introduction à la géomancie islamique africaine' },
      { id: 2, title: 'Les 16 figures et leurs significations complètes' },
      { id: 3, title: "Construction et lecture d'un thème géomantique complet" }
    ], isUnlockedByDefault: false },

  { id: 5, niveau: 'Intermédiaire', niveauColor: '#1565c0',
    title: "L'interprétation des rêves islamiques",
    description: "Maîtrise la science du tabir al-ru'ya selon Ibn Sirin et la tradition africaine.",
    lessons: [
      { id: 1, title: 'Les types de rêves en Islam — classification complète' },
      { id: 2, title: 'Les symboles principaux et leurs significations' },
      { id: 3, title: "Méthode complète d'interprétation" }
    ], isUnlockedByDefault: false },

  { id: 6, niveau: 'Intermédiaire', niveauColor: '#1565c0',
    title: 'Les plantes mystiques et leurs secrets',
    description: "Explore les plantes sacrées africaines et leur utilisation dans les rituels.",
    lessons: [
      { id: 1, title: "Les plantes sacrées d'Afrique de l'Ouest" },
      { id: 2, title: 'Préparation des décoctions et talismans végétaux' },
      { id: 3, title: 'Rituels complets avec les plantes' }
    ], isUnlockedByDefault: false },

  { id: 7, niveau: 'Expert', niveauColor: '#f5c842',
    title: 'Les carrés magiques avancés (5x5 à 9x9)',
    description: "Maîtrise les carrés Moukhams, Moussadis, Moussabbi'a, Mouthammin et Moutassi'ou.",
    lessons: [
      { id: 1, title: 'Carrés 5x5 Moukhams et 6x6 Moussadis' },
      { id: 2, title: "Carrés 7x7 Moussabbi'a et 8x8 Mouthammin" },
      { id: 3, title: "Le carré 9x9 Moutassi'ou — le maître des carrés" }
    ], isUnlockedByDefault: false },

  { id: 8, niveau: 'Expert', niveauColor: '#f5c842',
    title: 'Les secrets du destin — Les 17 points mystiques',
    description: "Apprends à calculer et interpréter les 17 points du profil spirituel complet.",
    lessons: [
      { id: 1, title: 'Les éléments, étoiles et planètes dominantes' },
      { id: 2, title: 'Les noms divins, versets et invocations' },
      { id: 3, title: 'Le sacrifice et la protection spirituelle complète' }
    ], isUnlockedByDefault: false },

  { id: 9, niveau: 'Expert', niveauColor: '#f5c842',
    title: 'Talismans et rituels complets',
    description: "Maîtrise la création de talismans complets et l'exécution de rituels spirituels.",
    lessons: [
      { id: 1, title: "Création d'un talisman complet étape par étape" },
      { id: 2, title: 'Le zikr et les invocations personnalisées' },
      { id: 3, title: 'Rituels avancés et protection spirituelle durable' }
    ], isUnlockedByDefault: false },
];
