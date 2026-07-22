import { useState } from 'react';
import { PACKS, PACK_SUBTITLES, WHATSAPP_NUMBER } from '../utils/mystique';

const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

function PackCard({ pack }: { pack: typeof PACKS[0] }) {
  const badge = pack.credits ? `${pack.credits} crédits` : '∞ crédits illimités';
  const price = `${pack.price.toLocaleString('fr-FR')} FCFA${pack.period ? `/${pack.period}` : ''}`;

  return (
    <div
      className="rounded-lg p-6 flex flex-col items-center text-center"
      style={{
        background: '#0d1545',
        border: pack.popular ? '2px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
      }}
    >
      {pack.popular && (
        <span
          className="self-center px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ background: '#f5c842', color: '#0a0f2e' }}
        >
          POPULAIRE
        </span>
      )}
      <h3 className="text-white font-bold text-lg">{pack.name}</h3>
      <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>{PACK_SUBTITLES[pack.id]}</p>
      <p className="text-or font-bold text-[1.6rem] mt-4">{price}</p>
      <span
        className="mt-3 px-4 py-1 rounded-full text-sm font-bold"
        style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid #f5c842', color: '#f5c842' }}
      >
        {badge}
      </span>
      <BuyButton pack={pack} />
    </div>
  );
}

function BuyButton({ pack }: { pack: typeof PACKS[0] }) {
  const [showToast, setShowToast] = useState(false);
  const ctaLabel = pack.credits ? `Recharger ${pack.credits} crédits` : "Activer l'accès illimité";

  return (
    <div className="w-full mt-5">
      <button
        onClick={() => setShowToast(true)}
        className="w-full rounded font-bold py-3"
        style={{ background: '#f5c842', color: '#0a0f2e' }}
      >
        {ctaLabel}
      </button>

      {showToast && (
        <div className="rounded-lg p-3 mt-3 text-center" style={{ background: '#0a0f2e', border: '1px solid #f5c842' }}>
          <p className="text-white text-sm">
            Le paiement en ligne arrive très bientôt. En attendant, écris-nous sur WhatsApp et récupère tes crédits en quelques minutes.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-2 font-bold text-sm"
            style={{ color: '#f5c842' }}
          >
            {WHATSAPP_LINK.replace('https://', '')}
          </a>
        </div>
      )}
    </div>
  );
}

export function CreditsPage() {
  const gridPacks = PACKS.filter((p) => p.id !== 'unlimited');
  const unlimitedPack = PACKS.find((p) => p.id === 'unlimited');

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <h1 className="text-center font-bold text-or text-[2rem]">Des crédits qui ne périment jamais</h1>
        <p className="text-center mt-3 text-white">
          Achète un pack une seule fois. Utilise tes crédits quand tu veux — aucun abonnement, aucune date limite.
        </p>

        <Separateur />

        <h2 className="text-center text-or font-bold text-xl mb-8">Choisis ton pack ✦</h2>

        {/* GRILLE 2x2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {gridPacks.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </div>

        {/* CARTE CENTRÉE — ILLIMITÉ */}
        {unlimitedPack && (
          <div className="max-w-md mx-auto mt-5">
            <PackCard pack={unlimitedPack} />
          </div>
        )}

        <p className="text-center text-sm mt-6" style={{ color: '#a0aec0' }}>
          Paiement unique. Crédits valables à vie. Aucune carte enregistrée, aucun renouvellement automatique.
        </p>
      </div>
    </div>
  );
}
