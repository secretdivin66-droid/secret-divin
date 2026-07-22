import { useState } from 'react';
import { Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { isValidEmail, isValidName } from '../utils/security';
import { validatePassword, getPasswordStrength, translateAuthError } from '../utils/auth';
import { PasswordVisibilityToggle } from '../components/PasswordVisibilityToggle';

type Tab = 'login' | 'signup';

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

export function AuthPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  // Redirige loin de /auth un utilisateur déjà connecté (ex: revient sur
  // cette page via l'historique du navigateur) au lieu de lui montrer le
  // formulaire de connexion alors qu'il est déjà authentifié.
  if (!authLoading && user) {
    return <Navigate to={from} replace />;
  }

  function validateSignupFields(): boolean {
    const errors: FieldErrors = {};

    if (!isValidName(firstName)) errors.firstName = 'Prénom requis (2 à 100 caractères).';
    if (!isValidName(lastName)) errors.lastName = 'Nom requis (2 à 100 caractères).';
    if (!isValidEmail(email)) errors.email = 'Adresse email invalide.';

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) errors.password = passwordCheck.message;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setFieldErrors({});

    if (tab === 'signup') {
      if (!validateSignupFields()) return;
    } else if (!isValidEmail(email)) {
      setFieldErrors({ email: 'Adresse email invalide.' });
      return;
    }

    setLoading(true);

    try {
      if (tab === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        navigate(from, { replace: true });
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { first_name: firstName.trim(), last_name: lastName.trim() },
          },
        });
        if (signUpError) throw signUpError;
        setMessage('Compte créé. Vérifie ton email pour confirmer ton inscription avant de te connecter.');
        setTab('login');
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? translateAuthError(err.message) : 'Une erreur est survenue.');
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
    if (oauthError) setError(translateAuthError(oauthError.message));
  }

  function switchTab(newTab: Tab) {
    setTab(newTab);
    setError(null);
    setMessage(null);
    setFieldErrors({});
  }

  const strength = tab === 'signup' && password ? getPasswordStrength(password) : null;

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="carte w-full max-w-md rounded-lg">
        <div className="flex mb-6 border-b border-or/20">
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-3 text-sm font-bold transition ${
              tab === 'login' ? 'text-or border-b-2 border-or' : 'text-gray-400'
            }`}
          >
            Se connecter
          </button>
          <button
            onClick={() => switchTab('signup')}
            className={`flex-1 py-3 text-sm font-bold transition ${
              tab === 'signup' ? 'text-or border-b-2 border-or' : 'text-gray-400'
            }`}
          >
            S'inscrire
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {tab === 'signup' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Prénom</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                />
                {fieldErrors.firstName && <p className="text-red-400 text-xs mt-1">{fieldErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
                />
                {fieldErrors.lastName && <p className="text-red-400 text-xs mt-1">{fieldErrors.lastName}</p>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
            {fieldErrors.email && <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-gray-400">Mot de passe</label>
              {tab === 'login' && (
                <Link to="/forgot-password" className="text-xs text-or hover:underline">
                  Mot de passe oublié ?
                </Link>
              )}
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bleu border border-or/30 rounded px-3 py-2 text-white focus:outline-none focus:border-or"
            />
            <PasswordVisibilityToggle checked={showPassword} onChange={setShowPassword} />
            {fieldErrors.password && <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>}
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
