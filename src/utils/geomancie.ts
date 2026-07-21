export const FIGURES: Record<string, {
  nomArabe: string; nomBambara: string;
  element: string; direction: string;
  nature: string; influence: string;
  caractere: string; sante?: string;
  sacrifice: string;
  plante: { nomFrancais: string; nomBambara: string;
    nomScientifique: string; lienWikipedia: string; };
}> = {

  'Youssouf': {
    nomArabe: 'Youssouf', nomBambara: 'Djanfa (Almami)',
    element: 'Feu', direction: 'Est', nature: 'Sortante (Mobile)',
    influence: 'Défavorable',
    caractere: "Affirmation de soi exagérée, trahison, déception, tromperie, jalousie, impulsivité. Recherche de plaisir, fêtes, rencontres amoureuses. Caractère combatif, nerveux et très réactif. Promesses non tenues. Séduction et gaieté mais instabilité.",
    sacrifice: "Le mil est le plus souvent indiqué. Couleur dominante : rouge.",
    plante: { nomFrancais: 'Balançon / Tamarinier', nomBambara: 'Balança',
      nomScientifique: 'Tamarindus indica',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Tamarinier' }
  },

  'Adama': {
    nomArabe: 'Adam', nomBambara: 'Adama',
    element: 'Feu', direction: 'Est', nature: 'Sortante',
    influence: 'Favorable',
    caractere: "Bonne et heureuse vie, chance, accroissement financier, gaieté, beauté, réussite dans les affaires. Joie de vivre, optimisme, succès dans les entreprises.",
    sacrifice: "Mouton blanc ou toute chose de couleur blanche.",
    plante: { nomFrancais: 'Sana / Séné', nomBambara: 'Sana',
      nomScientifique: 'Cassia sieberiana',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Cassia_sieberiana' }
  },

  'Malidjou': {
    nomArabe: 'Mahdiou', nomBambara: 'Malijou',
    element: 'Air (Vent)', direction: 'Sud', nature: 'Rentrante',
    influence: 'Très favorable',
    caractere: "Élévation, hauteur, chefferie, sagesse, intelligence, concrétisation et épanouissement dans toute entreprise. Personne responsable, honnête, protectrice. Parle des génies qui habitent les endroits élevés.",
    sacrifice: "Écorces ou feuilles des arbres hauts, feuilles ou racines d'arbres qui poussent sur des endroits élevés.",
    plante: { nomFrancais: 'Cèdre africain / Quiélélé', nomBambara: 'Cebé',
      nomScientifique: 'Khaya senegalensis',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Khaya_senegalensis' }
  },

  'Idriss': {
    nomArabe: 'Idriss', nomBambara: 'Albayada',
    element: 'Eau', direction: 'Nord', nature: 'Rentrante',
    influence: 'Très favorable',
    caractere: "Véridique, très bon croyant, bienfaisant, attaché à la vérité. Sagesse, sérénité, clairvoyance, réussite. Personnes âgées et réfléchies, préoccupées par la famille. Paix, bonté, spiritualité, méditation, intuition. Pureté d'esprit.",
    sante: "Problèmes de pieds, jambes, os liés à la vieillesse.",
    sacrifice: "Toute chose dont la blancheur est notée : habit blanc, mouton blanc, papier blanc, bougie blanche.",
    plante: { nomFrancais: 'Karité', nomBambara: 'Djou',
      nomScientifique: 'Vitellaria paradoxa',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Karit%C3%A9' }
  },

  'Ibrahim': {
    nomArabe: 'Ibrahim', nomBambara: 'Tâliki',
    element: 'Eau', direction: 'Nord', nature: 'Mobile',
    influence: 'Faible / Intermédiaire',
    caractere: "Voie, route, direction, effort, concentration d'idées, méditation sur un problème. Doute, inquiétude, lenteur, instabilité, difficultés, obstacles. Le but est toujours atteint malgré les retards. Personne souvent maladive.",
    sacrifice: "Génies faibles qu'on peut faire quitter facilement.",
    plante: { nomFrancais: 'Kapokier', nomBambara: 'Djècala',
      nomScientifique: 'Ceiba pentandra',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Ceiba_pentandra' }
  },

  'Issa': {
    nomArabe: 'Issa', nomBambara: 'Ngansa',
    element: 'Eau', direction: 'Nord', nature: 'Mobile (Commune)',
    influence: 'Défavorable / Très négative',
    caractere: "Paroles, bruits, sons, querelles, disputes, discours, dispersions, diminution, décadence, perte d'énergie. Colère, frustration, régression, abandon, privation. Corruption, conflits, séparation, haine. Personne rusée, vaniteuse, hypocrite, menteuse.",
    sacrifice: "De la fumée, chèvre, oiseaux, objets ou animaux bruyants. Couleur rouge dominante.",
    plante: { nomFrancais: 'Neem / Margousier', nomBambara: 'Wingninga',
      nomScientifique: 'Azadirachta indica',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Azadirachta_indica' }
  },

  'Lomara': {
    nomArabe: 'Oumar', nomBambara: 'Lomara',
    element: 'Air', direction: 'Sud', nature: 'Sortante (Mobile)',
    influence: 'Très défavorable',
    caractere: "Ne montre que de mauvaises choses. Éclatements, explosions, saignements, opérations chirurgicales. Révolte, tension, destruction, rebellion, impulsivité, cruauté, violence. Passions, guerres, luttes dans le sang.",
    sacrifice: "Couleur rouge très dominante dans le choix des sacrifices animaux, objets ou fruits.",
    plante: { nomFrancais: 'Acacia rouge / Gao', nomBambara: 'Gababelé',
      nomScientifique: 'Faidherbia albida',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Faidherbia_albida' }
  },

  'Mangossi': {
    nomArabe: 'Ayouba', nomBambara: 'Mangossi',
    element: 'Terre', direction: 'Ouest', nature: 'Rentrante et fixe',
    influence: 'Très défavorable',
    caractere: "Tristesse subie indépendante de la volonté. Noir, obscur, sombre, tristesse, rancunes, afflictions, dépression, mélancolie, déceptions, désespoir. Comportement austère, peu sociable. Génies de terre dans des grottes ou endroits sombres.",
    sacrifice: "Tubercules, mouton noir, bœuf noir, poule noire.",
    plante: { nomFrancais: 'Caïlcédrat / Fromager noir', nomBambara: 'Kronifin',
      nomScientifique: 'Khaya grandifoliola',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Khaya_grandifoliola' }
  },

  'Kalalaw': {
    nomArabe: 'Allahou talla', nomBambara: 'Kalalaw',
    element: 'Feu', direction: 'Est', nature: 'Sortante',
    influence: 'Intermédiaire',
    caractere: "Variations brusques, richesses inattendues, acquisitions, réussites précaires, fortunes subites qui ne durent pas. Relation entre l'homme et Dieu, piété, foi, spiritualité, savoir immense, saints. Succès inattendu, progression subite.",
    sante: "Problèmes de tête et de cou.",
    sacrifice: "Moutons, feuilles, lait, bougies, colas.",
    plante: { nomFrancais: 'Balanites / Dattier du désert', nomBambara: 'Sadio ou Aladjo',
      nomScientifique: 'Balanites aegyptiaca',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Balanites_aegyptiaca' }
  },

  'Solomane': {
    nomArabe: 'Souleymane', nomBambara: 'Mansa Solomani',
    element: 'Terre', direction: 'Ouest', nature: 'Sortante et mobile',
    influence: 'Défavorable',
    caractere: "Contrainte et blocage dans toute chose entreprise. Pensées secrètes, enclos fermés, concentration d'esprit, empêchement, restriction, encerclement, isolement, égoïsme, déception, science occulte, prison.",
    sante: "Maladies de ventre.",
    sacrifice: "Mouton noir (le plus souvent), poule noire, colas rouges, chèvre noire, igname.",
    plante: { nomFrancais: 'Baobab', nomBambara: 'Sira ou baobab',
      nomScientifique: 'Adansonia digitata',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Adansonia_digitata' }
  },

  'Badra Alou': {
    nomArabe: 'Aliou', nomBambara: 'Badara Aliou',
    element: 'Air', direction: 'Est', nature: 'Rentrante, fixe',
    influence: 'Positive / Favorable',
    caractere: "Union, réunion, rencontres, associations, conjonctions, alliances. Personne gaie, accueillante, sens des relations, esprit d'ouverture et de partage. Diplomatie, négociations, affinités, contrats, aides.",
    sante: "Maladies de la côte, du cœur.",
    sacrifice: "Aluminium, mouton blanc, poulet blanc, colas blancs.",
    plante: { nomFrancais: 'Liane verte / Saba', nomBambara: 'Gbè yiri',
      nomScientifique: 'Saba senegalensis',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Saba_senegalensis' }
  },

  'Nouhou': {
    nomArabe: 'Nouhou', nomBambara: 'Nouhoukoro',
    element: 'Terre', direction: 'Ouest', nature: 'Rentrante, fixe',
    influence: 'Très favorable',
    caractere: "Le sage, l'intelligent, le respecté et l'honoré. Bonne moralité, posé, réfléchi. Réussite personnelle, fortune gagnée dans les labeurs. Confiance en soi, accomplissement. Caractère loyal et juste.",
    sante: "Problèmes liés au sang.",
    sacrifice: "Vieilles chaussures, vieux habits, colas blancs.",
    plante: { nomFrancais: 'Detarium / Ditakh', nomBambara: 'Kounbè',
      nomScientifique: 'Detarium microcarpum',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Detarium_microcarpum' }
  },

  'Lawssana': {
    nomArabe: 'Al Hassan (Houssaini)', nomBambara: 'Lawssinè',
    element: 'Eau', direction: 'Nord', nature: 'Sortante, mobile',
    influence: 'Très négative',
    caractere: "Disputes, traîtrises, querelles amoureuses, perversion, délation, prostitution, malhonnêteté, déception, surprise, mauvaise foi, mauvaise voie, vol, fallacieux. Perte de confiance, tromperie en amour.",
    sante: "Impuissance, avortement, naissance prématurée.",
    sacrifice: "Fleurs ou plantes qui poussent sur les arbres.",
    plante: { nomFrancais: 'Zaman / Tamarinier des Indes', nomBambara: 'Zaman',
      nomScientifique: 'Samanea saman',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Samanea_saman' }
  },

  'Tontigui': {
    nomArabe: 'Yoûnouss', nomBambara: 'Tontigui',
    element: 'Terre', direction: 'Nord', nature: 'Sortante, mobile',
    influence: 'Défavorable',
    caractere: "Adolescence, plaisanteries, gaieté, amusements, manque de maturité, plaisirs, rencontre amoureuse. Aventurier, passionnel, cruel, audacieux, enfantin. Argent, gain, accroissement de biens financiers.",
    sante: "Maladies liées aux poitrines.",
    sacrifice: "Poule noire ou pain de singe.",
    plante: { nomFrancais: "Jatropha / Pignon d'Inde", nomBambara: 'Dialassogala',
      nomScientifique: 'Jatropha curcas',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Jatropha_curcas' }
  },

  'Ousmane': {
    nomArabe: 'Ousmane', nomBambara: 'Mori Zoumana',
    element: 'Air', direction: 'Sud', nature: 'Rentrante, fixe',
    influence: 'Très favorable',
    caractere: "Apport des énergies matérielles, morales et physiques. Accroissement des biens et services, gains, succès, avantages, prospérité, certitude, sagesse, sérieux, honnêteté, paix intérieure, réussite financière.",
    sante: "Maladie qui s'apaise la nuit mais s'empire le jour.",
    sacrifice: "Poule blanche, colas blancs ou mouton blanc.",
    plante: { nomFrancais: 'Doumier / Palmier doum', nomBambara: 'Doubalé',
      nomScientifique: 'Hyphaene thebaica',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Hyphaene_thebaica' }
  },

  'Moussa': {
    nomArabe: 'Moussa', nomBambara: 'Moussa',
    element: 'Feu', direction: 'Est', nature: 'Fixe',
    influence: 'Intermédiaire (neutre)',
    caractere: "Multiplicité dans toute chose, idées de toutes sortes, groupes, foule, rassemblements, cérémonies. Voyages en convoi, médias, informations, débats, commerce. Ni mauvais ni bon. Confusion des pensées.",
    sante: "Plusieurs maladies dans le corps du malade.",
    sacrifice: "Graines, habits, mouton blanc, plusieurs bougies, feuilles blanches (toujours en grande quantité).",
    plante: { nomFrancais: 'Moringa', nomBambara: 'Tomi boulou',
      nomScientifique: 'Moringa oleifera',
      lienWikipedia: 'https://fr.wikipedia.org/wiki/Moringa_oleifera' }
  },
};

export const MAISONS: Record<string, {
  titre: string; description: string;
  element: string; nature: string;
}> = {
  M1:  { titre: 'Maison du demandeur', description: "Maison du consultant, reflet de l'âme, des pensées, désirs, tempérament, état psychologique, moral, sentiments.", element: 'Feu', nature: 'Mobile' },
  M2:  { titre: 'Maison des biens et chance', description: "Maison des chances, biens, profits, gains, richesses, acquisitions. La chance peut être positive ou négative.", element: 'Air', nature: 'Fixe' },
  M3:  { titre: 'Maison de la famille', description: 'Maison des parents proches, frères, collègues, entourage proche.', element: 'Eau', nature: 'Commune' },
  M4:  { titre: 'Maison du foyer', description: 'Foyer du questionnant, statut des parents, patrimoine, terre, biens mobiliers et immobiliers.', element: 'Terre', nature: 'Mobile' },
  M5:  { titre: 'Maison des amours', description: 'Maison des enfants, amours, projets amoureux, nouvelles, grossesses.', element: 'Feu', nature: 'Fixe' },
  M6:  { titre: 'Maison de la maladie', description: 'Maison de la maladie, chose accomplie, angoisses, malheurs, esclaves, cheptel.', element: 'Air', nature: 'Commune' },
  M7:  { titre: 'Maison conjugale', description: 'Maison des époux, adversaires, rivaux, associés. Par extension les paroles et idées.', element: 'Eau', nature: 'Mobile' },
  M8:  { titre: 'Maison de la mort', description: "Maison de l'extérieur, héritages, crédits, dettes, changements, tristesse, mort.", element: 'Terre', nature: 'Fixe' },
  M9:  { titre: 'Maison des voyages', description: 'Maison des déplacements, voyages, spiritualité, foi, recherche et découverte.', element: 'Feu', nature: 'Commune' },
  M10: { titre: 'Maison du travail', description: 'Maison du service, autorité, position sociale, royauté, honneurs.', element: 'Air', nature: 'Mobile' },
  M11: { titre: 'Maison des espoirs', description: 'Maison des espérances, espoirs, affinités, projets, amis et aides.', element: 'Eau', nature: 'Fixe' },
  M12: { titre: 'Maison des épreuves', description: 'Maison des épreuves, blocages, pièges, difficultés, ennemis et maraboutages.', element: 'Terre', nature: 'Commune' },
  M13: { titre: 'Maison du plaisir', description: 'Maison du plaisir, joie, résultats du moment, acquisitions et rêves.', element: 'Feu', nature: 'Mobile' },
  M14: { titre: 'Maison du futur', description: 'Maison des réalisations ultérieures, gains à venir, futur et avenir.', element: 'Air', nature: 'Fixe' },
  M15: { titre: 'Synthèse du thème', description: 'Synthèse de toutes les maisons, résumé du thème et conclusion.', element: 'Eau', nature: 'Commune' },
  M16: { titre: 'Confirmation divine', description: "Confirmation entre l'homme et son milieu. En milieu bambara c'est le jugement de Dieu.", element: 'Terre', nature: 'Commune' },
};

export const HOUSE_GROUPS: { label: string; houses: string[] }[] = [
  { label: 'Les 4 Mères', houses: ['M1', 'M2', 'M3', 'M4'] },
  { label: 'Les 4 Filles', houses: ['M5', 'M6', 'M7', 'M8'] },
  { label: 'Les 4 Nièces', houses: ['M9', 'M10', 'M11', 'M12'] },
  { label: 'Témoins / Juge', houses: ['M13', 'M14', 'M15', 'M16'] },
];

export function influenceColor(influence: string): { bg: string; text: string } {
  const lower = influence.toLowerCase();
  if (lower.includes('très défavorable') || lower.includes('très négative')) return { bg: '#3a1b1b', text: '#e53935' };
  if (lower.includes('défavorable') || lower.includes('négative')) return { bg: '#3a1b1b', text: '#e57373' };
  if (lower.includes('très favorable') || lower.includes('positive')) return { bg: '#1b3a1f', text: '#4caf50' };
  if (lower.includes('favorable')) return { bg: '#1b3a1f', text: '#81c784' };
  return { bg: '#1E3A8A', text: '#f5c842' };
}
