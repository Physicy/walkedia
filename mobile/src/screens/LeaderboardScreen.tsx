// Classement : lit la vue `leaderboard` (voir useLeaderboard.ts), qui
// n'expose que id/nom/total de points/mètres — jamais le détail d'un autre
// joueur. Le rang, lui, se déduit ici de l'ordre déjà trié de la liste : pas
// une donnée à part, juste une position dans ce qu'on a déjà.
//
// Le classement vide (portée "amis" sans personne) devient une invitation
// plutôt qu'une liste blanche : les deux actions proposées mènent toutes les
// deux à l'onglet Amis, la seule vraie façon d'en ajouter un — pas de bouton
// "inviter" qui n'a rien derrière lui.

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import { Bouton, Corps, Jeton, Titre } from '../components/ui';
import { useLeaderboard, LeaderboardRow } from '../hooks/useLeaderboard';
import type { FriendProfile } from '../hooks/useFriends';

function rangLabel(i: number): string {
  return i === 0 ? '1re' : `${i + 1}e`;
}

export function LeaderboardScreen({
  userId,
  friends,
  onOuvrirJoueur,
  onAllerAmis,
}: {
  userId: string;
  friends: FriendProfile[];
  onOuvrirJoueur: (row: LeaderboardRow, rang: number) => void;
  onAllerAmis: () => void;
}) {
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const friendIds = scope === 'friends' ? friends.map((f) => f.id).concat(userId) : null;
  const { rows, loading } = useLeaderboard(friendIds);

  return (
    <View style={styles.wrap}>
      <View style={styles.segments}>
        <SegBtn label="Tout le monde" active={scope === 'all'} onPress={() => setScope('all')} />
        <SegBtn label="Mes amis" active={scope === 'friends'} onPress={() => setScope('friends')} />
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.trace} style={{ marginTop: 40 }} />
      ) : rows.length === 0 || (scope === 'friends' && rows.length === 1) ? (
        <View style={styles.vide}>
          <Titre style={styles.videTitre}>
            {scope === 'friends' ? 'Tu es seul sur ce classement.' : 'Personne pour le moment.'}
          </Titre>
          <Corps style={styles.videTexte}>
            Walkedia se compare mieux à plusieurs : chacun relève son quartier, et vous voyez qui avance le plus
            vite.
          </Corps>
          <Bouton onPress={onAllerAmis} style={styles.videBouton}>
            Chercher un joueur
          </Bouton>
        </View>
      ) : (
        rows.map((r, i) => {
          const soi = r.user_id === userId;
          return (
            <Pressable
              key={r.user_id}
              style={[styles.ligne, soi && styles.ligneSoi]}
              onPress={() => onOuvrirJoueur(r, i)}
              disabled={soi}
            >
              <Text style={styles.rang}>{i + 1}</Text>
              <Jeton nom={r.display_name} size={30} />
              <View style={styles.qui}>
                <Text style={styles.nom} numberOfLines={1}>
                  {r.display_name || 'Joueur'}
                  {soi && <Text style={styles.etiqMoi}>  toi</Text>}
                </Text>
                <Text style={styles.km}>{(r.edge_meters / 1000).toFixed(1)} km découverts</Text>
              </View>
              <Text style={styles.pts}>{r.junction_count} pt{r.junction_count > 1 ? 's' : ''}</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function SegBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.seg, active && styles.segActif]} onPress={onPress}>
      <Text style={[styles.segTexte, active && styles.segTexteActif]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 4 },
  seg: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
  },
  segActif: { backgroundColor: COLORS.encre, borderColor: COLORS.encre },
  segTexte: { fontFamily: FONTS.texteSemi, fontSize: 12.5, color: COLORS.encre2 },
  segTexteActif: { color: COLORS.surface },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.ligne,
  },
  ligneSoi: { backgroundColor: COLORS.tracePale },
  rang: { width: 18, fontFamily: FONTS.monoSemi, fontSize: 13, color: COLORS.encre3, textAlign: 'center' },
  qui: { flex: 1 },
  nom: { fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  etiqMoi: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.trace, textTransform: 'uppercase' },
  km: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.encre3, marginTop: 2 },
  pts: { fontFamily: FONTS.monoSemi, fontSize: 13, color: COLORS.trace },

  vide: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 56 },
  videTitre: { fontSize: 21, textAlign: 'center' },
  videTexte: { textAlign: 'center', fontSize: 13.5, marginTop: 10 },
  videBouton: { marginTop: 24, width: '100%', maxWidth: 280 },
});
