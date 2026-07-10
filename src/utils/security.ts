// Utilitaires de sécurité génériques. Voir le résumé de conversation pour
// ce qui n'a délibérément PAS été implémenté ici (protection CSRF câblée,
// clé Gemini côté client, policies RLS) et pourquoi.

export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

export function sanitizeForAI(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/\$\{.*?\}/g, '')
    .replace(/`/g, '')
    .trim()
    .substring(0, 2000);
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function isValidName(name: string): boolean {
  const nameRegex = /^[\p{L}\s\-'.]{1,100}$/u;
  return nameRegex.test(name.trim());
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[+]?[0-9\s\-().]{6,20}$/;
  return phoneRegex.test(phone.trim());
}

// Garde-fou client uniquement (fast-fail UX : évite un aller-retour réseau
// pour un usage manifestement abusif). Ne remplace pas une vraie limite —
// voir check_gemini_rate_limit() côté serveur (supabase/schema.sql), qui est
// la seule limite qu'un client ne peut pas contourner en appelant l'API
// directement.
const callTimestamps: Record<string, number[]> = {};

export function checkRateLimit(
  key: string,
  maxCalls: number = 5,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const timestamps = callTimestamps[key] || [];
  const recentCalls = timestamps.filter((t) => now - t < windowMs);

  if (recentCalls.length >= maxCalls) return false;

  callTimestamps[key] = [...recentCalls, now];
  return true;
}

// Génère un token CSRF et le stocke en sessionStorage. Fourni pour
// compatibilité/usage futur, mais NON câblé dans les requêtes de l'app :
// voir le résumé de conversation pour pourquoi ce ne serait que du décor
// dans cette architecture (auth par Bearer token, jamais par cookie).
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function setCSRFToken(): string {
  const token = generateCSRFToken();
  sessionStorage.setItem('csrf_token', token);
  return token;
}

export function getCSRFToken(): string | null {
  return sessionStorage.getItem('csrf_token');
}

// Validation générique de champs de formulaire (requis, longueur, markup
// manifestement malveillant). Ne cherche PAS de motifs SQL (SELECT/DROP
// TABLE/UNION...) : cette appli n'utilise que le client Supabase avec
// requêtes paramétrées, jamais de SQL construit à la main, donc ces motifs
// ne protègent rien ici et ne feraient que rejeter à tort du texte légitime
// (ex: un rêve qui mentionne "il a sélectionné un document").
export function validateFormInputs(
  inputs: Record<string, string>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const markupPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i];

  Object.entries(inputs).forEach(([key, value]) => {
    if (!value || !value.trim()) {
      errors[key] = 'Ce champ est requis.';
      return;
    }
    if (value.trim().length < 2) {
      errors[key] = 'Minimum 2 caractères.';
      return;
    }
    if (value.length > 500) {
      errors[key] = 'Maximum 500 caractères.';
      return;
    }

    const hasMarkup = markupPatterns.some((pattern) => pattern.test(value));
    if (hasMarkup) errors[key] = 'Contenu invalide détecté.';
  });

  return { isValid: Object.keys(errors).length === 0, errors };
}
