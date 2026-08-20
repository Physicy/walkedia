// Profil : le relevé d'abord, les réglages ailleurs (voir SettingsScreen.tsx).
// L'ancien profil ouvrait sur un interrupteur de permission GPS avec quatre
// lignes de texte gris, avant la moindre donnée de jeu — le premier bloc est
// maintenant le total de points.
//
// Les sorties sont nommées par les points décrochés (« Points n° 3 et 4 »),
// pas par un quartier : une session ne porte aucun quartier en mémoire, et en
// inventer un serait fabriquer une donnée qui n'existe pas.

import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, TRACE_PALETTE } from '../theme';
import { Avatar, Eyebrow, Mono, Titre } from '../components/ui';
import { Icone } from '../components/Icones';
import { tabBarHeight } from '../components/TabBar';
import { AVATARS, AVATAR_IDS } from '../logic/avatars';
import type { Progress } from '../logic/storage';
import type { useAuth } from '../hooks/useAuth';
import type { NeighborhoodStat } from '../hooks/useWalkedia';

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

// Numérote chaque sortie par les points qu'elle a fait tomber : un simple
// cumul sur les sessions dans l'ordre, puisque la numérotation elle-même suit
// l'ordre de complétion (voir junctionInfo.ts, pointNumber) et que les
// sessions sont conservées triées par date de début.
function nommerSorties(sessions: Progress['sessions']) {
  let cumul = 0;
  return sessions.map((s) => {
    const debut = cumul + 1;
    cumul += s.junctions;
    let label: string;
    if (s.junctions === 0) label = 'Aucun point';
    else if (s.junctions === 1) label = `Point n° ${debut}`;
    else if (s.junctions === 2) label = `Points n° ${debut} et ${cumul}`;
    else label = `Points n° ${debut} à ${cumul}`;
    return { ...s, label };
  });
}

