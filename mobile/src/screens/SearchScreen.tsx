// Onglet "Classement" : le classement par défaut, avec l'accès aux amis
// derrière une icône plutôt qu'un onglet de plus — la barre du bas n'en a que
// trois (voir TabBar.tsx). Amis et profil d'un autre joueur s'ouvrent en
// plein écran par-dessus, comme le reste des écrans secondaires de l'app.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS } from '../theme';
import { Titre } from '../components/ui';
import { Icone } from '../components/Icones';
import { useFriends } from '../hooks/useFriends';
import { LeaderboardScreen } from './LeaderboardScreen';
import { FriendsScreen } from './FriendsScreen';
import { AutrePlayerScreen } from './AutrePlayerScreen';
import type { LeaderboardRow } from '../hooks/useLeaderboard';

export function SearchScreen({ userId }: { userId: string | null }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const friendsApi = useFriends(userId);
  const [amisOuvert, setAmisOuvert] = useState(false);
  const [joueurOuvert, setJoueurOuvert] = useState<{ row: LeaderboardRow; rang: number } | null>(null);

  if (!userId) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <Titre style={styles.titre}>{t('search.title')}</Titre>
        <Text style={styles.placeholder}>{t('search.loginPrompt')}</Text>
      </View>
    );
  }

  const ami = joueurOuvert ? friendsApi.friends.find((f) => f.id === joueurOuvert.row.user_id) : undefined;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.tete}>
        <Titre style={styles.titre}>{t('search.title')}</Titre>
        <Pressable
          style={styles.rond}
          onPress={() => setAmisOuvert(true)}
          accessibilityRole="button"
          accessibilityLabel={t('search.friendsTab')}
        >
          <Icone nom="ami" size={18} color={COLORS.encre} strokeWidth={1.7} />
          {(friendsApi.incoming.length > 0) && <View style={styles.pastille} />}
        </Pressable>
      </View>

      <LeaderboardScreen
        userId={userId}
        friends={friendsApi.friends}
        onOuvrirJoueur={(row, rang) => setJoueurOuvert({ row, rang })}
        onAllerAmis={() => setAmisOuvert(true)}
      />

      {amisOuvert && (
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={styles.tete}>
            <Pressable style={styles.rond} onPress={() => setAmisOuvert(false)} accessibilityRole="button" accessibilityLabel={t('common.back')}>
              <Icone nom="retour" size={18} color={COLORS.encre} strokeWidth={1.9} />
            </Pressable>
            <Titre style={styles.titre}>{t('search.friendsTab')}</Titre>
          </View>
          <View style={styles.overlayCorps}>
            <FriendsScreen api={friendsApi} />
          </View>
        </View>
      )}

      {joueurOuvert && (
        <AutrePlayerScreen
          joueur={joueurOuvert.row}
          rang={joueurOuvert.rang}
          amiDepuis={ami?.since ?? null}
          onFermer={() => setJoueurOuvert(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1600, backgroundColor: COLORS.papier, paddingBottom: 90 },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  titre: { flex: 1, fontSize: 24 },
  rond: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastille: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.trace,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  placeholder: {
    fontFamily: FONTS.texte,
    fontSize: 13.5,
    color: COLORS.encre2,
    textAlign: 'center',
    marginTop: '35%',
    marginHorizontal: 32,
  },

  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: COLORS.papier },
  overlayCorps: { flex: 1, paddingHorizontal: 20 },
});
