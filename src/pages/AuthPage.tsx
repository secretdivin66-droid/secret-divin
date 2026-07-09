import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

type Tab = 'login' | 'signup';

// N'est appliqué qu'à l'inscription : durcir cette règle sur la connexion
// bloquerait les comptes existants dont le mot de passe (créé sous l'ancienne
// règle, 6 caractères minimum) ne la respecte pas.
function validatePassword(password: string): { isValid: boolean; message: string } {
  if (password.length < 8) {
    return { isValid: false, message: 'Minimum 8 caractères requis.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Au moins une majuscule requise.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Au moins un chiffre requis.' };
  }
  return { isValid: true, message: 'Mot de passe valide.' };
}

function getPasswordStrength(pwd: string): { level: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 2) return { level: 1, label: 'Faible', color: '#e53935' };
  if (score <= 3) return { level: 2, label: 'Moyen', color: '#ff9800' };
  return { level: 3, label: 'Fort', color: '#4caf50' };
}

export function AuthPage() {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (tab === 'signup') {
      const check = validatePassword(password);
      if (!check.isValid) {
        setError(check.message);
        return;
      }
    }

    setLoading(true);

    try {
      if (tab === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        navigate(from, { replace: true });
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage('Compte créé ! Vérifie ton email pour confirmer ton inscription.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${from}` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="carte w-full max-w-md rounded-lg">
        <div className="flex mb-6 border-b border-or/20">
          <button
            onClick={() => { setTab('login'); setError(null); setMessage(null); }}
            className={`flex-1 py-3 text-sm font-bold transition ${
              tab === 'login' ? 'text-or border-b-2 border-or' : 'text-gray-400'
            }`}
          >
            Se connecter
          </button>
          <button
            onClick={() => { setTab('signup'); setError(null); setMessage(null); }}
            className={`flex-1 py-3 text-sm font-bold transition ${
              tab === 'signup' ? 'text-or border-b-2 border-or' : 'text-gray-400'
            }`}
          >
            S'inscrire
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
            {tab === 'signup' && password && (
              <div className="mt-2">
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: '#1a1a2e' }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(getPasswordStrength(password).level / 3) * 100}%`,
                      background: getPasswordStrength(password).color,
                    }}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: getPasswordStrength(password).color }}>
                  {getPasswordStrength(password).label}
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {message && <p className="text-green-400 text-sm">{message}</p>}

          <button type="submit" disabled={loading} className="btn-principal rounded disabled:opacity-60">
            {loading ? 'Chargement...' : tab === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        <div className="separateur">
          <span className="flex-1 h-px bg-or/20" />
          <span className="text-xs">ou</span>
          <span className="flex-1 h-px bg-or/20" />
        </div>

        <button onClick={handleGoogleLogin} className="btn-secondaire w-full rounded">
          Continuer avec Google
        </button>
      </div>
    </div>
  );
}
