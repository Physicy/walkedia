// Classement : lit la vue `leaderboard` (supabase/migrations/0001_init.sql),
// qui n'expose que id/nom/total de points — jamais les tronçons/carrefours
// précis d'un autre joueur (voir policy RLS sur `progress`).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface LeaderboardRow {
  user_id: string;
  display_name: string | null;
  junction_count: number;
  edge_meters: number;
}

export function useLeaderboard(friendIds: string[] | null) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('leaderboard').select('*').order('junction_count', { ascending: false }).limit(100);
      if (friendIds) query = query.in('user_id', friendIds.length ? friendIds : ['00000000-0000-0000-0000-000000000000']);
      const { data, error } = await query;
      if (!error) setRows(data || []);
    } finally {
      setLoading(false);
    }
  }, [friendIds]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rows, loading, reload };
}
