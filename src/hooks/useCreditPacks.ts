import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface CreditPack {
  id: string;
  name: string;
  credits: number | null;
  price: number;
  currency: string;
  period: string | null;
  subtitle: string | null;
  description: string | null;
  popular: boolean;
  sort_order: number;
}

// Remplace l'ancien tableau codé en dur PACKS (src/utils/mystique.ts) —
// voir migration 0031, credit_packs porte maintenant chariow_product_id
// (non exposé ici, réservé côté serveur).
export function useCreditPacks() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('credit_packs')
      .select('id, name, credits, price, currency, period, subtitle, description, popular, sort_order')
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return;
        setPacks((data ?? []) as CreditPack[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { packs, loading };
}
