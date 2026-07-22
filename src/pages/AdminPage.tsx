import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ABONNEMENT_PRIX_FCFA } from '../utils/marabouts';
import type { Marabout } from '../utils/marabouts';
import { BlogAdminPanel } from '../components/BlogAdminPanel';

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('fr-FR');
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

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'blog' | 'marabouts'>('blog');

  const [marabouts, setMarabouts] = useState<Marabout[]>([]);
  const [maraboutActionLoading, setMaraboutActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadMarabouts();
  }, []);

  async function loadMarabouts() {
    const { data } = await supabase.from('marabouts').select('*').order('created_at', { ascending: false });
    setMarabouts((data as Marabout[]) ?? []);
  }

  async function handleValidateMarabout(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('verify_marabout', { p_marabout_id: m.id });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleActivateSubscription(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('activate_marabout_subscription', { p_marabout_id: m.id });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleToggleMaraboutActive(m: Marabout) {
    setMaraboutActionLoading(m.id);
    try {
      await supabase.rpc('set_marabout_active', { p_marabout_id: m.id, p_is_active: !m.is_active });
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  async function handleDeleteMarabout(m: Marabout) {
    if (!window.confirm(`Supprimer le profil de "${m.nom_complet}" ?`)) return;
    setMaraboutActionLoading(m.id);
    try {
      await supabase.from('marabouts').delete().eq('id', m.id);
      await loadMarabouts();
    } finally {
      setMaraboutActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: '#0a0f2e' }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-center font-bold text-or text-[2rem]">Administration</h1>

        <Separateur />

        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('blog')}
            className={`px-4 py-2 rounded-full text-sm font-bold ${activeTab === 'blog' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}
          >
            Blog
          </button>
          <button
            onClick={() => setActiveTab('marabouts')}
            className={`px-4 py-2 rounded-full text-sm font-bold ${activeTab === 'marabouts' ? 'bg-or text-white' : 'border border-or text-or bg-transparent'}`}
          >
            Marabouts
          </button>
        </div>

        {activeTab === 'blog' && <BlogAdminPanel />}

        {activeTab === 'marabouts' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.length}</p>
                <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>marabouts inscrits</p>
              </div>
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.filter((m) => m.is_verified).length}</p>
                <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>marabouts validés</p>
              </div>
              <div className="carte rounded-lg text-center">
                <p className="text-or font-bold text-2xl">{marabouts.filter((m) => m.abonnement_actif).length}</p>
                <p className="text-sm mt-1" style={{ color: '#a0aec0' }}>
                  abonnements actifs — {marabouts.filter((m) => m.abonnement_actif).length * ABONNEMENT_PRIX_FCFA} FCFA/mois
                </p>
              </div>
            </div>

            {marabouts.length === 0 ? (
              <p className="text-center" style={{ color: '#a0aec0' }}>Aucun marabout inscrit pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="carte rounded-lg min-w-[800px]">
                  <div className="grid grid-cols-6 gap-3 pb-3 font-bold text-sm" style={{ color: '#a0aec0', borderBottom: '1px solid rgba(245,200,66,0.2)' }}>
                    <span>Nom</span>
                    <span>Pays</span>
                    <span>Statut</span>
                    <span>Abonnement</span>
                    <span>Vues</span>
                    <span>Actions</span>
                  </div>
                  {marabouts.map((m) => {
                    const statusLabel = !m.is_verified ? 'En attente' : m.is_active ? 'Vérifié actif' : 'Vérifié inactif';
                    const statusColor = !m.is_verified
                      ? { bg: '#3a2410', text: '#ff9800' }
                      : m.is_active
                      ? { bg: '#1b3a1f', text: '#4caf50' }
                      : { bg: '#3a1b1b', text: '#e53935' };
                    const busy = maraboutActionLoading === m.id;
                    return (
                      <div key={m.id} className="grid grid-cols-6 gap-3 py-3 items-center text-sm" style={{ borderBottom: '1px solid rgba(245,200,66,0.1)' }}>
                        <span className="text-white">{m.nom_complet}</span>
                        <span style={{ color: '#a0aec0' }}>{m.pays}</span>
                        <span>
                          <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: statusColor.bg, color: statusColor.text }}>
                            {statusLabel}
                          </span>
                        </span>
                        <span>
                          {m.abonnement_actif ? (
                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#1b3a1f', color: '#4caf50' }}>
                              Actif — {formatDate(m.abonnement_expire_le)}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: '#333', color: '#999' }}>Inactif</span>
                          )}
                        </span>
                        <span style={{ color: '#a0aec0' }}>{m.vues}</span>
                        <span className="flex flex-col gap-1">
                          {!m.is_verified && (
                            <button onClick={() => handleValidateMarabout(m)} disabled={busy} className="text-left hover:underline disabled:opacity-50" style={{ color: '#4caf50' }}>
                              Valider
                            </button>
                          )}
                          {m.is_verified && !m.abonnement_actif && (
                            <button onClick={() => handleActivateSubscription(m)} disabled={busy} className="text-or text-left hover:underline disabled:opacity-50">
                              Activer abonnement
                            </button>
                          )}
                          <button onClick={() => handleToggleMaraboutActive(m)} disabled={busy} className="text-left hover:underline disabled:opacity-50" style={{ color: m.is_active ? '#e53935' : '#4caf50' }}>
                            {m.is_active ? 'Désactiver' : 'Réactiver'}
                          </button>
                          <button onClick={() => handleDeleteMarabout(m)} disabled={busy} className="text-red-400 text-left hover:underline disabled:opacity-50">
                            Supprimer
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
