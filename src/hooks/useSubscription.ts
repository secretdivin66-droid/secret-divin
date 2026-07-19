import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type PlanId = 'free' | 'premium' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  monthly_credits: number;
  is_unlimited: boolean;
  features: string[];
  sort_order: number;
}

interface SubscriptionState {
  loading: boolean;
  planId: PlanId;
  plan: Plan | null;
  expiresAt: string | null;
  plans: Plan[];
}

const PLAN_RANK: Record<PlanId, number> = { free: 0, premium: 1, pro: 2 };

export function useSubscription(userId: string | null) {
  const [state, setState] = useState<SubscriptionState>({
    loading: true,
    planId: 'free',
    plan: null,
    expiresAt: null,
    plans: [],
  });

  const load = useCallback(async () => {
    const [{ data: plansData }, subResult] = await Promise.all([
      supabase.from('plans').select('*').order('sort_order'),
      userId
        ? supabase
            .from('subscriptions')
            .select('plan_id, expires_at')
            .eq('user_id', userId)
            .eq('is_active', true)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const plans = (plansData ?? []) as Plan[];
    const activePlanId = (subResult.data?.plan_id as PlanId | undefined) ?? 'free';
    const plan = plans.find((p) => p.id === activePlanId) ?? null;

    setState({
      loading: false,
      planId: activePlanId,
      plan,
      expiresAt: subResult.data?.expires_at ?? null,
      plans,
    });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function hasAtLeast(minPlan: PlanId): boolean {
    return PLAN_RANK[state.planId] >= PLAN_RANK[minPlan];
  }

  async function cancelSubscription(): Promise<boolean> {
    const { error } = await supabase.rpc('cancel_own_subscription');
    if (error) return false;
    await load();
    return true;
  }

  return { ...state, reload: load, hasAtLeast, cancelSubscription };
}
