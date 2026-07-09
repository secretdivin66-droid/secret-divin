// Utilitaires d'authentification partagés entre AuthPage, ForgotPasswordPage
// et ResetPasswordPage — évite de dupliquer la validation de mot de passe et
// la traduction des messages d'erreur Supabase dans chaque page.

export interface PasswordCheck {
  isValid: boolean;
  message: string;
}

// N'est appliqué qu'à l'inscription/réinitialisation : durcir cette règle sur
// la connexion bloquerait les comptes existants dont le mot de passe (créé
// sous l'ancienne règle, 6 caractères minimum) ne la respecte pas.
export function validatePassword(password: string): PasswordCheck {
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

export interface PasswordStrength {
  level: number;
  label: string;
  color: string;
}

export function getPasswordStrength(pwd: string): PasswordStrength {
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

// Supabase renvoie ses erreurs en anglais : on traduit les cas les plus
// fréquents pour une UI cohérente avec le reste du site (français), et on
// laisse passer le message original sinon plutôt que d'inventer une
// traduction hasardeuse.
const ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': "Merci de confirmer ton email avant de te connecter (vérifie ta boîte de réception).",
  'User already registered': 'Un compte existe déjà avec cet email. Essaie de te connecter.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
  'Unable to validate email address: invalid format': 'Adresse email invalide.',
  'Signup requires a valid password': 'Mot de passe requis.',
  'Auth session missing!': 'Session expirée. Merci de te reconnecter.',
};

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return 'Une erreur est survenue. Réessaie dans quelques instants.';
  if (ERROR_TRANSLATIONS[message]) return ERROR_TRANSLATIONS[message];
  if (/rate limit|only request this after/i.test(message)) {
    return 'Merci de patienter quelques instants avant de réessayer.';
  }
  return message;
}

export function buildFullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter((part) => !!part && part.trim().length > 0).join(' ');
}
