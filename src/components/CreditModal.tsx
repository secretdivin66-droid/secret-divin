import { Link } from 'react-router-dom';
import { PACKS, WHATSAPP_NUMBER } from '../utils/mystique';

interface Props { toolName: string; balance: number; onClose: () => void; }

export function CreditModal({ toolName, balance, onClose }: Props) {
  function openWhatsApp(pack: typeof PACKS[0]) {
    const message = encodeURIComponent(
      `Bonjour, je veux acheter le pack ${pack.name} — ${pack.credits ?? '∞'} crédits pour ${pack.price} FCFA.`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}>
      <div style={{ background:'#0d1545', border:'1px solid #f5c842', borderRadius:'8px', padding:'32px', maxWidth:'500px', width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
        <h2 style={{ color:'#f5c842', fontWeight:'bold', fontSize:'1.3rem', marginBottom:'16px' }}>Crédits insuffisants</h2>
        <p style={{ color:'#a0aec0', marginBottom:'8px' }}>Tu as <strong style={{ color:'white' }}>{balance} crédit(s)</strong>.</p>
        <p style={{ color:'#a0aec0', marginBottom:'24px' }}>Il te faut <strong style={{ color:'#f5c842' }}>2 crédits</strong> pour utiliser <strong style={{ color:'white' }}>{toolName}</strong>.</p>

        <div style={{ display:'grid', gap:'10px', marginBottom:'20px' }}>
          {PACKS.filter(p => p.id !== 'unlimited').map(pack => (
            <div
              key={pack.id}
              style={{
                background:'#0a0f2e',
                border: pack.popular ? '2px solid #f5c842' : '1px solid rgba(245,200,66,0.2)',
                padding:'14px 16px', display:'flex', justifyContent:'space-between',
                alignItems:'center', borderRadius:'4px', cursor:'pointer'
              }}
              onClick={() => openWhatsApp(pack)}
            >
              <div>
                {pack.popular && (
                  <span style={{ background:'#f5c842', color:'#ffffff', fontSize:'0.6rem', padding:'2px 8px', fontWeight:'bold', display:'block', marginBottom:'4px', borderRadius: '9999px', width: 'fit-content' }}>
                    POPULAIRE
                  </span>
                )}
                <span style={{ color:'white', fontWeight:'bold' }}>{pack.name}</span>
                <span style={{ color:'#a0aec0', fontSize:'0.85em', marginLeft:'8px' }}>{pack.credits} crédits</span>
              </div>
              <div style={{ textAlign:'right' }}>
                <strong style={{ color:'#f5c842', display:'block' }}>{pack.price.toLocaleString('fr-FR')} FCFA</strong>
                <span style={{ color:'#a0aec0', fontSize:'0.75rem' }}>WhatsApp</span>
              </div>
            </div>
          ))}
        </div>

        <Link to="/credits" style={{ display:'block', background:'#f5c842', color:'#ffffff', textAlign:'center', padding:'12px', fontWeight:'bold', textDecoration:'none', marginBottom:'12px', borderRadius:'4px' }}>
          Voir tous les packs
        </Link>
        <button onClick={onClose} style={{ width:'100%', background:'transparent', border:'1px solid #f5c842', color:'#f5c842', padding:'10px', cursor:'pointer', borderRadius:'4px' }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
