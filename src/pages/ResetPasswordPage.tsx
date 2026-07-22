import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { validatePassword, getPasswordStrength, translateAuthError } from '../utils/auth';
import { PasswordVisibilityToggle } from '../components/PasswordVisibilityToggle';

type LinkState = 'checking' | 'valid' | 'invalid';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // supabase-js détecte automatiquement le token de récupération présent
    // dans l'URL (detectSessionInUrl) et émet PASSWORD_RECOVERY dès que la
    // session temporaire est prête — ce qui peut arriver juste après le
    // premier rendu, d'où l'écoute en plus du check immédiat.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setLinkState('valid');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLinkState('valid');
        return;
      }
      // Laisse une seconde à detectSessionInUrl pour traiter le hash avant
      // de conclure que le lien est invalide/expiré.
      setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session: retrySession } }) => {
          setLinkState(retrySession ? 'valid' : 'invalid');
        });
      }, 1200);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      setError(passwordCheck.message);
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(translateAuthError(updateError.message));
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
  }

  const strength = password ? getPasswordStrength(password) : null;

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="carte w-full max-w-md rounded-lg">
        <h1 className="text-or font-bold text-xl mb-6 text-center">Réinitialiser le mot de passe</h1>

        {linkState === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-8 h-8 border-4 border-or border-t-transparent rounded-full animate-spin" />
            <p className="text-sm" style={{ color: '#a0aec0' }}>Vérification du lien...</p>
          </div>
        )}

        {linkState === 'invalid' && (
          <div className="rounded-lg p-4 text-center" style={{ background: '#3a1b1b', border: '1px solid #e53935' }}>
            <p className="text-red-400 text-sm mb-4">
              Ce lien de réinitialisation est invalide ou a expiré. Merci d'en demander un nouveau.
            </p>
            <Link to="/forgot-password" className="btn-principal rounded inline-block">
              Demander un nouveau lien
            </Link>
          </div>
        )}

        {linkState === 'valid' && !success && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nouveau mot de passe</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
              <PasswordVisibilityToggle checked={showPassword} onChange={setShowPassword} />
              {strength && (
                <div className="mt-2">
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2e' }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${(strength.level / 3) * 100}%`, background: strength.color }}
                    />
                  </div>
                  <p className="text-xs mt-1" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Confirmer le mot de passe</label>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
              />
              <PasswordVisibilityToggle checked={showConfirmPassword} onChange={setShowConfirmPassword} />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading} className="btn-principal rounded disabled:opacity-60">
              {loading ? 'Enregistrement...' : 'Réinitialiser le mot de passe'}
            </button>
          </form>
        )}

        {success && (
          <div className="rounded-lg p-4 text-center" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
            <p className="text-green-400 text-sm">Mot de passe mis à jour. Redirection vers ton tableau de bord...</p>
          </div>
        )}
      </div>
    </div>
  );
}
