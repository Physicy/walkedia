// Profil : le relevé d'abord, les réglages et les sorties ailleurs (voir
// SettingsScreen.tsx et ProfileActivityScreen.tsx). L'ancien profil ouvrait
// sur un interrupteur de permission GPS avec quatre lignes de texte gris,
// avant la moindre donnée de jeu — le premier bloc est maintenant le total de
// points. Les sorties et les quartiers, eux, allongeaient l'écran bien après
// le contenu qu'on vient vraiment consulter ici (total, semaine, tronçons) ;
// ils vivent maintenant à un appui de distance plutôt qu'en défilement.
//
// Niveau, série et objectif quotidien (voir logic/streak.ts) sont dérivés à
// chaque rendu depuis le total de carrefours et l'historique de pas — aucun
// des deux n'a besoin d'être stocké séparément, la seule source de vérité
// reste `progress` (Supabase-synchronisé) et l'historique local du pedometer.

import React, { useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS, TRACE_PALETTE } from '../theme';
import { Avatar, Eyebrow, Mono, Titre } from '../components/ui';
import { Icone } from '../components/Icones';
import { FeuSerie } from '../components/FeuSerie';
import { tabBarHeight } from '../components/TabBar';
import { AVATARS, AVATAR_IDS } from '../logic/avatars';
import { computeLevel, computeStreak, fireStage, localDateKey } from '../logic/streak';
import type { Progress } from '../logic/storage';
import type { useAuth } from '../hooks/useAuth';

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

// Tronçons découverts par jour : `completedAt` ne date que les carrefours
// (voir storage.ts), pas les tronçons individuellement — les sessions, elles,
// portent un total de tronçons ET un horodatage de début (voir
// ProfileActivityScreen.tsx, qui numérote déjà les sorties à partir de cette
// même liste), donc un proxy honnête plutôt qu'un champ à ajouter au modèle.
function segmentsBetween(progress: Progress, a: number, b: number) {
  let n = 0;
  for (const s of progress.sessions) if (s.start >= a && s.start < b) n += s.edges;
  return n;
}

function stepsBetween(history: Record<string, number>, a: number, b: number) {
  let n = 0;
  const d = new Date(a);
  while (d.getTime() < b) {
    n += history[localDateKey(d)] ?? 0;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

type MetricId = 'junctions' | 'steps' | 'segments';
type PeriodId = 'last7' | 'thisMonth' | 'lastMonth' | 'thisYear';

const METRICS: { id: MetricId; labelKey: string }[] = [
  { id: 'junctions', labelKey: 'profile.metricJunctions' },
  { id: 'steps', labelKey: 'profile.metricSteps' },
  { id: 'segments', labelKey: 'profile.metricSegments' },
];

const PERIODS: { id: PeriodId; labelKey: string }[] = [
  { id: 'last7', labelKey: 'profile.periodLast7Days' },
  { id: 'thisMonth', labelKey: 'profile.periodThisMonth' },
  { id: 'lastMonth', labelKey: 'profile.periodLastMonth' },
  { id: 'thisYear', labelKey: 'profile.periodThisYear' },
];

function metricValue(metric: MetricId, progress: Progress, stepsHistory: Record<string, number>, a: number, b: number) {
  if (metric === 'junctions') return pointsBetween(progress, a, b);
  if (metric === 'steps') return stepsBetween(stepsHistory, a, b);
  return segmentsBetween(progress, a, b);
}

interface Bucket {
  label: string;
  value: number;
}

// Un seul découpage générique pour les quatre périodes plutôt qu'un cas par
// période : "7 derniers jours" par jour, "mois en cours/dernier" en 4
// tranches d'environ une semaine (les mois ne font pas tous 4 semaines
// pleines, une tranche fixe reste plus lisible qu'un dernier bâton
// chétif), "année en cours" par mois du 1er janvier au mois courant.
function buildBuckets(metric: MetricId, period: PeriodId, progress: Progress, stepsHistory: Record<string, number>, locale: string): Bucket[] {
  const now = new Date();
  const val = (a: number, b: number) => metricValue(metric, progress, stepsHistory, a, b);

  if (period === 'last7') {
    const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const today = startOfToday();
    const out: Bucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = today - i * DAY;
      out.push({ label: dayName.format(new Date(start)).replace('.', ''), value: val(start, start + DAY) });
    }
    return out;
  }

  if (period === 'thisMonth' || period === 'lastMonth') {
    const base = period === 'lastMonth' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1).getTime();
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1).getTime();
    const span = (monthEnd - monthStart) / 4;
    const out: Bucket[] = [];
    for (let i = 0; i < 4; i++) {
      const start = monthStart + i * span;
      const end = i === 3 ? monthEnd : monthStart + (i + 1) * span;
      out.push({ label: `S${i + 1}`, value: val(start, end) });
    }
    return out;
  }

  // thisYear
  const monthName = new Intl.DateTimeFormat(locale, { month: 'short' });
  const out: Bucket[] = [];
  for (let m = 0; m <= now.getMonth(); m++) {
    const start = new Date(now.getFullYear(), m, 1).getTime();
    const end = new Date(now.getFullYear(), m + 1, 1).getTime();
    out.push({ label: monthName.format(new Date(now.getFullYear(), m, 1)).replace('.', ''), value: val(start, end) });
  }
  return out;
}

