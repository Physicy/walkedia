// Amis : demandes, liste, recherche. Requêtes en deux temps (friendships
// puis profiles par lot) plutôt qu'une jointure embarquée Supabase, pour ne
// pas dépendre du nom exact des contraintes de clé étrangère générées par
// Postgres (supabase/migrations/0001_init.sql).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface FriendProfile {
  id: string;
  display_name: string | null;
}

export interface FriendRequest {
  id: string;
  profile: FriendProfile;
}

export function useFriends(userId: string | null) {
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
      return;
    }
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      if (error) throw error;

      const counterpartIds = [...new Set((rows || []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)))];
      const profilesById: Record<string, FriendProfile> = {};
      if (counterpartIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', counterpartIds);
        for (const p of profs || []) profilesById[p.id] = p;
      }

      const friendsList: FriendProfile[] = [];
      const inList: FriendRequest[] = [];
      const outList: FriendRequest[] = [];
      for (const r of rows || []) {
        const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
        const profile = profilesById[otherId] || { id: otherId, display_name: null };
        if (r.status === 'accepted') friendsList.push(profile);
        else if (r.status === 'pending' && r.addressee_id === userId) inList.push({ id: r.id, profile });
        else if (r.status === 'pending' && r.requester_id === userId) outList.push({ id: r.id, profile });
      }
      setFriends(friendsList);
      setIncoming(inList);
      setOutgoing(outList);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const searchUsers = useCallback(
    async (query: string): Promise<FriendProfile[]> => {
      if (!userId || !query.trim()) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name')
        .ilike('display_name', `%${query.trim()}%`)
        .neq('id', userId)
        .limit(20);
      return data || [];
    },
    [userId]
  );

  const sendRequest = useCallback(
    async (targetId: string) => {
      if (!userId) return;
      await supabase.from('friendships').insert({ requester_id: userId, addressee_id: targetId });
      await reload();
    },
    [userId, reload]
  );

  const respond = useCallback(
    async (requestId: string, accept: boolean) => {
      await supabase.rpc('respond_to_friend_request', { request_id: requestId, accept });
      await reload();
    },
    [reload]
  );

  return { friends, incoming, outgoing, loading, reload, searchUsers, sendRequest, respond };
}
