// Pas d'écran d'accueil : juste le minimum pendant la géolocalisation
// automatique au lancement (voir App.tsx). Un statut d'erreur (permission
// refusée, GPS indisponible…) affiche un bouton pour réessayer manuellement.
//
// Le texte de statut (`status`) est affiché même hors erreur, avec un
// décompte du temps écoulé : sans ça, un spinner nu ne se distingue pas d'un
// blocage réel pendant les 10-30s (parfois plus) que peut prendre le premier
// calcul d'une zone jamais visitée (voir logic/region.ts : les zones déjà en
// cache, elles, reviennent immédiatement).

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../theme';

export function StartScreen({
  status,
  isError,
  onLocate,
}: {
  status: string;
  isError: boolean;
  onLocate: () => void;
}) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (isError) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status, isError]);

  return (
    <View style={styles.wrap}>
      {isError ? (
        <>
          <Text style={styles.status}>{status}</Text>
          <TouchableOpacity style={styles.button} onPress={onLocate}>
            <Text style={styles.buttonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator color={COLORS.accentCyan} />
          {!!status && (
            <Text style={styles.loadingStatus}>
              {status}
              {elapsed >= 5 ? ` (${elapsed}s)` : ''}
            </Text>
          )}
          {elapsed >= 15 && <Text style={styles.hint}>{t('start.slowServersHint')}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  button: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999, marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  status: { color: COLORS.accentAmber, fontSize: 14, textAlign: 'center', maxWidth: 340 },
  loadingStatus: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 300, marginTop: 14 },
  hint: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', maxWidth: 280, marginTop: 8 },
});