const FIRE_LEGEND_KEYS: Record<string, string> = {
  eteint: 'profile.fireLegendOff',
  etincelle: 'profile.fireLegendSpark',
  'ca-prend': 'profile.fireLegendCatching',
  flambee: 'profile.fireLegendBlaze',
  brasier: 'profile.fireLegendInferno',
};

export function ProfileScreen({
  progress,
  auth,
  syncing,
  onOuvrirReglages,
  onOuvrirActivite,
  traceColor,
  onChoisirCouleur,
  avatarId,
  onChoisirAvatar,
  dailyStepGoal,
  onSetDailyGoal,
  stepsToday,
  stepsHistory,
  hideStats,
  neighborhoodsCount,
}: {
  progress: Progress;
  auth: ReturnType<typeof useAuth>;
  syncing: boolean;
  onOuvrirReglages: () => void;
  onOuvrirActivite: () => void;
  traceColor: string;
  onChoisirCouleur: (hex: string) => void;
  avatarId: string | null;
  onChoisirAvatar: (id: string | null) => void;
  dailyStepGoal: number;
  onSetDailyGoal: (goal: number) => void;
  stepsToday: number;
  stepsHistory: Record<string, number>;
  hideStats: boolean;
  neighborhoodsCount: number;
}) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  // Plus de date de première activité : le bandeau « ton relevé depuis le … »
  // qui la portait a disparu de l'en-tête, et c'était son seul usage.
  const stats = useMemo(() => {
    const today = startOfToday();
    const monday = today - ((new Date().getDay() + 6) % 7) * DAY;
    return {
      total: progress.junctions.size,
      today: pointsBetween(progress, today, Infinity),
      week: pointsBetween(progress, monday, Infinity),
      edges: progress.edges.size,
      km: (progress.edgeMeters / 1000).toFixed(1),
      sessions: progress.sessions.length,
    };
  }, [progress]);

  const niveau = useMemo(() => computeLevel(stats.total), [stats.total]);

  const streakInfo = useMemo(() => {
    const todayKey = localDateKey(new Date());
    const atteint = stepsToday >= dailyStepGoal;
    const streak = computeStreak(stepsHistory, dailyStepGoal, todayKey, atteint);
    return { streak, atteint, stage: fireStage(streak) };
  }, [stepsHistory, stepsToday, dailyStepGoal]);

  const [metric, setMetric] = useState<MetricId>('junctions');
  const [period, setPeriod] = useState<PeriodId>('last7');
  const chart = useMemo(() => {
    const buckets = buildBuckets(metric, period, progress, stepsHistory, i18n.language);
    const max = Math.max(1, ...buckets.map((b) => b.value));
    const total = buckets.reduce((a, b) => a + b.value, 0);
    return { buckets, max, total };
  }, [metric, period, progress, stepsHistory, i18n.language]);

  const nom = auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || null;
  const [personnaliserOuvert, setPersonnaliserOuvert] = useState(false);
  const [objectifOuvert, setObjectifOuvert] = useState(false);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight(insets.bottom) + 26 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.entete}>
          <View style={styles.enteteTexte}>
            <Titre style={styles.nom} numberOfLines={1}>{nom || t('profile.defaultName')}</Titre>
            {hideStats && (
              <View style={styles.badgePrive}>
                <Icone nom="cadenas" size={12} color={COLORS.encre2} strokeWidth={1.9} />
                <Text style={styles.badgePriveTexte}>{t('profile.privateStatsBadge')}</Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={onOuvrirReglages}
            accessibilityRole="button"
            accessibilityLabel={t('profile.settingsNav')}
            style={styles.rondReglages}
          >
            <Icone nom="curseurs" size={20} color={COLORS.encre} strokeWidth={1.8} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setPersonnaliserOuvert(true)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changeAvatarOrColor')}
          style={styles.persoBloc}
        >
          <View style={styles.avatarBouton}>
            <Avatar avatarId={avatarId} nom={nom} size={116} />
            <View style={[styles.avatarBadge, { backgroundColor: traceColor }]}>
              <Icone nom="crayon" size={15} color="#fff" strokeWidth={2} />
            </View>
          </View>
          <Text style={styles.persoTitre}>{t('profile.customizeTitle')}</Text>
          <Text style={styles.persoDetail}>{t('profile.avatarDesc')}</Text>
        </Pressable>

        <View style={styles.hero}>
          <HeroSchema accent={traceColor} />
          <View style={styles.heroContenu}>
            <Eyebrow>{t('profile.junctionsCompletedLabel')}</Eyebrow>
            <View style={styles.heroLigne}>
              <Text style={[styles.heroChiffre, { color: traceColor }]}>{stats.total}</Text>
              <Text style={styles.heroDetail}>{t('profile.weekTodayDetail', { week: stats.week, today: stats.today })}</Text>
            </View>
            {syncing && <Text style={styles.syncing}>{t('account.syncing')}</Text>}
            <View style={styles.heroSepar} />
            <View style={styles.heroNiveau}>
              <Text style={styles.heroNiveauTexte}>{t('profile.levelLabel', { level: niveau.niveau })}</Text>
              <View style={styles.jaugePiste}>
                <View style={[styles.jaugePleine, { width: `${niveau.pct}%`, backgroundColor: traceColor }]} />
              </View>
              <Mono style={styles.heroNiveauReste}>{niveau.haut}</Mono>
            </View>
          </View>
        </View>

        <View style={[styles.serieCard, streakInfo.atteint && styles.serieCardAtteint]}>
          <View style={styles.serieHaut}>
            <View style={styles.serieGauche}>
              <FeuSerie streak={streakInfo.streak} />
              <View>
                <Text style={[styles.serieEyebrow, streakInfo.atteint && styles.serieEyebrowAtteint]}>{t('profile.streakLabel')}</Text>
                <View style={styles.serieLigne}>
                  <Text style={styles.serieChiffre}>{streakInfo.streak}</Text>
                  <Text style={[styles.serieUnite, streakInfo.atteint && styles.serieUniteAtteint]}>{t('profile.streakDaysUnit')}</Text>
                </View>
                <Text style={[styles.serieEyebrow, streakInfo.atteint && styles.serieEyebrowAtteint]}>{t(FIRE_LEGEND_KEYS[streakInfo.stage])}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setObjectifOuvert(true)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.adjustGoalAction')}
              style={[styles.btObjectif, streakInfo.atteint && styles.btObjectifAtteint]}
            >
              <Icone nom="objectif" size={15} color={COLORS.encre} strokeWidth={1.8} />
              <Mono style={styles.btObjectifTexte}>{dailyStepGoal}</Mono>
            </Pressable>
          </View>
          <View style={styles.pasBloc}>
            <View style={styles.pasLignes}>
              <Mono style={styles.pasTexte}>{t('profile.stepsCountLabel', { count: stepsToday })}</Mono>
              <Mono style={[styles.pasReste, streakInfo.atteint && styles.pasResteAtteint]}>
                {streakInfo.atteint ? t('profile.stepsGoalReached') : t('profile.stepsRemaining', { count: Math.max(0, dailyStepGoal - stepsToday) })}
              </Mono>
            </View>
            <View style={[styles.pasPiste, streakInfo.atteint && styles.pasPisteAtteint]}>
              <View
                style={[
                  styles.pasJauge,
                  { width: `${Math.min(100, Math.round((stepsToday / dailyStepGoal) * 100))}%`, backgroundColor: streakInfo.atteint ? COLORS.serie : traceColor },
                ]}
              />
            </View>
            {Platform.OS === 'android' && <Text style={styles.pasCaveat}>{t('profile.androidStepsCaveat')}</Text>}
          </View>
        </View>

        <View style={styles.activiteCard}>
          <View style={styles.activiteTete}>
            <Text style={styles.activiteTitre}>{t('profile.activityTitle')}</Text>
          </View>
          {/* Une seule ligne qui défile plutôt qu'un retour à la ligne : à
              quatre périodes, `flexWrap` en cassait deux sur la seconde
              ligne dans la plupart des langues, et la rangée changeait de
              hauteur d'une traduction à l'autre. Les marges négatives
              laissent les puces courir jusqu'aux bords de la carte, pour
              qu'une puce coupée signale qu'il y en a d'autres à droite. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.periodeRangee}
            contentContainerStyle={styles.periodeContenu}
          >
            {PERIODS.map((p) => (
              <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={[styles.periodeChip, period === p.id && styles.periodeChipActive]}>
                <Text style={[styles.periodeChipTexte, period === p.id && styles.periodeChipTexteActive]}>{t(p.labelKey)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.metriqueRangee}>
            {METRICS.map((m) => (
              <Pressable key={m.id} onPress={() => setMetric(m.id)} style={[styles.metriqueChip, metric === m.id && styles.metriqueChipActive]}>
                <Text style={[styles.metriqueChipTexte, metric === m.id && styles.metriqueChipTexteActive]}>{t(m.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
          {/* La barre vit dans une zone de hauteur fixe (`barreZone`) au lieu
              d'être posée dans une rangée de hauteur fixe : la colonne
              entière (valeur + barre + jour) dépassait la rangée dès que la
              barre approchait son maximum, et débordait par le haut sur les
              filtres juste au-dessus. */}
          <View style={styles.barres}>
            {chart.buckets.map((b, i) => {
              const h = Math.max(3, Math.round((b.value / chart.max) * 74));
              const fort = b.value === chart.max && b.value > 0;
              return (
                <View key={i} style={styles.colonne}>
                  <Mono style={[styles.barreValeur, fort && { color: traceColor }]}>{b.value || ''}</Mono>
                  <View style={styles.barreZone}>
                    <View style={[styles.barre, { height: h }, b.value > 0 && { backgroundColor: fort ? traceColor : `${traceColor}6B` }]} />
                  </View>
                  <Text style={styles.barreLabel} numberOfLines={1}>{b.label}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.activitePied}>
            <Text style={styles.activitePiedTexte}>{t('profile.chartSummary', { metric: t(METRICS.find((m) => m.id === metric)!.labelKey), period: t(PERIODS.find((p) => p.id === period)!.labelKey).toLowerCase() })}</Text>
            <Mono style={styles.activitePiedTotal}>{t('profile.chartTotal', { count: chart.total })}</Mono>
          </View>
        </View>

        <View style={styles.grille}>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{stats.edges}</Mono>
            <Text style={styles.caseLabel}>{t('profile.segmentsDiscovered')}</Text>
          </View>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{stats.km}</Mono>
            <Text style={styles.caseLabel}>{t('profile.kmDiscovered')}</Text>
          </View>
          <View style={styles.case}>
            <Mono style={styles.caseValeur}>{stats.sessions}</Mono>
            <Text style={styles.caseLabel}>{t('profile.sessionsLabel')}</Text>
          </View>
        </View>

        <Pressable onPress={onOuvrirActivite} style={styles.sortiesNav} accessibilityRole="button" accessibilityLabel={t('profile.activityNav')}>
          <View style={styles.sortiesNavTexte}>
            <Text style={styles.sortiesNavTitre}>{t('profile.activityNav')}</Text>
            <Text style={styles.sortiesNavDetail}>
              {t('profile.outingsAndNeighborhoodsDetail', { outings: stats.sessions, neighborhoods: neighborhoodsCount })}
            </Text>
          </View>
          <Icone nom="chevronDroit" size={17} color="rgba(252,251,254,0.8)" strokeWidth={1.9} />
        </Pressable>
      </ScrollView>

      {personnaliserOuvert && (
        <PersonnalisationSheet
          nom={nom}
          traceColor={traceColor}
          onChoisirCouleur={onChoisirCouleur}
          avatarId={avatarId}
          onChoisirAvatar={onChoisirAvatar}
          onFermer={() => setPersonnaliserOuvert(false)}
        />
      )}
      {objectifOuvert && (
        <ObjectifSheet
          goal={dailyStepGoal}
          onChange={onSetDailyGoal}
          onFermer={() => setObjectifOuvert(false)}
        />
      )}
    </View>
  );
}

// Schéma décoratif du fond de la carte "Carrefours complétés" : un plan de
// rues entier plutôt que les quatre traits d'avant, parce que le fond doit
// raconter la même chose que le chiffre qu'il porte — un maillage de
// carrefours dont une partie seulement est prise. D'où les deux couches
// distinctes : la grille et ses nœuds en encre pour ce qui reste, le chemin
// parcouru et ses nœuds dans la couleur du joueur pour ce qui est acquis.
//
// Les opacités sont plus basses que la version précédente (0.16 partout) :
// le plan est plus dense, donc chaque trait doit peser moins pour que le
// nombre reste le premier élément lu de la carte.
const PLAN_GRILLE =
  'M0 22H335M0 62H335M0 102H335M0 142H335M38 0V158M96 0V158M158 0V158M220 0V158M278 0V158M322 0V158';
const PLAN_PARCOURU = 'M38 22H158M158 22V62M158 62H278M278 62V102M96 102V142M96 142H220';
const PLAN_NOEUDS: [number, number][] = [];
for (const y of [22, 62, 102, 142]) {
  for (const x of [38, 96, 158, 220, 278, 322]) PLAN_NOEUDS.push([x, y]);
}
const PLAN_NOEUDS_PRIS: [number, number][] = [
  [38, 22], [96, 22], [158, 22],
  [158, 62], [220, 62], [278, 62],
  [96, 102], [278, 102],
  [96, 142], [158, 142], [220, 142],
];

function HeroSchema({ accent }: { accent: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 335 158" style={StyleSheet.absoluteFillObject} preserveAspectRatio="xMidYMid slice">
      <Path d={PLAN_GRILLE} stroke={COLORS.encre} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.06} />
      <Path d={PLAN_PARCOURU} stroke={accent} strokeWidth={6.5} strokeLinecap="round" fill="none" opacity={0.14} />
      {PLAN_NOEUDS.map(([x, y]) => (
        <Circle key={`g${x}-${y}`} cx={x} cy={y} r={4} fill={COLORS.encre} opacity={0.1} />
      ))}
      {PLAN_NOEUDS_PRIS.map(([x, y]) => (
        <Circle key={`a${x}-${y}`} cx={x} cy={y} r={4.6} fill={accent} opacity={0.24} />
      ))}
    </Svg>
  );
}

// Fiche de personnalisation : couleur et avatar au même endroit, ouverte en
// touchant l'avatar plutôt que posée en permanence dans le profil — les deux
// se choisissent une fois puis se retouchent rarement, ça n'a pas besoin
// d'occuper la moitié de l'écran à chaque visite.
function PersonnalisationSheet({
  nom,
  traceColor,
  onChoisirCouleur,
  avatarId,
  onChoisirAvatar,
  onFermer,
}: {
  nom: string | null;
  traceColor: string;
  onChoisirCouleur: (hex: string) => void;
  avatarId: string | null;
  onChoisirAvatar: (id: string | null) => void;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <Titre style={styles.feuilleTitre}>{t('profile.customizeTitle')}</Titre>

        {/* `flexShrink: 1` est ce qui force le ScrollView à se limiter à
            l'espace restant dans `feuille` (plafonnée par maxHeight) plutôt
            que de se dimensionner sur tout son contenu : sans lui, la liste
            d'avatars débordait de la feuille sans qu'aucun scroll ne puisse
            jamais atteindre les dernières lignes. */}
        <ScrollView
          style={styles.feuilleScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
        <Eyebrow style={styles.sectionTitreFeuille}>{t('profile.yourColor')}</Eyebrow>
        <Text style={styles.couleurTexte}>{t('profile.colorDesc')}</Text>
        <View style={styles.couleurs}>
          {TRACE_PALETTE.map((hex) => {
            const choisie = hex.toLowerCase() === traceColor.toLowerCase();
            return (
              <Pressable
                key={hex}
                onPress={() => onChoisirCouleur(hex)}
                style={[styles.pastilleCouleur, { backgroundColor: hex }, choisie && styles.pastilleCouleurChoisie]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.chooseColor', { hex })}
                accessibilityState={{ selected: choisie }}
              >
                {choisie && <Icone nom="coche" size={16} color="#fff" strokeWidth={2.6} />}
              </Pressable>
            );
          })}
        </View>

        <Eyebrow style={styles.sectionTitreFeuille}>{t('profile.yourAvatar')}</Eyebrow>
        <Text style={styles.couleurTexte}>{t('profile.avatarDesc')}</Text>
        <View style={styles.avatars}>
          <Pressable
            onPress={() => onChoisirAvatar(null)}
            style={[styles.pastilleAvatar, !avatarId && styles.pastilleAvatarChoisie]}
            accessibilityRole="button"
            accessibilityLabel={t('profile.noAvatarInitials')}
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
                accessibilityLabel={t('profile.chooseThisAvatar')}
                accessibilityState={{ selected: choisi }}
              >
                <Image source={AVATARS[id]} style={styles.avatarImage} resizeMode="cover" />
              </Pressable>
            );
          })}
        </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

// Objectif de pas quotidien : même gabarit de feuille que la personnalisation
// ci-dessus, stepper -/+ 500 borné comme la maquette (1000-30000).
function ObjectifSheet({ goal, onChange, onFermer }: { goal: number; onChange: (g: number) => void; onFermer: () => void }) {
  const { t } = useTranslation();
  const [valeur, setValeur] = useState(goal);
  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <Titre style={styles.feuilleTitre}>{t('profile.goalModalTitle')}</Titre>
        <Text style={styles.objectifDesc}>{t('profile.goalModalDesc')}</Text>
        <View style={styles.objectifStepper}>
          <Pressable
            onPress={() => setValeur((v) => Math.max(1000, v - 500))}
            accessibilityRole="button"
            accessibilityLabel={t('profile.goalMinusAction')}
            style={styles.objectifRond}
          >
            <Text style={styles.objectifRondTexte}>−</Text>
          </Pressable>
          <View style={styles.objectifCentre}>
            <Text style={styles.objectifChiffre}>{valeur}</Text>
            <Text style={styles.objectifUnite}>{t('profile.goalStepUnit')}</Text>
          </View>
          <Pressable
            onPress={() => setValeur((v) => Math.min(30000, v + 500))}
            accessibilityRole="button"
            accessibilityLabel={t('profile.goalPlusAction')}
            style={styles.objectifRond}
          >
            <Text style={styles.objectifRondTexte}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.objectifPas}>{t('profile.goalStepIncrement')}</Text>
        <Pressable
          onPress={() => {
            onChange(valeur);
            onFermer();
          }}
          style={styles.objectifValider}
        >
          <Text style={styles.objectifValiderTexte}>{t('profile.goalSave')}</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1600, backgroundColor: COLORS.papier },
  scroll: { flex: 1 },

  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  enteteTexte: { flex: 1, minWidth: 0 },
  nom: { fontSize: 24 },
  badgePrive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(26, 27, 46, 0.07)',
    borderWidth: 1,
    borderColor: COLORS.ligne,
  },
  badgePriveTexte: { fontFamily: FONTS.monoSemi, fontSize: 10.5, letterSpacing: 0.4, color: COLORS.encre2 },
  rondReglages: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },

  persoBloc: { alignItems: 'center', paddingHorizontal: 20, marginTop: 22 },
  avatarBouton: { position: 'relative' },
  avatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
  },
  persoTitre: { fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre, marginTop: 14, textAlign: 'center' },
  persoDetail: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre2, marginTop: 3, textAlign: 'center', maxWidth: 270 },

  hero: { marginHorizontal: 20, marginTop: 22, borderRadius: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.ligne, overflow: 'hidden' },
  heroContenu: { padding: 18 },
  heroLigne: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 2 },
  heroChiffre: { fontFamily: FONTS.display, fontSize: 54, lineHeight: 54, letterSpacing: -1.5 },
  heroDetail: { flex: 1, fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2, paddingBottom: 6 },
  syncing: { fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre3, marginTop: 6 },
  heroSepar: { height: 1, backgroundColor: COLORS.ligne, marginVertical: 14 },
  heroNiveau: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroNiveauTexte: { fontFamily: FONTS.displaySemi, fontSize: 12.5, color: COLORS.encre },
  jaugePiste: { flex: 1, height: 8, borderRadius: 5, backgroundColor: COLORS.ligne, overflow: 'hidden' },
  jaugePleine: { height: '100%', borderRadius: 5 },
  heroNiveauReste: { fontSize: 10.5, color: COLORS.encre2 },

  serieCard: { marginHorizontal: 20, marginTop: 20, borderRadius: 24, padding: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.ligne },
  serieCardAtteint: { backgroundColor: COLORS.seriePale, borderColor: 'rgba(217,123,41,0.28)' },
  serieHaut: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  serieGauche: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  serieEyebrow: { fontFamily: FONTS.monoMedium, fontSize: 9.5, letterSpacing: 1.14, textTransform: 'uppercase', color: COLORS.encre3 },
  serieEyebrowAtteint: { color: 'rgba(139,70,15,0.72)' },
  serieLigne: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 3 },
  serieChiffre: { fontFamily: FONTS.display, fontSize: 32, letterSpacing: -1, color: COLORS.serie },
  serieUnite: { fontFamily: FONTS.texteSemi, fontSize: 13, color: COLORS.encre2 },
  serieUniteAtteint: { color: 'rgba(139,70,15,0.8)' },
  btObjectif: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.ligneForte, backgroundColor: COLORS.papier },
  btObjectifAtteint: { borderColor: 'rgba(217,123,41,0.34)', backgroundColor: 'rgba(255,255,255,0.7)' },
  btObjectifTexte: { fontSize: 11, color: COLORS.encre },

  pasBloc: { marginTop: 14 },
  pasLignes: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pasTexte: { fontSize: 10.5, color: COLORS.encre },
  pasReste: { fontSize: 10.5, color: COLORS.encre3 },
  pasResteAtteint: { color: 'rgba(139,70,15,0.75)' },
  pasPiste: { height: 10, borderRadius: 6, backgroundColor: COLORS.ligne, overflow: 'hidden' },
  pasPisteAtteint: { backgroundColor: 'rgba(139,70,15,0.15)' },
  pasJauge: { height: '100%', borderRadius: 6 },
  pasCaveat: { fontFamily: FONTS.texte, fontSize: 10.5, lineHeight: 15, color: COLORS.encre3, marginTop: 8 },

  activiteCard: { marginHorizontal: 20, marginTop: 20, borderRadius: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.ligne, padding: 16 },
  activiteTete: { marginBottom: 4 },
  activiteTitre: { fontFamily: FONTS.displaySemi, fontSize: 15, color: COLORS.encre },
  periodeRangee: { marginTop: 10, marginHorizontal: -16 },
  periodeContenu: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  periodeChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, backgroundColor: COLORS.papier, borderWidth: 1, borderColor: 'transparent' },
  periodeChipActive: { backgroundColor: COLORS.encre },
  periodeChipTexte: { fontFamily: FONTS.mono, fontSize: 10.5, color: COLORS.encre2 },
  periodeChipTexteActive: { color: COLORS.surface },
  metriqueRangee: { flexDirection: 'row', gap: 6, marginTop: 20 },
  metriqueChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: COLORS.ligne, backgroundColor: COLORS.surface },
  metriqueChipActive: { backgroundColor: COLORS.encre, borderColor: 'transparent' },
  metriqueChipTexte: { fontFamily: FONTS.texteSemi, fontSize: 11.5, color: COLORS.encre2 },
  metriqueChipTexteActive: { color: COLORS.surface },
  barres: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 24 },
  colonne: { flex: 1, alignItems: 'center', gap: 6 },
  barreZone: { height: 74, justifyContent: 'flex-end' },
  barre: { width: 14, backgroundColor: COLORS.ligne, borderRadius: 4, minHeight: 3 },
  barreValeur: { fontSize: 9, color: COLORS.encre3, height: 12 },
  barreLabel: { fontFamily: FONTS.mono, fontSize: 8.5, color: COLORS.encre3 },
  activitePied: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: COLORS.ligne, marginTop: 14, paddingTop: 11 },
  activitePiedTexte: { fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre2 },
  activitePiedTotal: { fontSize: 11, color: COLORS.encre },

  grille: { flexDirection: 'row', gap: 10, marginTop: 20, marginHorizontal: 20 },
  case: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
  },
  caseValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, color: COLORS.encre, letterSpacing: -0.4 },
  caseLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2, marginTop: 3 },

  sortiesNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: RADIUS.l,
    backgroundColor: COLORS.encre,
  },
  sortiesNavTexte: { flex: 1, minWidth: 0 },
  sortiesNavTitre: { fontFamily: FONTS.texteSemi, fontSize: 13.5, color: COLORS.surface },
  sortiesNavDetail: { fontFamily: FONTS.texte, fontSize: 11.5, color: 'rgba(252,251,254,0.62)', marginTop: 2 },

  couleurTexte: {
    fontFamily: FONTS.texte,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.encre2,
    marginTop: 2,
  },
  couleurs: { flexDirection: 'row', gap: 12, marginTop: 14 },
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

  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, paddingBottom: 6 },
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

  voile: { ...StyleSheet.absoluteFillObject, zIndex: 2000, backgroundColor: 'rgba(26, 27, 46, 0.35)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    padding: 22,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 16 },
  feuilleTitre: { fontSize: 21, textAlign: 'center', marginBottom: 4 },
  feuilleScroll: { flexShrink: 1 },
  sectionTitreFeuille: { marginTop: 22, marginBottom: 4 },

  objectifDesc: { fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2, textAlign: 'center', marginTop: 8 },
  objectifStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 24, marginBottom: 6 },
  objectifRond: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.papier, borderWidth: 1, borderColor: COLORS.ligne, alignItems: 'center', justifyContent: 'center' },
  objectifRondTexte: { fontFamily: FONTS.texteSemi, fontSize: 22, color: COLORS.encre },
  objectifCentre: { alignItems: 'center', minWidth: 130 },
  objectifChiffre: { fontFamily: FONTS.display, fontSize: 38, letterSpacing: -1.4, color: COLORS.encre },
  objectifUnite: { fontFamily: FONTS.monoMedium, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', color: COLORS.encre3, marginTop: 2 },
  objectifPas: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre3, textAlign: 'center' },
  objectifValider: { minHeight: 50, marginTop: 22, borderRadius: 16, backgroundColor: COLORS.encre, alignItems: 'center', justifyContent: 'center' },
  objectifValiderTexte: { fontFamily: FONTS.texteSemi, fontSize: 15, color: COLORS.surface },
});
