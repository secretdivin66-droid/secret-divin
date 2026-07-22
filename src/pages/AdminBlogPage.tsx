import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { BlogAdminPanel } from '../components/BlogAdminPanel';

function Separateur() {
  return (
    <div className="separateur">
      <span>———</span>
      <span>✦</span>
      <span>———</span>
    </div>
  );
}

export function AdminBlogPage() {
  const { loading, user, profile } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f2e' }}>
        <div style={{ color: '#f5c842', fontSize: '1.2rem' }}>Chargement...</div>
      </div>
    );
  }

  if (!user || !profile?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Gestion du Blog</h1>
        <p className="text-center italic mt-3" style={{ color: '#a0aec0' }}>
          Créer, modifier et publier les articles de Secret Divin
        </p>

        <Separateur />

        <BlogAdminPanel />
      </div>
    </div>
  );
}
