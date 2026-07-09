import { useState } from 'react';
import { WHATSAPP_NUMBER } from '../utils/mystique';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';

const SUJETS = ['Question générale', 'Problème crédits', 'Problème technique', 'Suggestion', 'Partenariat', 'Autre'];

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function ContactPage() {
  useRevealOnScroll();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [sujet, setSujet] = useState(SUJETS[0]);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0e2e' }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Contact</h1>
        <p className="text-center italic mt-3" style={{ color: '#b0b8d4' }}>
          Une question ? Nous sommes là pour t'aider
        </p>

        <Separateur />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* COLONNE 1 — Formulaire */}
          <div className="reveal">
            {sent ? (
              <div className="carte rounded-lg text-center" style={{ background: 'rgba(76,175,80,0.1)', border: '1px solid #4caf50' }}>
                <p className="text-green-400 font-bold">Ton message a bien été envoyé. BarakAllahu fik.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="carte rounded-lg flex flex-col gap-4">
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Nom</label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Sujet</label>
                  <select
                    value={sujet}
                    onChange={(e) => setSujet(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                  >
                    {SUJETS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: '#b0b8d4' }}>Message</label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or resize-y"
                  />
                </div>
                <button type="submit" className="btn-principal w-full rounded">
                  ENVOYER MON MESSAGE
                </button>
              </form>
            )}
          </div>

          {/* COLONNE 2 — Informations */}
          <div className="reveal carte rounded-lg flex flex-col gap-5">
            <h2 className="text-or font-bold text-xl">Nous contacter</h2>

            <button
              onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank', 'noopener,noreferrer')}
              className="rounded font-bold py-3"
              style={{ background: '#25D366', color: 'white' }}
            >
              Discuter sur WhatsApp
            </button>

            <div>
              <p className="text-sm" style={{ color: '#b0b8d4' }}>Email</p>
              <p className="text-white">contact@secretdivin.com</p>
            </div>

            <div>
              <p className="text-sm" style={{ color: '#b0b8d4' }}>Horaires</p>
              <p className="text-white">Disponible 7j/7 — Réponse sous 24h</p>
            </div>

            <Separateur />

            <div className="text-center">
              <p className="arabic text-or text-[1.4em]">وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ</p>
              <p className="italic text-sm mt-2" style={{ color: '#b0b8d4' }}>
                « Et si Mes serviteurs t'interrogent sur Moi, Je suis proche. »
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
