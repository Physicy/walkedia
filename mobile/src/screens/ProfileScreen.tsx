import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { COLORS } from '../theme';
import type { Progress } from '../logic/storage';
import type { useAuth } from '../hooks/useAuth';
import type { NeighborhoodStat } from '../hooks/useWalkedia';
import { AccountSection } from '../components/AccountSection';

const DAY = 86400000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pointsBetween(progress: Progress, a: number, b: number) {
  let n = 0;
  for (const at of Object.values(progress.completedAt)) if (at >= a && at < b) n++;
  return n;
}

function pointsSince(progress: Progress, t: number) {
  return pointsBetween(progress, t, Infinity);
}

export function ProfileScreen({
  progress,
  auth,
  syncing,
  neighborhoods,
  backgroundTrackingEnabled,
  onToggleBackgroundTracking,
}: {
  progress: Progress;
  auth: ReturnType<typeof useAuth>;
  syncing: boolean;
  neighborhoods: NeighborhoodStat[];
  backgroundTrackingEnabled: boolean;
  onToggleBackgroundTracking: (next: boolean) => void;
}) {
  const stats = useMemo(() => {
    const today = startOfToday();
    const monday = today - ((new Date().getDay() + 6) % 7) * DAY;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
    const days: { label: string; pts: number }[] = [];
    let max = 0;
    for (let i = 6; i >= 0; i--) {
      const start = today - i * DAY;
      const pts = pointsBetween(progress, start, start + DAY);
      max = Math.max(max, pts);
      days.push({ label: dayName.format(new Date(start)).replace('.', ''), pts });
    }

    const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
    const recent = progress.sessions.slice(-5).reverse();

    const untracked = progress.junctions.size - Object.keys(progress.completedAt).length;

    return {
      total: progress.junctions.size,
      today: pointsSince(progress, today),
      week: pointsSince(progress, monday),
      month: pointsSince(progress, firstOfMonth),
      edges: progress.edges.size,
      km: (progress.edgeMeters / 1000).toFixed(1),
      sessions: progress.sessions.length,
      days,
      max,
      recent,
      dateFmt,
      untracked,
    };
  }, [progress]);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.h2}>Profil</Text>

      <AccountSection auth={auth} syncing={syncing} />

      <View style={styles.bgTrackingRow}>
        <View style={styles.bgTrackingText}>
          <Text style={styles.bgTrackingLabel}>Détecter mes marches même app fermée</Text>
          <Text style={styles.muted}>
            Utilise ta position en arrière-plan (permission "Toujours") pour te proposer d'importer tes marches
            au retour dans l'app. Désactivé par défaut.
          </Text>
        </View>
        <Switch
          value={backgroundTrackingEnabled}
          onValueChange={onToggleBackgroundTracking}
          trackColor={{ true: COLORS.primary }}
        />
      </View>

      <View style={styles.bigScore}>
        <Text style={styles.bigScoreValue}>{stats.total}</Text>
        <Text style={styles.bigScoreLabel}>points au total</Text>
      </View>

      <View style={styles.statGrid}>
        <StatCell value={stats.today} label="aujourd'hui" />
        <StatCell value={stats.week} label="cette semaine" />
        <StatCell value={stats.month} label="ce mois-ci" />
      </View>

      <Text style={styles.h3}>Points sur 7 jours</Text>
      <View style={styles.chart}>
        {stats.days.map((d, i) => {
          const h = stats.max > 0 ? Math.max(6, Math.round((d.pts / stats.max) * 52)) : 6;
          return (
            <View key={i} style={styles.bar}>
              <Text style={styles.barValue}>{d.pts || ''}</Text>
              <View style={[styles.barFill, { height: h, backgroundColor: d.pts === 0 ? 'rgba(148,163,184,0.25)' : '#06b6d4' }]} />
              <Text style={styles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.statGrid}>
        <StatCell value={stats.edges} label="tronçons découverts" />
        <StatCell value={stats.km} label="km découverts" />
        <StatCell value={stats.sessions} label="sessions" />
      </View>

      <Text style={styles.h3}>Quartiers</Text>
      {neighborhoods.length === 0 ? (
        <Text style={styles.emptyList}>
          Aucun quartier cartographié dans les zones chargées pour l'instant.
        </Text>
      ) : (
        neighborhoods.map((n) => (
          <View key={n.id} style={styles.neighborhoodRow}>
            <Text style={styles.neighborhoodName} numberOfLines={1}>
              {n.name || 'Quartier sans nom'}
            </Text>
            <Text style={[styles.neighborhoodPct, n.unlocked && styles.neighborhoodUnlocked]}>
              {n.unlocked ? 'Débloqué 🔓' : `${Math.round(n.pct * 100)}% (${n.done}/${n.total})`}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.h3}>Dernières sessions</Text>
      {stats.recent.length === 0 ? (
        <Text style={styles.emptyList}>Aucune session pour l'instant</Text>
      ) : (
        stats.recent.map((s, i) => {
          const mins = Math.max(1, Math.round((s.end - s.start) / 60000));
          const label = s.imported ? `${stats.dateFmt.format(new Date(s.start))} (importée)` : stats.dateFmt.format(new Date(s.start));
          return (
            <View key={i} style={styles.sessionRow}>
              <Text style={styles.sessionCell}>{label}</Text>
              <Text style={styles.sessionCell}>{mins} min</Text>
              <Text style={styles.sessionCell}>{s.edges} tronçon(s)</Text>
              <Text style={[styles.sessionCell, styles.sessionPts]}>+{s.junctions} pt(s)</Text>
            </View>
          );
        })
      )}

      {stats.untracked > 0 && (
        <Text style={styles.muted}>
          {stats.untracked} point(s) acquis avant le suivi temporel : comptés dans le total uniquement.
        </Text>
      )}
    </ScrollView>
  );
}

function StatCell({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1600, backgroundColor: COLORS.bg },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 100 },
  h2: { fontSize: 21, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  h3: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  bgTrackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  bgTrackingText: { flex: 1, gap: 4 },
  bgTrackingLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  bigScore: { alignItems: 'center', marginVertical: 12 },
  bigScoreValue: { fontSize: 48, fontWeight: '800', color: COLORS.accentGreen, lineHeight: 52 },
  bigScoreLabel: { color: COLORS.textMuted, marginTop: 2 },
  statGrid: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 19, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90, paddingTop: 4 },
  bar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 },
  barValue: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  barFill: { width: '100%', borderRadius: 5, minHeight: 2 },
  barLabel: { fontSize: 10, color: COLORS.textMuted },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  neighborhoodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  neighborhoodName: { fontSize: 13, color: '#cbd5e1', flexShrink: 1 },
  neighborhoodPct: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  neighborhoodUnlocked: { color: COLORS.accentGreen },
  sessionCell: { fontSize: 13, color: '#cbd5e1' },
  sessionPts: { color: COLORS.accentGreen, fontWeight: '600' },
  emptyList: { color: COLORS.textDim, textAlign: 'center', paddingVertical: 10 },
  muted: { color: COLORS.textDim, fontSize: 12, marginTop: 10 },
});
