import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCredits } from '../hooks/useCredits';
import { supabase } from '../lib/supabaseClient';
import { PACKS, WHATSAPP_NUMBER } from '../utils/mystique';

const OUTIL_COSTS_DISPLAY: { label: string; labelArabic?: string; cost: string; free: boolean }[] = [
  { label: 'Poids mystique', cost: 'GRATUIT', free: true },
  { label: 'Tutoriels', labelArabic: 'الدروس التعليمية', cost: 'GRATUIT', free: true },
  { label: 'Secret de ton Destin', labelArabic: 'سر قدرك', cost: '2 crédits', free: false },
  { label: 'Attraper ou Réconcilier', labelArabic: 'الجذب أو المصالحة', cost: '2 crédits', free: false },
  { label: 'Secrets mystiques', labelArabic: 'الأسرار الروحانية', cost: '2 crédits', free: false },
  { label: 'Géomancie', labelArabic: 'علم الرمل', cost: '2 crédits', free: false },
  { label: 'Compatibilité', labelArabic: 'التوافق', cost: '2 crédits', free: false },
  { label: 'Carrés magiques', labelArabic: 'المربعات السحرية', cost: '2 crédits', free: false },
  { label: 'Interprétation des Rêves', labelArabic: 'تفسير الأحلام', cost: '2 crédits', free: false },
  { label: 'Secrets des Plantes', labelArabic: 'أسرار النباتات', cost: '2 crédits', free: false },
  { label: 'Secret de ton Jour', labelArabic: 'سر يومك', cost: '2 crédits', free: false },
  { label: 'Formation (leçon)', labelArabic: 'التكوين', cost: '2 crédits', free: false },
];

const STEPS = [
  { number: '01', title: 'Choisis ton pack', text: 'Sélectionne le pack de crédits qui correspond à tes besoins.' },
  { number: '02', title: 'Contacte-nous sur WhatsApp', text: 'Un message pré-rempli s\'ouvre automatiquement avec les détails de ton pack.' },
  { number: '03', title: 'Reçois tes crédits', text: 'Après confirmation du paiement, tes crédits sont activés sur ton compte.' },
];

const PAYMENT_METHODS = ['Orange Money', 'Wave', 'Moov Money', 'MTN Mobile Money', 'Carte bancaire', 'Visa / Mastercard'];

