import { Link } from 'react-router-dom';
import { PACKS } from '../utils/mystique';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

const STATS = [
  { value: '10 000+', label: 'Consultations effectuées' },
  { value: '11', label: 'Outils spirituels' },
  { value: '100%', label: 'Basé sur les sciences islamiques' },
];

const OUTILS = [
  { title: 'Poids Mystique', desc: 'Calcul selon la table Abjad islamique traditionnelle.', cost: 'GRATUIT', free: true },
  { title: 'Secret de ton Destin', titleArabic: 'سر قدرك', desc: '17 points mystiques pour une lecture complète de ta destinée.', cost: '2 crédits par génération', free: false },
  { title: 'Carrés Magiques', titleArabic: 'المربعات السحرية', desc: '7 types de carrés, de 3x3 à 9x9, selon ton poids mystique.', cost: '2 crédits par génération', free: false },
  { title: 'Géomancie', titleArabic: 'علم الرمل', desc: "Les 16 figures géomantiques de la tradition africaine.", cost: '2 crédits par génération', free: false },
  { title: 'Interprétation des Rêves', titleArabic: 'تفسير الأحلام', desc: 'Tradition islamique et africaine réunies.', cost: '2 crédits', free: false },
  { title: 'Secrets mystiques', titleArabic: 'الأسرار الروحانية', desc: 'Un talisman personnalisé selon ton objectif.', cost: '2 crédits', free: false },
  { title: 'Secrets des Plantes', titleArabic: 'أسرار النباتات', desc: 'Les plantes sacrées africaines et leurs rituels.', cost: '2 crédits', free: false },
  { title: 'Attraper ou Réconcilier', titleArabic: 'الجذب أو المصالحة', desc: 'Un talisman basé sur les noms arabes de deux personnes.', cost: '2 crédits', free: false },
  { title: 'Tutoriels', titleArabic: 'الدروس التعليمية', desc: '15 tutoriels détaillés pour apprendre pas à pas.', cost: 'GRATUIT', free: true },
];

const STEPS = [
  { number: '01', title: 'Crée ton compte', text: 'Inscription gratuite en quelques secondes, par email ou avec Google.' },
  { number: '02', title: 'Recharge tes crédits', text: 'Choisis ton pack — 2 crédits par génération.' },
  { number: '03', title: 'Reçois tes secrets', text: 'Une consultation personnalisée en quelques secondes.' },
];

