import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { loading, user, profile } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0f2e' }}>
        <div style={{ color:'#f5c842', fontSize:'1.2rem' }}>Chargement...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!profile?.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