const FAQ = [
  { q: 'Est-ce que les crédits expirent ?', a: "Non. Tes crédits n'expirent jamais." },
  { q: 'Comment fonctionne le paiement ?', a: 'Via Mobile Money. Tu nous contactes sur WhatsApp et nous activons tes crédits après confirmation du paiement.' },
  { q: 'Puis-je acheter plusieurs packs ?', a: 'Oui. Tes crédits s\'accumulent.' },
  { q: 'Le poids mystique est-il vraiment gratuit ?', a: 'Oui. Toujours gratuit pour tous les utilisateurs.' },
  { q: 'Comment fonctionne le plan Illimité ?', a: 'Accès à tous les outils sans limite pendant 1 mois, renouvelable via WhatsApp.' },
  { q: 'Que faire si mes crédits ne sont pas arrivés ?', a: 'Contacte-nous sur WhatsApp avec la preuve de paiement.' },
];

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  balance_after: number | null;
  created_at: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} à ${hours}:${minutes}`;
}

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function CreditsPage() {
  const { user } = useAuth();
  const { credits } = useCredits(user?.id ?? null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setTransactions(data ?? []));
  }, [user]);

  function handleBuyPack(pack: typeof PACKS[0]) {
    const message = encodeURIComponent(
      'Bonjour, je veux acheter le pack ' + pack.name + ' — ' + (pack.credits ?? '∞') + ' crédits pour ' + pack.price + ' FCFA.' +
      '\nMon email : ' + (user?.email ?? '')
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-6xl mx-auto">
        {/* SECTION A — EN-TÊTE */}
        <h1 className="text-center font-bold text-or text-[2rem]">Nos Offres</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Recharge tes crédits et accède à tous les outils mystiques
        </p>

        {user && (
          <div className="carte rounded-lg text-center max-w-[400px] mx-auto mt-8">
            {credits.isUnlimited ? (
              <>
                <p className="text-or font-bold text-[3rem]">Illimité</p>
                {credits.expiresAt && (
                  <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>
                    Expire le {formatDate(credits.expiresAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-or font-bold text-[4rem]">{credits.balance} crédits</p>
            )}
          </div>
        )}

        <Separateur />

        {/* SECTION B — Packs de Crédits */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Packs de Crédits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {PACKS.map((pack) => (
            <div
              key={pack.id}
              className="rounded-lg p-5 flex flex-col text-center"
              style={{
                background: '#0d1545',
                border: pack.popular ? '2px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
              }}
            >
              {pack.popular && (
                <span className="self-center px-3 py-1 rounded-full text-xs font-bold bg-or text-white mb-3">
                  POPULAIRE
                </span>
              )}
              <p className="text-sm" style={{ color: '#a0aec0' }}>{pack.name}</p>
              <p className="text-white font-bold text-[2.5rem] mt-1">{pack.credits ?? '∞'}</p>
              <p className="text-sm" style={{ color: '#a0aec0' }}>crédits</p>
              <p className="text-or font-bold text-[1.4rem] mt-3">{pack.price.toLocaleString('fr-FR')} FCFA</p>
              <p className="italic text-sm mt-2 flex-1" style={{ color: '#a0aec0' }}>{pack.description}</p>
              <button
                onClick={() => handleBuyPack(pack)}
                className="rounded font-bold mt-4 py-2"
                style={{ background: '#25D366', color: 'white' }}
              >
                Acheter via WhatsApp
              </button>
            </div>
          ))}
        </div>

        <Separateur />

        {/* SECTION C — Coût par Outil */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Coût par Consultation</h2>
        <div className="overflow-x-auto">
          <div className="carte rounded-lg min-w-[400px]">
            {OUTIL_COSTS_DISPLAY.map((row, i) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-3"
                style={i > 0 ? { borderTop: '1px solid rgba(245,200,66,0.1)' } : undefined}
              >
                <span>
                  {row.labelArabic && (
                    <span className="arabic block font-bold text-[1.1em]" style={{ color: '#f5c842' }}>
                      {row.labelArabic}
                    </span>
                  )}
                  <span className="text-white block">{row.label}</span>
                </span>
                <span className={`font-bold ${row.free ? 'text-green-400' : 'text-or'}`}>{row.cost}</span>
              </div>
            ))}
          </div>
        </div>

        <Separateur />

        {/* SECTION D — Comment ça marche */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Comment Acheter des Crédits ?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div key={step.number} className="carte rounded-lg text-center">
              <p className="text-or font-bold text-[1.6rem]">{step.number}</p>
              <p className="text-white font-bold mt-2">{step.title}</p>
              <p className="text-sm mt-2" style={{ color: '#a0aec0' }}>{step.text}</p>
            </div>
          ))}
        </div>

        <Separateur />

        {/* SECTION E — Moyens de Paiement */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Moyens de Paiement</h2>
        <div className="grid grid-cols-2 md:flex md:flex-wrap md:justify-center gap-3">
          {PAYMENT_METHODS.map((method) => (
            <span
              key={method}
              className="px-4 py-2 text-center text-sm text-white"
              style={{ background: '#0d1545', border: '1px solid #f5c842', borderRadius: '20px' }}
            >
              {method}
            </span>
          ))}
        </div>

        {user && (
          <>
            <Separateur />

            {/* SECTION F — Historique Transactions */}
            <h2 className="text-or font-bold text-center text-xl mb-6">Mon Historique de Crédits</h2>
            {transactions.length === 0 ? (
              <p className="text-center" style={{ color: '#a0aec0' }}>Aucune transaction pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="carte rounded-lg min-w-[600px]">
                  <div className="grid grid-cols-4 gap-3 pb-3 font-bold text-sm" style={{ color: '#a0aec0', borderBottom: '1px solid rgba(245,200,66,0.2)' }}>
                    <span>Date</span>
                    <span>Description</span>
                    <span className="text-right">Montant</span>
                    <span className="text-right">Solde après</span>
                  </div>
                  {transactions.map((tx) => {
                    const isPositive = tx.type === 'purchase' || tx.type === 'refund';
                    return (
                      <div key={tx.id} className="grid grid-cols-4 gap-3 py-3 text-sm" style={{ borderBottom: '1px solid rgba(245,200,66,0.1)' }}>
                        <span style={{ color: '#a0aec0' }}>{formatDate(tx.created_at)}</span>
                        <span className="text-white">{tx.description}</span>
                        <span className={`text-right font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : '-'}{Math.abs(tx.amount)}
                        </span>
                        <span className="text-right" style={{ color: '#a0aec0' }}>{tx.balance_after ?? '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <Separateur />

        {/* SECTION G — FAQ */}
        <h2 className="text-or font-bold text-center text-xl mb-6">Questions Fréquentes</h2>
        <div className="flex flex-col gap-3 max-w-[700px] mx-auto">
          {FAQ.map((item, i) => (
            <div key={i} className="carte rounded-lg">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left flex items-center justify-between text-white font-bold"
              >
                {item.q}
                <span className="text-or">{openFaq === i ? '—' : '+'}</span>
              </button>
              {openFaq === i && (
                <p className="mt-3 text-sm" style={{ color: '#a0aec0' }}>{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
