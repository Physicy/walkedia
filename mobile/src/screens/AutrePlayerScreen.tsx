// Profil d'un autre joueur, ouvert depuis le classement.
//
// Dit aussi ce qu'il ne montre pas : le serveur n'expose que id/nom/total de
// points/mètres via la vue `leaderboard` (voir useLeaderboard.ts) — jamais le
// détail des rues d'un autre joueur, jamais son rythme jour par jour (ça
// demanderait ses `completedAt`, protégés par RLS). Le rang affiché est réel
// (la position de cette ligne dans la liste déjà triée), pas deviné.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { Jeton, Mono, Titre } from '../components/ui';
import { Icone } from '../components/Icones';
import type { LeaderboardRow } from '../hooks/useLeaderboard';

export function AutrePlayerScreen({
  joueur,
  rang,
  amiDepuis,
  onFermer,
}: {
  joueur: LeaderboardRow;
  rang: number;
  amiDepuis: string | null;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const depuisFmt = amiDepuis ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(amiDepuis)) : null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.tete}>
        <Pressable style={styles.rond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Retour">
          <Icone nom="retour" size={18} color={COLORS.encre} strokeWidth={1.9} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 26 }} showsVerticalScrollIndicator={false}>
        <View style={styles.jpTete}>
          <Jeton nom={joueur.display_name} size={52} />
          <Titre style={styles.nom}>{joueur.display_name || 'Joueur'}</Titre>
          {depuisFmt && <Text style={styles.depuis}>Amis depuis le {depuisFmt}</Text>}
        </View>

        <View style={styles.grille}>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{joueur.junction_count}</Mono>
            <Text style={styles.caseLabel}>points au total</Text>
          </View>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{(joueur.edge_meters / 1000).toFixed(1)}</Mono>
            <Text style={styles.caseLabel}>km découverts</Text>
          </View>
          <View style={[styles.case, styles.caseFin]}>
            <Mono style={styles.caseValeur}>
              {rang + 1}
              <Text style={styles.caseSup}>{rang === 0 ? 're' : 'e'}</Text>
            </Mono>
            <Text style={styles.caseLabel}>au classement</Text>
          </View>
        </View>

        <View style={styles.noteSys}>
          <Icone nom="bouclier" size={16} color={COLORS.trace} strokeWidth={1.8} />
          <Text style={styles.noteTexte}>
            Walkedia ne partage jamais le détail des rues parcourues. Tu vois son total, pas sa carte. L'inverse est
            vrai aussi.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1900, backgroundColor: COLORS.papier },
  tete: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
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

  jpTete: { alignItems: 'center', paddingHorizontal: 20, marginTop: 6, marginBottom: 22 },
  nom: { fontSize: 22, marginTop: 14, textAlign: 'center' },
  depuis: { fontFamily: FONTS.mono, fontSize: 10.5, color: COLORS.encre3, marginTop: 6, letterSpacing: 0.3 },

  grille: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.ligne, marginHorizontal: 20 },
  case: { flex: 1, paddingVertical: 15, alignItems: 'center', borderRightWidth: 1, borderColor: COLORS.ligne },
  caseFin: { borderRightWidth: 0 },
  caseValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, color: COLORS.encre, letterSpacing: -0.4 },
  caseSup: { fontSize: 11 },
  caseLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2, marginTop: 3, textAlign: 'center' },

  noteSys: {
    flexDirection: 'row',
    gap: 11,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 22,
    backgroundColor: COLORS.tracePale,
    borderRadius: 16,
  },
  noteTexte: { flex: 1, fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2 },
});
