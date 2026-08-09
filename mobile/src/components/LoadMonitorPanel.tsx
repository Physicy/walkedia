// Panneau de monitoring dev-only : affiche en direct le journal des
// tentatives de chargement de zone (voir logLoad/maybeExpand/init dans
// useWalkedia.ts) — trigger (démarrage/déplacement carte/GPS), résultat
// (chargé/erreur/raison de skip), durée, tailles. Sert à comprendre "pourquoi
// ça charge vite/lentement/pas du tout" sans avoir à lire les logs Metro.

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';
import type { LoadLogEntry, LoadOutcome } from '../hooks/useWalkedia';

const TRIGGER_LABEL: Record<LoadLogEntry['trigger'], string> = {
  init: 'Démarrage',
  pan: 'Déplacement carte',
  gps: 'Suivi GPS',
};

const OUTCOME_LABEL: Record<LoadOutcome, string> = {
  success: 'Chargé',
  error: 'Erreur',
  'skip-in-progress': 'Déjà en cours',
  'skip-cooldown': 'Cooldown',
  'skip-covered': 'Zone déjà couverte',
  'skip-too-zoomed-out': 'Trop dézoomé',
};

const OUTCOME_COLOR: Record<LoadOutcome, string> = {
  success: COLORS.accentGreen,
  error: '#f87171',
  'skip-in-progress': COLORS.textDim,
  'skip-cooldown': COLORS.textDim,
  'skip-covered': COLORS.textMuted,
  'skip-too-zoomed-out': COLORS.textMuted,
};

function relativeTime(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 1) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  return `il y a ${Math.round(s / 60)} min`;
}

export function LoadMonitorPanel({ log }: { log: LoadLogEntry[] }) {
  // Force un re-render régulier pour que les "il y a Xs" restent à jour même
  // sans nouvel événement de chargement.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.title}>Monitoring chargement</Text>
      {log.length === 0 ? (
        <Text style={styles.empty}>Aucun événement pour l'instant.</Text>
      ) : (
        <ScrollView style={styles.list}>
          {log.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.trigger}>{TRIGGER_LABEL[e.trigger]}</Text>
                <Text style={styles.time}>{relativeTime(e.t, now)}</Text>
              </View>
              <Text style={[styles.outcome, { color: OUTCOME_COLOR[e.outcome] }]}>
                {OUTCOME_LABEL[e.outcome]}
                {e.count > 1 ? ` (×${e.count})` : ''}
                {e.durationMs != null ? ` — ${(e.durationMs / 1000).toFixed(2)}s` : ''}
              </Text>
              {(e.edges != null || e.junctions != null) && (
                <Text style={styles.meta}>
                  {e.edges ?? 0} tronçons · {e.junctions ?? 0} carrefours (total en mémoire)
                </Text>
              )}
              {e.detail && <Text style={styles.meta}>{e.detail}</Text>}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 100,
    maxHeight: 320,
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  title: { color: COLORS.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  empty: { color: COLORS.textDim, fontSize: 12 },
  list: { maxHeight: 260 },
  row: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
    gap: 2,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  trigger: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  time: { color: COLORS.textDim, fontSize: 11 },
  outcome: { fontSize: 13, fontWeight: '600' },
  meta: { color: COLORS.textDim, fontSize: 11 },
});
