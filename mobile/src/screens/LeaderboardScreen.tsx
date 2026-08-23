import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../theme';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { FriendProfile } from '../hooks/useFriends';

export function LeaderboardScreen({ userId, friends }: { userId: string; friends: FriendProfile[] }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const friendIds = scope === 'friends' ? friends.map((f) => f.id).concat(userId) : null;
  const { rows, loading } = useLeaderboard(friendIds);

  return (
    <View style={styles.wrap}>
      <View style={styles.scopeRow}>
        <ScopeBtn label={t('leaderboard.allPlayers')} active={scope === 'all'} onPress={() => setScope('all')} />
        <ScopeBtn label={t('leaderboard.friendsScope')} active={scope === 'friends'} onPress={() => setScope('friends')} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accentCyan} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{scope === 'friends' ? t('leaderboard.addFriendsPrompt') : t('leaderboard.noOneYet')}</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.user_id} style={[styles.row, r.user_id === userId && styles.rowSelf]}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {r.display_name || t('leaderboard.defaultPlayerName')}
              {r.user_id === userId ? t('leaderboard.youSuffix') : ''}
            </Text>
            <Text style={styles.pts}>{t('leaderboard.pointsCount', { count: r.junction_count })}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function ScopeBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.scopeBtn, active && styles.scopeBtnActive]} onPress={onPress}>
      <Text style={[styles.scopeBtnText, active && styles.scopeBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scopeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  scopeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  scopeBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  scopeBtnTextActive: { color: '#fff' },
  empty: { color: COLORS.textDim, textAlign: 'center', marginTop: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  rowSelf: { backgroundColor: 'rgba(34,211,238,0.08)', borderRadius: 8 },
  rank: { width: 24, color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  name: { flex: 1, color: COLORS.text, fontSize: 14 },
  pts: { color: COLORS.accentGreen, fontWeight: '600', fontSize: 13 },
});
