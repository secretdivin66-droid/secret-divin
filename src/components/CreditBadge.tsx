import { useNavigate } from 'react-router-dom';
import { useCredits } from '../hooks/useCredits';

interface Props { userId: string | null; }

export function CreditBadge({ userId }: Props) {
  const { credits } = useCredits(userId);
  const navigate = useNavigate();

  if (credits.loading) return null;

  if (credits.isAdmin) {
    return (
      <span
        onClick={() => navigate('/credits')}
        style={{ background: '#f9a825', color: '#1a237e', padding: '4px 12px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '9999px' }}
      >
        Admin — Accès illimité
      </span>
    );
  }

  if (credits.isUnlimited) {
    return (
      <span
        onClick={() => navigate('/credits')}
        style={{ background: '#2563EB', color: '#ffffff', padding: '4px 12px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '9999px' }}
      >
        Illimité
      </span>
    );
  }

  const isLow = credits.balance <= 3;
  const isEmpty = credits.balance === 0;

  return (
    <span
      onClick={() => navigate('/credits')}
      style={{
        background: isEmpty ? '#e53935' : isLow ? '#e53935' : 'transparent',
        border: isEmpty || isLow ? 'none' : '1px solid #2563EB',
        color: isEmpty || isLow ? 'white' : '#2563EB',
        padding: '4px 12px',
        fontSize: '0.8rem',
        cursor: 'pointer',
        fontWeight: isLow ? 'bold' : 'normal',
        borderRadius: '9999px',
        animation: isLow && !isEmpty ? 'pulse 2s infinite' : 'none',
      }}
    >
      {isEmpty ? '0 crédit' : `${credits.balance} crédits`}
    </span>
  );
}
