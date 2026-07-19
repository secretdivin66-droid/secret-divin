import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { TOOL_COSTS } from '../utils/mystique';
import type { SpendCreditsResult } from '../utils/mystique';

interface Credits {
  balance: number;
  isUnlimited: boolean;
  isAdmin: boolean;
  expiresAt: string | null;
  loading: boolean;
}

export function useCredits(userId: string | null) {
  const [credits, setCredits] = useState<Credits>({
    balance: 0, isUnlimited: false, isAdmin: false, expiresAt: null, loading: true
  });

  const loadCredits = useCallback(async () => {
    if (!userId) return;

    const [{ data: creditData }, { data: subData }, { data: roleData }] = await Promise.all([
      supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle(),
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);

    setCredits({
      balance: creditData?.balance ?? 0,
      isUnlimited: !!subData,
      isAdmin: roleData?.role === 'admin',
      expiresAt: subData?.expires_at ?? null,
      loading: false,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadCredits();
  }, [userId, loadCredits]);

  // Débit atomique et journalisé côté serveur (fonction SECURITY DEFINER
  // spend_credits, voir supabase/schema.sql) : ce hook ne peut plus écrire
  // directement dans user_credits — la seule façon de faire baisser un
  // solde est cette fonction, qui vérifie l'auth, le coût réel et le solde
  // suffisant côté serveur. Appeler deductCredits() seulement APRÈS que
  // l'opération à facturer ait réussi : comme rien n'est débité avant le
  // succès, aucune fonction de remboursement n'est nécessaire.
  async function deductCredits(tool: string, description: string): Promise<boolean> {
    if (!userId) return false;
    if (TOOL_COSTS[tool] === 0) return true;
    if (credits.isAdmin || credits.isUnlimited) return true;

    const { data, error } = await supabase
      .rpc('spend_credits', { p_tool: tool, p_description: description })
      .single();
    const result = data as SpendCreditsResult | null;

    if (error || !result?.success) {
      if (result) setCredits((prev) => ({ ...prev, balance: result.balance }));
      return false;
    }

    setCredits((prev) => ({ ...prev, balance: result.balance }));
    return true;
  }

  function canUseTool(tool: string): boolean {
    if (TOOL_COSTS[tool] === 0) return true;
    if (credits.isAdmin || credits.isUnlimited) return true;
    return credits.balance >= 2;
  }

  return { credits, loadCredits, deductCredits, canUseTool };
}
