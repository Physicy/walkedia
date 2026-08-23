// Onglet "Recherche" reconverti en hub social (classement + amis) plutôt que
// d'ajouter de nouveaux onglets — était un simple placeholder vide.

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../theme';
import { useFriends } from '../hooks/useFriends';
import { LeaderboardScreen } from './LeaderboardScreen';
import { FriendsScreen } from './FriendsScreen';

type Mode = 'leaderboard' | 'friends';

export function SearchScreen({ userId }: { userId: string | null }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('leaderboard');
  const friendsApi = useFriends(userId);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('search.title')}</Text>

      {!userId ? (
        <Text style={styles.placeholder}>{t('search.loginPrompt')}</Text>
      ) : (
        <>
          <View style={styles.tabs}>
            <ModeBtn label={t('search.leaderboardTab')} active={mode === 'leaderboard'} onPress={() => setMode('leaderboard')} />
            <ModeBtn label={t('search.friendsTab')} active={mode === 'friends'} onPress={() => setMode('friends')} />
          </View>
          {mode === 'leaderboard' ? (
            <LeaderboardScreen userId={userId} friends={friendsApi.friends} />
          ) : (
            <FriendsScreen api={friendsApi} />
          )}
        </>
      )}
    </View>
  );
}

function ModeBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.modeBtn} onPress={onPress}>
      <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>{label}</Text>
      {active && <View style={styles.modeBtnUnderline} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1600,
    backgroundColor: COLORS.bg,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 90,
  },
  title: { fontSize: 21, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  placeholder: { color: COLORS.textDim, textAlign: 'center', marginTop: '35%' },
  tabs: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  modeBtn: { paddingBottom: 6 },
  modeBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  modeBtnTextActive: { color: COLORS.text },
  modeBtnUnderline: { height: 2, backgroundColor: COLORS.accentCyan, borderRadius: 1, marginTop: 4 },
});