const TEMOIGNAGES = [
  { text: "Le calcul du destin m'a vraiment ouvert les yeux sur ma propre personnalité et mon chemin.", author: 'Mamadou K., Dakar' },
  { text: 'Les carrés magiques sont générés avec une précision remarquable, exactement comme dans les textes traditionnels.', author: 'Ibrahim D., Abidjan' },
  { text: 'L\'interprétation de mes rêves était tellement juste que ça m\'a bouleversée.', author: 'Aïcha B., Bamako' },
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

export function LandingPage() {
  useRevealOnScroll();

  return (
    <div>
      {/* SECTION 1.1 — HERO */}
      <section
        className="px-4 pt-14 pb-16 text-center flex flex-col items-center gap-4"
        style={{ background: 'radial-gradient(circle at center, #1a237e 0%, #0a0e2e 70%)' }}
      >
        <span className="reveal px-3 sm:px-4 py-2 rounded-full text-[0.65rem] sm:text-xs font-bold border border-or text-or text-center tracking-wide sm:tracking-[0.15em]">
          ✦ PLATEFORME MYSTIQUE ISLAMIQUE ✦
        </span>
        <p className="reveal arabic text-or" style={{ opacity: 0.5 }}>بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ</p>
        <h1 className="reveal font-bold leading-tight" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          <span className="text-white">Découvre les Secrets</span>
          <br />
          <span className="text-or">de ton Destin</span>
        </h1>
        <p className="reveal max-w-2xl text-lg" style={{ color: '#b0b8d4' }}>
          Poids mystique, géomancie, carrés magiques, talismans, interprétation des rêves et sciences spirituelles
          islamiques en un seul endroit.
        </p>
        <div className="reveal flex flex-col sm:flex-row gap-4 mt-4">
          <Link to="/auth?mode=register" className="btn-principal rounded">Commencer maintenant</Link>
          <Link to="/auth?mode=register" className="btn-secondaire rounded">Calculer mon poids mystique</Link>
        </div>
        <p className="reveal text-sm" style={{ color: '#b0b8d4' }}>
          Calcul du poids mystique et tutoriels — toujours gratuits
        </p>
      </section>

      {/* SECTION 1.2 — STATS */}
      <section
        className="py-10 px-4"
        style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(37,99,235,0.1)', borderBottom: '1px solid rgba(37,99,235,0.1)' }}
      >
        <div className="reveal max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-or font-bold text-4xl">{s.value}</p>
              <p className="mt-2" style={{ color: '#b0b8d4' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 1.3 — OUTILS */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="reveal text-center text-2xl font-bold mb-6">
          <span className="text-white">Tout ce dont tu as besoin</span>{' '}
          <span className="text-or">en un seul endroit</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {OUTILS.map((o) => (
            <div
              key={o.title}
              className="reveal rounded-lg p-5 flex flex-col items-center text-center sm:items-start sm:text-left gap-2 transition hover:-translate-y-1"
              style={{ background: 'linear-gradient(160deg, #161f6b, #0e1550)', border: '1px solid rgba(37,99,235,0.15)' }}
            >
              {o.free && (
                <span className="self-center sm:self-start px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                  GRATUIT
                </span>
              )}
              {o.titleArabic && (
                <p className="arabic font-bold text-[1.1em]" style={{ color: '#f9a825' }}>
                  {o.titleArabic}
                </p>
              )}
              <h3 className="font-bold text-white">{o.title}</h3>
              <p className="text-sm" style={{ color: '#b0b8d4' }}>{o.desc}</p>
              <p className={`text-xs font-bold mt-auto ${o.free ? 'text-green-400' : 'text-or'}`}>{o.free ? 'Toujours gratuit' : o.cost}</p>
            </div>
          ))}
        </div>
      </section>

      <Separateur />

      {/* SECTION 1.4 — COMMENT ÇA MARCHE */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="reveal text-center text-2xl font-bold mb-6">
          <span className="text-white">Comment ça</span> <span className="text-or">fonctionne ?</span>
        </h2>
        <div className="reveal grid grid-cols-1 sm:grid-cols-3 gap-5">
          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center gap-3">
              <p className="text-or font-bold text-2xl">{step.number}</p>
              <h3 className="font-bold text-white">{step.title}</h3>
              <p className="text-sm" style={{ color: '#b0b8d4' }}>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <Separateur />

      {/* SECTION 1.5 — TARIFS */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="reveal text-center text-2xl font-bold mb-6">
          <span className="text-white">Des crédits pour</span> <span className="text-or">chaque besoin</span>
        </h2>
        <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {PACKS.map((pack) => (
            <div
              key={pack.id}
              className="carte rounded-lg text-center flex flex-col"
              style={pack.popular ? { border: '2px solid #2563EB' } : undefined}
            >
              {pack.popular && (
                <span className="self-center px-3 py-1 rounded-full text-xs font-bold bg-or text-white mb-2">POPULAIRE</span>
              )}
              <p className="text-sm" style={{ color: '#b0b8d4' }}>{pack.name}</p>
              <p className="text-xs text-center mt-1" style={{ color: '#b0b8d4' }}>
                {pack.credits === null ? 'Crédits illimités' : `${pack.credits} Crédits`}
              </p>
              <p className="text-white font-bold text-3xl mt-1">{pack.credits ?? '∞'}</p>
              <p className="text-or font-bold text-xl mt-2">{pack.price.toLocaleString('fr-FR')} FCFA</p>
              <Link to="/credits" className="btn-secondaire rounded mt-4">Choisir</Link>
            </div>
          ))}
        </div>
        <p className="reveal text-center text-sm mt-8" style={{ color: '#b0b8d4' }}>
          Paiement via Orange Money, Wave, Moov Money, MTN Mobile Money
        </p>
      </section>

      <Separateur />

      {/* SECTION 1.6 — TÉMOIGNAGES */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="reveal text-center text-2xl font-bold mb-6">
          <span className="text-white">Ce que disent</span> <span className="text-or">nos utilisateurs</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TEMOIGNAGES.map((t) => (
            <div key={t.author} className="reveal carte rounded-lg">
              <p className="italic text-white">« {t.text} »</p>
              <p className="text-or font-bold text-sm mt-4">{t.author}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 1.7 — CTA FINAL */}
      <section className="px-4 py-16 text-center">
        <p className="reveal arabic text-or" style={{ opacity: 0.4, textAlign: 'center' }}>إِنَّ مَعَ الْعُسْرِ يُسْرًا</p>
        <h2 className="reveal text-2xl font-bold mt-6">
          <span className="text-white">Commence ton voyage</span>
          <br />
          <span className="text-or">spirituel aujourd'hui</span>
        </h2>
        <div className="reveal flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link to="/auth?mode=register" className="btn-principal rounded">Créer mon compte gratuitement</Link>
          <Link to="/fonctionnalites" className="btn-secondaire rounded">Voir les fonctionnalités</Link>
        </div>
      </section>
    </div>
  );
}