export function ProfileScreen({
  progress,
  auth,
  syncing,
  neighborhoods,
  onOuvrirReglages,
  traceColor,
  onChoisirCouleur,
  avatarId,
  onChoisirAvatar,
}: {
  progress: Progress;
  auth: ReturnType<typeof useAuth>;
  syncing: boolean;
  neighborhoods: NeighborhoodStat[];
  onOuvrirReglages: () => void;
  traceColor: string;
  onChoisirCouleur: (hex: string) => void;
  avatarId: string | null;
  onChoisirAvatar: (id: string | null) => void;
}) {
  const insets = useSafeAreaInsets();

  const stats = useMemo(() => {
    const today = startOfToday();
    const monday = today - ((new Date().getDay() + 6) % 7) * DAY;

    const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
    const days: { label: string; pts: number }[] = [];
    let max = 0;
    for (let i = 6; i >= 0; i--) {
      const start = today - i * DAY;
      const pts = pointsBetween(progress, start, start + DAY);
      max = Math.max(max, pts);
      days.push({ label: dayName.format(new Date(start)).replace('.', ''), pts });
    }

    const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const sorties = nommerSorties(progress.sessions).slice(-6).reverse();

    const debuts = progress.sessions.map((s) => s.start);
    const premiereActivite = debuts.length ? Math.min(...debuts) : null;
    const depuisFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

    return {
      total: progress.junctions.size,
      today: pointsBetween(progress, today, Infinity),
      week: pointsBetween(progress, monday, Infinity),
      edges: progress.edges.size,
      km: (progress.edgeMeters / 1000).toFixed(1),
      sessions: progress.sessions.length,
      days,
      max,
      sorties,
      dateFmt,
      depuis: premiereActivite != null ? depuisFmt.format(new Date(premiereActivite)) : null,
    };
  }, [progress]);

  const nom = auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight(insets.bottom) + 26 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tete}>
          <Avatar avatarId={avatarId} nom={nom} size={44} />
          <View style={styles.teteTexte}>
            <Text style={styles.eyebrow}>{stats.depuis ? `Ton relevé · depuis le ${stats.depuis}` : 'Ton relevé'}</Text>
            <Titre style={styles.nom}>{nom || 'Marcheur sans nom'}</Titre>
          </View>
          <Pressable style={styles.rond} onPress={onOuvrirReglages} accessibilityRole="button" accessibilityLabel="Réglages">
            <Icone nom="reglages" size={18} color={COLORS.encre} strokeWidth={1.7} />
          </Pressable>
        </View>

        <View style={styles.total}>
          <Mono style={styles.totalN}>{stats.total}</Mono>
          <View style={styles.totalTexte}>
            <Text style={styles.totalLabel}>carrefours complétés</Text>
            <Text style={styles.totalDetail}>
              {stats.week} cette semaine, {stats.today} aujourd'hui
            </Text>
          </View>
        </View>
        {syncing && <Text style={styles.syncing}>Synchronisation…</Text>}

        <Eyebrow style={styles.sectionTitre}>Sept derniers jours</Eyebrow>
        <View style={styles.barres}>
          {stats.days.map((d, i) => {
            const h = stats.max > 0 ? Math.max(3, Math.round((d.pts / stats.max) * 52)) : 3;
            return (
              <View key={i} style={styles.colonne}>
                <Mono style={styles.barreValeur}>{d.pts || ''}</Mono>
                <View style={[styles.barre, { height: h }, d.pts > 0 && styles.barrePleine]} />
                <Text style={styles.barreJour}>{d.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.grille}>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{stats.edges}</Mono>
            <Text style={styles.caseLabel}>tronçons relevés</Text>
          </View>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{stats.km}</Mono>
            <Text style={styles.caseLabel}>km découverts</Text>
          </View>
          <View style={[styles.case, styles.caseFin]}>
            <Mono style={styles.caseValeur}>{stats.sessions}</Mono>
            <Text style={styles.caseLabel}>sessions</Text>
          </View>
        </View>

        <Eyebrow style={styles.sectionTitre}>Dernières sorties</Eyebrow>
        {stats.sorties.length === 0 ? (
          <Text style={styles.vide}>Aucune sortie pour l'instant.</Text>
        ) : (
          stats.sorties.map((s, i) => (
            <View key={i} style={styles.sortie}>
              <View style={[styles.puce, s.junctions > 0 && styles.puceGain]} />
              <View style={styles.sortieTexte}>
                <Text style={styles.sortieTitre}>{s.label}</Text>
                <Text style={styles.sortieDetail}>
                  {stats.dateFmt.format(new Date(s.start)).replace('.', '')}
                  {s.km != null ? ` · ${s.km.toFixed(1)} km` : ''}
                  {s.imported ? ' · importée' : ''}
                </Text>
              </View>
              <Mono style={[styles.sortiePts, s.junctions === 0 && styles.sortiePtsNul]}>
                {s.junctions > 0 ? `+${s.junctions} pt${s.junctions > 1 ? 's' : ''}` : `${s.edges} tronçons`}
              </Mono>
            </View>
          ))
        )}

        {neighborhoods.length > 0 && (
          <>
            <Eyebrow style={styles.sectionTitre}>Quartiers</Eyebrow>
            {neighborhoods.map((n) => (
              <View key={n.id} style={styles.quartier}>
                <Text style={styles.quartierNom} numberOfLines={1}>
                  {n.name || 'Quartier sans nom'}
                </Text>
                <Text style={[styles.quartierPct, n.unlocked && styles.quartierDebloque]}>
                  {n.unlocked ? 'Débloqué' : `${Math.round(n.pct * 100)}% (${n.done}/${n.total})`}
                </Text>
              </View>
            ))}
          </>
        )}

        <Eyebrow style={styles.sectionTitre}>Ta couleur</Eyebrow>
        <Text style={styles.couleurTexte}>
          Remplace le violet pour le halo autour des carrefours, les points déjà validés et le tracé de ta session.
        </Text>
        <View style={styles.couleurs}>
          {TRACE_PALETTE.map((hex) => {
            const choisie = hex.toLowerCase() === traceColor.toLowerCase();
            return (
              <Pressable
                key={hex}
                onPress={() => onChoisirCouleur(hex)}
                style={[styles.pastilleCouleur, { backgroundColor: hex }, choisie && styles.pastilleCouleurChoisie]}
                accessibilityRole="button"
                accessibilityLabel={`Choisir ${hex}`}
                accessibilityState={{ selected: choisie }}
              >
                {choisie && <Icone nom="coche" size={16} color="#fff" strokeWidth={2.6} />}
              </Pressable>
            );
          })}
        </View>
        <Eyebrow style={styles.sectionTitre}>Ton avatar</Eyebrow>
        <Text style={styles.couleurTexte}>Remplace aussi le repère de ta position sur la carte.</Text>
        <View style={styles.avatars}>
          <Pressable
            onPress={() => onChoisirAvatar(null)}
            style={[styles.pastilleAvatar, !avatarId && styles.pastilleAvatarChoisie]}
            accessibilityRole="button"
            accessibilityLabel="Aucun avatar (initiales)"
            accessibilityState={{ selected: !avatarId }}
          >
            <Text style={styles.avatarAucunTexte}>{(nom || '?').slice(0, 1).toUpperCase()}</Text>
          </Pressable>
          {AVATAR_IDS.map((id) => {
            const choisi = id === avatarId;
            return (
              <Pressable
                key={id}
                onPress={() => onChoisirAvatar(id)}
                style={[styles.pastilleAvatar, choisi && styles.pastilleAvatarChoisie]}
                accessibilityRole="button"
                accessibilityLabel={`Choisir cet avatar`}
                accessibilityState={{ selected: choisi }}
              >
                <Image source={AVATARS[id]} style={styles.avatarImage} resizeMode="cover" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1600, backgroundColor: COLORS.papier },
  scroll: { flex: 1 },

  tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 18 },
  teteTexte: { flex: 1 },
  eyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: COLORS.encre3,
    marginBottom: 6,
  },
  nom: { fontSize: 24 },
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

  total: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, marginTop: 14 },
  totalN: { fontFamily: FONTS.display, fontSize: 60, lineHeight: 60, color: COLORS.trace, letterSpacing: -1.2 },
  totalTexte: { flex: 1 },
  totalLabel: { fontFamily: FONTS.texteSemi, fontSize: 14.5, color: COLORS.encre },
  totalDetail: { fontFamily: FONTS.texte, fontSize: 12.5, color: COLORS.encre2, marginTop: 2 },
  syncing: { fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre3, paddingHorizontal: 20, marginTop: 6 },

  sectionTitre: { paddingHorizontal: 20, marginTop: 24, marginBottom: 4 },

  barres: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 72, paddingHorizontal: 20, marginTop: 12 },
  colonne: { flex: 1, alignItems: 'center', gap: 7 },
  barre: { width: 14, backgroundColor: COLORS.ligne, borderRadius: 3, minHeight: 3 },
  barrePleine: { backgroundColor: COLORS.trace },
  barreValeur: { fontSize: 10, fontFamily: FONTS.monoSemi, color: COLORS.trace, height: 13 },
  barreJour: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.encre3 },

  grille: { flexDirection: 'row', borderTopWidth: 1, borderColor: COLORS.ligne, marginTop: 20, marginHorizontal: 20 },
  case: { flex: 1, paddingVertical: 15, paddingHorizontal: 4, borderRightWidth: 1, borderColor: COLORS.ligne },
  caseFin: { borderRightWidth: 0 },
  caseValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, color: COLORS.encre, letterSpacing: -0.4 },
  caseLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2, marginTop: 2 },

  vide: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.encre2, paddingHorizontal: 20, paddingVertical: 10 },
  sortie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.ligne,
  },
  puce: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: COLORS.ligneForte },
  puceGain: { backgroundColor: COLORS.trace },
  sortieTexte: { flex: 1 },
  sortieTitre: { fontFamily: FONTS.texteSemi, fontSize: 13.5, color: COLORS.encre },
  sortieDetail: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.encre3, marginTop: 2 },
  sortiePts: { fontSize: 12, color: COLORS.trace },
  sortiePtsNul: { color: COLORS.encre3 },

  quartier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.ligne,
  },
  quartierNom: { fontFamily: FONTS.texte, fontSize: 13, color: COLORS.encre2, flexShrink: 1 },
  quartierPct: { fontFamily: FONTS.monoMedium, fontSize: 12, color: COLORS.encre2 },
  quartierDebloque: { color: COLORS.trace },

  couleurTexte: {
    fontFamily: FONTS.texte,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.encre2,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  couleurs: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 14 },
  pastilleCouleur: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pastilleCouleurChoisie: { borderColor: COLORS.encre },

  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginTop: 14, paddingBottom: 6 },
  pastilleAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleAvatarChoisie: { borderColor: COLORS.trace },
  avatarImage: { width: '100%', height: '100%' },
  avatarAucunTexte: { fontFamily: FONTS.monoSemi, fontSize: 16, color: COLORS.encre3 },
});
