import { supabase } from '../lib/supabaseClient';

// Vérification directe du rôle, pour les pages de consultation qui gèrent
// leur propre vérification de crédits inline (getUser + user_credits +
// spend_credits) plutôt que de passer par useAuth/useCredits — évite de
// forcer un refactor de ces pages pour cette seule vérification.
export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  return data?.role === 'admin';
}
