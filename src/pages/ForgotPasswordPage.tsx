import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { isValidEmail } from '../utils/security';
import { translateAuthError } from '../utils/auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError('Adresse email invalide.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (resetError) {
      setError(translateAuthError(resetError.message));
      return;
    }

    // Même message que l'email existe ou non dans le système : ne jamais
    // permettre à un visiteur de deviner quels emails ont un compte.
    setSent(true);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="carte w-full max-w-md rounded-lg">
        <h1 className="text-or font-bold text-xl mb-2 text-center">Mot de passe oublié</h1>
        <p className="text-sm text-center mb-6" style={{ color: '#a0aec0' }}>
          Indique ton email, on t'envoie un lien pour réinitialiser ton mot de passe.
        </p>

        {sent ? (
          <div className="rounded-lg p-4 text-center" style={{ background: '#1b3a1f', border: '1px solid #4caf50' }}>
            <p className="text-green-400 text-sm">
              Si un compte existe avec cet email, un lien de réinitialisation vient de t'être envoyé. Vérifie ta boîte de réception.
            </p>
          </div>
        ) : (
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

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button type="submit" disabled={loading} className="btn-principal rounded disabled:opacity-60">
              {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-6">
          <Link to="/auth" className="text-or hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
