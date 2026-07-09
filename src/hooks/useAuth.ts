import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { buildFullName } from '../utils/auth';

interface Profile {
  prenom: string | null;
  nom: string | null;
  fullName: string;
  credits: number;
  isAdmin: boolean;
}

interface AuthState {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile(userId: string) {
      const [{ data: profileRow }, { data: creditsRow }, { data: roleRow }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, display_name').eq('user_id', userId).single(),
        supabase.from('user_credits').select('balance').eq('user_id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId).single(),
      ]);
      if (active) {
        const prenom = profileRow?.first_name || profileRow?.display_name || null;
        const nom = profileRow?.last_name || null;
        setProfile({
          prenom,
          nom,
          fullName: buildFullName(prenom, nom) || profileRow?.display_name || '',
          credits: creditsRow?.balance ?? 0,
          isAdmin: roleRow?.role === 'admin',
        });
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { loading, user, profile, signOut };
}
