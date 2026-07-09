import { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBar } from './MobileBar';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

export function Layout() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/auth');
  }
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ne s'applique qu'aux sessions connectées : un visiteur anonyme n'a rien
  // à déconnecter, et démarrer ce minuteur pour lui n'aurait aucun effet
  // utile.
  useEffect(() => {
    if (!user) return;

    function resetInactivityTimer() {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/auth');
      }, INACTIVITY_TIMEOUT);
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((event) => document.addEventListener(event, resetInactivityTimer));
    resetInactivityTimer();

    return () => {
      events.forEach((event) => document.removeEventListener(event, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} profile={profile} onSignOut={handleSignOut} />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      {user && <MobileBar />}
    </div>
  );
}
