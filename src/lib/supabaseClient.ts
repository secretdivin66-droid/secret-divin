import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isRealUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 3;
  } catch {
    return false;
  }
}

// Vraies clés Supabase : URL http(s) valide + clé anon suffisamment longue
// (les valeurs placeholder de .env.example, "ton_url"/"ta_cle_anon", ne
// passent ni l'une ni l'autre condition).
export const isSupabaseConfigured = isRealUrl(supabaseUrl) && !!supabaseAnonKey && supabaseAnonKey.length >= 20;

const MOCK_ERROR = {
  message: 'Supabase non configuré : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants ou invalides dans .env.',
  code: 'MOCK_NOT_CONFIGURED',
};

// Chaînable et "thenable" : n'importe quelle suite d'appels
// (.select().eq().order().single()...) retourne toujours ce même proxy,
// et l'awaiter résout systématiquement vers { data: null, error }. Couvre
// toute la surface utilisée par ce projet (from/select/eq/order/limit/gt/
// single/insert/update/upsert/delete/rpc...) sans avoir à lister chaque
// méthode une par une, et reste sûr si une méthode supplémentaire est
// utilisée plus tard.
function createMockQueryBuilder(): unknown {
  const resolved = Promise.resolve({ data: null, error: MOCK_ERROR });
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') return resolved.then.bind(resolved);
      if (prop === 'catch') return resolved.catch.bind(resolved);
      if (prop === 'finally') return resolved.finally.bind(resolved);
      return () => createMockQueryBuilder();
    },
  };
  return new Proxy({}, handler);
}

function createMockSupabaseClient(): SupabaseClient {
  console.warn(
    '[Secret Divin] Supabase non configuré — mode développement sans backend. ' +
      'Les pages publiques s\'affichent normalement ; tout ce qui nécessite un compte ou des données restera vide. ' +
      'Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env pour activer le backend.'
  );

  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: (_callback: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: MOCK_ERROR }),
      signUp: async () => ({ data: { user: null, session: null }, error: MOCK_ERROR }),
      signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: MOCK_ERROR }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => createMockQueryBuilder(),
    rpc: (_fn: string, _params?: unknown) => createMockQueryBuilder(),
  };

  return mockClient as unknown as SupabaseClient;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabaseClient();
