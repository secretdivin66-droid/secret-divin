import { Link } from 'react-router-dom';
import { PACKS } from '../utils/mystique';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

const STATS = [
  { value: '9', label: 'Outils spirituels' },
  { value: '2', label: 'Outils 100% gratuits' },
  { value: '100%', label: 'Basé sur les sciences islamiques traditionnelles' },
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
        className="px-4 pt-16 pb-16 text-center flex flex-col items-center gap-5"
        style={{ background: '#0a0f2e' }}
      >
        <img
          src="/logo.svg"
          alt="Secrets Divins"
          className="reveal h-24 w-24 rounded-full shrink-0"
          style={{ filter: 'drop-shadow(0 0 15px #f5c842)' }}
        />

        <p className="reveal arabic text-or font-bold" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}>
          بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
        </p>

        <Separateur />

        <h1 className="reveal font-bold text-or leading-tight" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)' }}>
          Secret Divin
        </h1>

        <p className="reveal max-w-2xl text-lg text-white">
          La plateforme de sagesse spirituelle islamique — sciences ésotériques, calculs mystiques et guidance
          spirituelle personnalisée.
        </p>

        <p className="reveal arabic text-or text-lg">الحكمة الروحية والعلوم الباطنية الإسلامية</p>

        <div className="reveal w-full max-w-md flex flex-col gap-4 mt-4">
          <Link
            to="/auth?mode=register"
            className="w-full rounded font-bold py-3 text-center"
            style={{ background: '#f5c842', color: '#0a0f2e' }}
          >
            Commencer gratuitement
          </Link>
          <Link
            to="/fonctionnalites"
            className="w-full rounded font-bold py-3 text-center text-white"
            style={{ background: 'transparent', border: '1px solid #ffffff' }}
          >
            Voir les outils
          </Link>
        </div>
      </section>

      {/* SECTION 1.2 — STATS */}
      <section
        className="py-10 px-4"
        style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(245,200,66,0.1)', borderBottom: '1px solid rgba(245,200,66,0.1)' }}
      >
        <div className="reveal max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-or font-bold text-4xl">{s.value}</p>
              <p className="mt-2" style={{ color: '#a0aec0' }}>{s.label}</p>
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
              style={{ background: 'linear-gradient(160deg, #161f6b, #0e1550)', border: '1px solid rgba(245,200,66,0.15)' }}
            >
              {o.free && (
                <span className="self-center sm:self-start px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                  GRATUIT
                </span>
              )}
              {o.titleArabic && (
                <p className="arabic font-bold text-[1.1em]" style={{ color: '#f5c842' }}>
                  {o.titleArabic}
                </p>
              )}
              <h3 className="font-bold text-white">{o.title}</h3>
              <p className="text-sm" style={{ color: '#a0aec0' }}>{o.desc}</p>
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
              <p className="text-sm" style={{ color: '#a0aec0' }}>{step.text}</p>
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
              style={pack.popular ? { border: '2px solid #f5c842' } : undefined}
            >
              {pack.popular && (
                <span className="self-center px-3 py-1 rounded-full text-xs font-bold bg-or text-white mb-2">POPULAIRE</span>
              )}
              <p className="text-sm" style={{ color: '#a0aec0' }}>{pack.name}</p>
              <p className="text-xs text-center mt-1" style={{ color: '#a0aec0' }}>
                {pack.credits === null ? 'Crédits illimités' : `${pack.credits} Crédits`}
              </p>
              <p className="text-white font-bold text-3xl mt-1">{pack.credits ?? '∞'}</p>
              <p className="text-or font-bold text-xl mt-2">{pack.price.toLocaleString('fr-FR')} FCFA</p>
              <Link to="/credits" className="btn-secondaire rounded mt-4">Choisir</Link>
            </div>
          ))}
        </div>
      </section>

      <Separateur />

      {/* SECTION 1.7 — VERSET */}
      <section className="px-4 pt-16 pb-8 text-center">
        <p
          className="reveal arabic text-or font-bold mx-auto"
          style={{ textAlign: 'center', fontSize: 'clamp(1.75rem, 5vw, 3rem)', maxWidth: '48rem' }}
        >
          وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ
        </p>
        <p className="reveal italic max-w-xl mx-auto mt-6" style={{ color: '#a0aec0' }}>
          « Quiconque craint Allah, Il lui trouvera une issue et le pourvoira de là où il ne s'y attend pas. »
        </p>
        <p className="reveal text-or text-sm mt-3">— At-Talaq : 2-3</p>
        <Separateur />
      </section>

      {/* SECTION 1.8 — CTA FINAL */}
      <section className="px-4 pb-16 text-center">
        <h2 className="reveal text-2xl font-bold text-white">Ton chemin spirituel commence ici</h2>
        <p className="reveal max-w-xl mx-auto mt-4" style={{ color: '#a0aec0' }}>
          Utilise les sciences ésotériques islamiques pour comprendre ton destin et ta vocation.
        </p>
        <div className="reveal w-full max-w-md flex flex-col gap-4 mt-8 mx-auto">
          <Link
            to="/auth?mode=register"
            className="w-full rounded font-bold py-3 text-center"
            style={{ background: '#f5c842', color: '#0a0f2e' }}
          >
            Commencer maintenant
          </Link>
          <Link
            to="/contact"
            className="w-full rounded font-bold py-3 text-center text-or"
            style={{ background: 'transparent', border: '1px solid #f5c842' }}
          >
            Nous contacter
          </Link>
        </div>
      </section>
    </div>
  );
}
