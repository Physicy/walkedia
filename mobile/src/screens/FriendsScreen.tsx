// Amis : recherche, demandes reçues/envoyées, liste. Tout est réel côté
// serveur (voir useFriends.ts) — recherche par nom, demande, acceptation,
// refus — donc rien ici n'est décoratif.

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Jeton } from '../components/ui';
import { Icone } from '../components/Icones';
import type { useFriends, FriendProfile } from '../hooks/useFriends';

function SectionTitre({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitre}>{children}</Text>;
}

export function FriendsScreen({ api }: { api: ReturnType<typeof useFriends> }) {
  const { friends, incoming, outgoing, searchUsers, sendRequest, respond } = api;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(text));
    } finally {
      setSearching(false);
    }
  };

  const outgoingIds = new Set(outgoing.map((r) => r.profile.id));
  const friendIds = new Set(friends.map((f) => f.id));

  return (
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.champWrap}>
        <Icone nom="ami" size={16} color={COLORS.encre3} strokeWidth={1.7} />
        <TextInput
          style={styles.champ}
          placeholder="Chercher un joueur par pseudo…"
          placeholderTextColor={COLORS.encre3}
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
      </View>

      {query.trim().length > 0 && (
        <View style={styles.section}>
          {searching ? (
            <ActivityIndicator color={COLORS.trace} style={styles.loader} />
          ) : results.length === 0 ? (
            <Text style={styles.vide}>Aucun joueur trouvé.</Text>
          ) : (
            results.map((r) => (
              <View key={r.id} style={styles.ligne}>
                <Jeton nom={r.display_name} size={30} />
                <Text style={styles.nom} numberOfLines={1}>
                  {r.display_name || 'Joueur'}
                </Text>
                {friendIds.has(r.id) ? (
                  <Text style={styles.etat}>Déjà ami</Text>
                ) : outgoingIds.has(r.id) ? (
                  <Text style={styles.etat}>En attente</Text>
                ) : (
                  <Pressable style={styles.btnPetit} onPress={() => sendRequest(r.id)}>
                    <Text style={styles.btnPetitTexte}>Ajouter</Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {incoming.length > 0 && (
        <>
          <SectionTitre>Demandes reçues</SectionTitre>
          {incoming.map((r) => (
            <View key={r.id} style={styles.ligne}>
              <Jeton nom={r.profile.display_name} size={30} />
              <Text style={styles.nom} numberOfLines={1}>
                {r.profile.display_name || 'Joueur'}
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.btnPetit} onPress={() => respond(r.id, true)}>
                  <Text style={styles.btnPetitTexte}>Accepter</Text>
                </Pressable>
                <Pressable style={styles.btnPetitFantome} onPress={() => respond(r.id, false)}>
                  <Text style={styles.btnPetitFantomeTexte}>Refuser</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <SectionTitre>Amis ({friends.length})</SectionTitre>
      {friends.length === 0 ? (
        <Text style={styles.vide}>Pas encore d'ami — cherche un pseudo au-dessus.</Text>
      ) : (
        friends.map((f) => (
          <View key={f.id} style={styles.ligne}>
            <Jeton nom={f.display_name} size={30} />
            <Text style={styles.nom} numberOfLines={1}>
              {f.display_name || 'Joueur'}
            </Text>
          </View>
        ))
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  champWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.ligneForte,
    borderWidth: 1,
    borderRadius: RADIUS.m,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 8,
  },
  champ: { flex: 1, paddingVertical: 10, fontFamily: FONTS.texte, fontSize: 14, color: COLORS.encre },

  section: { marginBottom: 6 },
  sectionTitre: {
    fontFamily: FONTS.monoMedium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.encre3,
    marginTop: 18,
    marginBottom: 4,
  },
  loader: { marginVertical: 14 },
  vide: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.encre2, paddingVertical: 10 },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },
  nom: { flex: 1, fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  etat: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre3 },

  actions: { flexDirection: 'row', gap: 8 },
  btnPetit: { backgroundColor: COLORS.encre, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  btnPetitTexte: { fontFamily: FONTS.texteSemi, fontSize: 12, color: COLORS.surface },
  btnPetitFantome: {
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  btnPetitFantomeTexte: { fontFamily: FONTS.texteSemi, fontSize: 12, color: COLORS.encre2 },
});
