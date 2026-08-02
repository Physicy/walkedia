import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';
import type { useFriends, FriendProfile } from '../hooks/useFriends';

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
    <ScrollView style={styles.wrap} keyboardShouldPersistTaps="handled">
      <TextInput
        style={styles.input}
        placeholder="Chercher un joueur par pseudo…"
        placeholderTextColor={COLORS.textDim}
        value={query}
        onChangeText={runSearch}
      />

      {query.trim().length > 0 && (
        <View style={styles.section}>
          {searching ? (
            <Text style={styles.muted}>Recherche…</Text>
          ) : results.length === 0 ? (
            <Text style={styles.muted}>Aucun joueur trouvé.</Text>
          ) : (
            results.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.name}>{r.display_name || 'Joueur'}</Text>
                {friendIds.has(r.id) ? (
                  <Text style={styles.muted}>Déjà ami</Text>
                ) : outgoingIds.has(r.id) ? (
                  <Text style={styles.muted}>En attente</Text>
                ) : (
                  <TouchableOpacity style={styles.smallBtn} onPress={() => sendRequest(r.id)}>
                    <Text style={styles.smallBtnText}>Ajouter</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {incoming.length > 0 && (
        <>
          <Text style={styles.h3}>Demandes reçues</Text>
          {incoming.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.name}>{r.profile.display_name || 'Joueur'}</Text>
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => respond(r.id, true)}>
                  <Text style={styles.smallBtnText}>Accepter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtnGhost} onPress={() => respond(r.id, false)}>
                  <Text style={styles.smallBtnGhostText}>Refuser</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.h3}>Amis ({friends.length})</Text>
      {friends.length === 0 ? (
        <Text style={styles.muted}>Pas encore d'ami — cherche un pseudo ci-dessus.</Text>
      ) : (
        friends.map((f) => (
          <View key={f.id} style={styles.row}>
            <Text style={styles.name}>{f.display_name || 'Joueur'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  input: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderColor: 'rgba(148,163,184,0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 10,
  },
  section: { marginBottom: 10 },
  h3: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  rowActions: { flexDirection: 'row', gap: 8 },
  name: { color: COLORS.text, fontSize: 14, flexShrink: 1 },
  muted: { color: COLORS.textDim, fontSize: 12 },
  smallBtn: { backgroundColor: COLORS.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  smallBtnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  smallBtnGhostText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
});
