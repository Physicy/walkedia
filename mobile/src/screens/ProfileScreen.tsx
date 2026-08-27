// Profil : le relevé d'abord, les réglages et les sorties ailleurs (voir
// SettingsScreen.tsx et ProfileActivityScreen.tsx). L'ancien profil ouvrait
// sur un interrupteur de permission GPS avec quatre lignes de texte gris,
// avant la moindre donnée de jeu — le premier bloc est maintenant le total de
// points. Les sorties et les quartiers, eux, allongeaient l'écran bien après
// le contenu qu'on vient vraiment consulter ici (total, semaine, tronçons) ;
// ils vivent maintenant à un appui de distance plutôt qu'en défilement.
//
// Refonte "encre et papier v3" : niveau, série et objectif de pas rejoignent
// le total en haut d'écran, et le graphique hebdomadaire devient un
// sélecteur période × métrique (voir logic/activity.ts). Réglages passe d'une
// bande pleine largeur à une pastille dans l'en-tête, pour laisser la place à
// ce nouveau bloc sans allonger l'écran d'autant.

import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS, TRACE_PALETTE } from '../theme';
import { Avatar, Bouton, Eyebrow, Mono, Titre } from '../components/ui';
import { Icone, NomIcone } from '../components/Icones';
import { PixelFlame } from '../components/PixelFlame';
import { tabBarHeight } from '../components/TabBar';
import { AVATARS, AVATAR_IDS } from '../logic/avatars';
import { levelInfo } from '../logic/level';
import { currentStreak, type StreakTier } from '../logic/streak';
import { activitySeries, type ActivityMetric, type ActivityPeriod } from '../logic/activity';
import { usePedometer } from '../hooks/usePedometer';
import type { Progress } from '../logic/storage';
import type { useAuth } from '../hooks/useAuth';

const DAY = 86400000;
const PAS_MIN = 1000;
const PAS_MAX = 30000;
const PAS_PALIER = 500;

const STREAK_TIER_KEYS: Record<StreakTier, string> = {
  aucune: 'profile.streakTierAucune',
  debut: 'profile.streakTierDebut',
  demarre: 'profile.streakTierDemarre',
  belle: 'profile.streakTierBelle',
  chaude: 'profile.streakTierChaude',
  ardente: 'profile.streakTierArdente',
};

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
  stepGoal,
  onChoisirObjectif,
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
  stepGoal: number;
  onChoisirObjectif: (steps: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const nombre = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const pedometer = usePedometer();

  const stats = useMemo(() => {
    const today = startOfToday();
    const monday = today - ((new Date().getDay() + 6) % 7) * DAY;

    const debuts = progress.sessions.map((s) => s.start);
    const premiereActivite = debuts.length ? Math.min(...debuts) : null;
    const depuisFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' });

    return {
      total: progress.junctions.size,
      today: pointsBetween(progress, today, Infinity),
      week: pointsBetween(progress, monday, Infinity),
      edges: progress.edges.size,
      km: (progress.edgeMeters / 1000).toFixed(1),
      sessions: progress.sessions.length,
      depuis: premiereActivite != null ? depuisFmt.format(new Date(premiereActivite)) : null,
      niveau: levelInfo(progress.junctions.size),
      serie: currentStreak(progress),
    };
  }, [progress, i18n.language]);

  const [periode, setPeriode] = useState<ActivityPeriod>('week');
  const [metrique, setMetrique] = useState<ActivityMetric>('junctions');
  const activite = useMemo(
    () => activitySeries(progress, pedometer.journal, periode, metrique, i18n.language),
    [progress, pedometer.journal, periode, metrique, i18n.language]
  );
  const activiteMax = Math.max(1, ...activite.buckets.map((b) => b.value));
  // Le violet ne désigne que de la géométrie parcourue ou un point gagné (voir
  // theme.ts) : les pas n'en sont pas, leur barre reste en encre.
  const couleurBarre = metrique === 'steps' ? COLORS.encre : COLORS.trace;

  const PERIODES: { value: ActivityPeriod; label: string }[] = [
    { value: 'week', label: t('profile.periodWeek') },
    { value: 'month', label: t('profile.periodMonth') },
    { value: 'lastMonth', label: t('profile.periodLastMonth') },
    { value: 'year', label: t('profile.periodYear') },
  ];
  const METRIQUES: { value: ActivityMetric; label: string }[] = [
    { value: 'junctions', label: t('profile.metricJunctions') },
    { value: 'steps', label: t('profile.metricSteps') },
    { value: 'segments', label: t('profile.metricSegments') },
  ];
  const periodeLabel = PERIODES.find((p) => p.value === periode)!.label;
  const metriqueLabel = METRIQUES.find((m) => m.value === metrique)!.label;

  const nom = auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || null;
  const [personnaliserOuvert, setPersonnaliserOuvert] = useState(false);
  const [objectifOuvert, setObjectifOuvert] = useState(false);

  const objectifAtteint = pedometer.pasAujourdhui >= stepGoal;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight(insets.bottom) + 26 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tete}>
          <Pressable
            style={styles.rondReglages}
            onPress={onOuvrirReglages}
            accessibilityRole="button"
            accessibilityLabel={t('profile.settingsNav')}
          >
            <Icone nom="reglages" size={17} color={COLORS.encre} strokeWidth={1.7} />
          </Pressable>

          <Pressable
            onPress={() => setPersonnaliserOuvert(true)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.changeAvatarOrColor')}
            style={styles.avatarBouton}
          >
            <Avatar avatarId={avatarId} nom={nom} size={96} />
            <View style={[styles.avatarBadge, { backgroundColor: traceColor }]}>
              <Icone nom="crayon" size={13} color="#fff" strokeWidth={2} />
            </View>
          </Pressable>
          <Text style={styles.eyebrow}>{stats.depuis ? t('profile.trackSince', { date: stats.depuis }) : t('profile.track')}</Text>
          <Titre style={styles.nom}>{nom || t('profile.defaultName')}</Titre>
        </View>

        <Pressable
          onPress={() => setPersonnaliserOuvert(true)}
          style={styles.lignePersonnaliser}
          accessibilityRole="button"
          accessibilityLabel={t('profile.customizeTitle')}
        >
          <View style={styles.lignePersonnaliserAvatar}>
            <Avatar avatarId={avatarId} nom={nom} size={34} />
          </View>
          <View style={styles.ligneNavTextes}>
            <Text style={styles.ligneNavTexte}>{t('profile.customizeTitle')}</Text>
            <Text style={styles.ligneNavDetail}>{t('profile.customizeSubtitle')}</Text>
          </View>
          <Icone nom="chevronDroit" size={16} color={COLORS.encre3} strokeWidth={1.9} />
        </Pressable>

        <View style={styles.total}>
          <Mono style={styles.totalN}>{stats.total}</Mono>
          <View style={styles.totalTexte}>
            <Text style={styles.totalLabel}>{t('profile.junctionsCompletedLabel')}</Text>
            <Text style={styles.totalDetail}>
              {t('profile.weekTodayDetail', { week: stats.week, today: stats.today })}
            </Text>
          </View>
        </View>
        {syncing && <Text style={styles.syncing}>{t('account.syncing')}</Text>}

        <View style={styles.cartes}>
          <View style={styles.carte}>
            <Eyebrow style={styles.carteEyebrow}>{t('profile.levelEyebrow')}</Eyebrow>
            <Mono style={styles.carteNombre}>{stats.niveau.level}</Mono>
            <View style={styles.jauge}>
              <View style={[styles.jaugePleine, { width: `${Math.round(stats.niveau.fraction * 100)}%`, backgroundColor: COLORS.trace }]} />
            </View>
            <Text style={styles.carteDetail}>
              {nombre.format(stats.niveau.courant)} / {nombre.format(stats.niveau.prochain)}
            </Text>
          </View>

          <View style={styles.carte}>
            <Eyebrow style={styles.carteEyebrow}>{t('profile.streakEyebrow')}</Eyebrow>
            <View style={styles.serieLigne}>
              <PixelFlame stage={stats.serie.stage} size={20} />
              <Mono style={styles.carteNombre}>{stats.serie.jours}</Mono>
            </View>
            <Text style={styles.carteDetail}>{t('profile.streakUnit')}</Text>
            <Text style={styles.serieTier} numberOfLines={2}>
              {t(STREAK_TIER_KEYS[stats.serie.tier])}
            </Text>
          </View>

          <Pressable
            style={styles.carte}
            onPress={() => setObjectifOuvert(true)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.goalNav')}
          >
            <Eyebrow style={styles.carteEyebrow}>{t('profile.goalEyebrow')}</Eyebrow>
            <Mono style={styles.carteNombre}>{nombre.format(pedometer.pasAujourdhui)}</Mono>
            <Text style={styles.carteDetail}>{t('profile.stepsUnit')}</Text>
            {pedometer.disponible === false ? (
              <Text style={styles.serieTier} numberOfLines={2}>
                {t('profile.pedometerUnavailable')}
              </Text>
            ) : (
              <Text style={[styles.serieTier, objectifAtteint && styles.objectifAtteintTexte]} numberOfLines={2}>
                {objectifAtteint
                  ? t('profile.goalReached')
                  : t('profile.goalRemaining', { count: nombre.format(Math.max(0, stepGoal - pedometer.pasAujourdhui)) })}
              </Text>
            )}
          </Pressable>
        </View>

        <Eyebrow style={styles.sectionTitre}>{t('profile.activityTitle')}</Eyebrow>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pilules}>
          {PERIODES.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => setPeriode(p.value)}
              style={[styles.pilule, periode === p.value && styles.pilulePleine]}
            >
              <Text style={[styles.piluleTexte, periode === p.value && styles.piluleTextePleine]}>{p.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.segments}>
          {METRIQUES.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setMetrique(m.value)}
              style={[styles.segment, metrique === m.value && styles.segmentPlein]}
            >
              <Text style={[styles.segmentTexte, metrique === m.value && styles.segmentTextePlein]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.barres}>
          {activite.buckets.map((b, i) => {
            const h = activiteMax > 0 ? Math.max(3, Math.round((b.value / activiteMax) * 52)) : 3;
            return (
              <View key={i} style={styles.colonne}>
                <Mono style={[styles.barreValeur, { color: couleurBarre }]}>{b.value || ''}</Mono>
                <View style={[styles.barre, { height: h }, b.value > 0 && { backgroundColor: couleurBarre }]} />
                <Text style={styles.barreJour} numberOfLines={1}>
                  {b.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.activiteResume}>
          <Text style={styles.activiteResumeTexte}>
            {metriqueLabel} · {periodeLabel}
          </Text>
          <Mono style={styles.activiteResumeTotal}>{t('profile.activityTotal', { count: nombre.format(activite.total) })}</Mono>
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
          <View style={[styles.case, styles.caseFin]}>
            <Mono style={styles.caseValeur}>{stats.sessions}</Mono>
            <Text style={styles.caseLabel}>{t('profile.sessionsLabel')}</Text>
          </View>
        </View>

        <LigneNav icone="carte" texte={t('profile.activityNav')} onPress={onOuvrirActivite} />
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
        <ObjectifSheet stepGoal={stepGoal} onChoisirObjectif={onChoisirObjectif} onFermer={() => setObjectifOuvert(false)} />
      )}
    </View>
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

// Objectif de pas : réglé à part plutôt qu'en permanence sur la carte du
// profil pour la même raison que la personnalisation — un réglage qu'on pose
// une fois et qu'on retouche rarement. La série (voir logic/streak.ts)
// avance d'un jour à chaque objectif atteint, d'où le rappel dans la fiche.
function ObjectifSheet({
  stepGoal,
  onChoisirObjectif,
  onFermer,
}: {
  stepGoal: number;
  onChoisirObjectif: (steps: number) => void;
  onFermer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nombre = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const [valeur, setValeur] = useState(stepGoal);

  const ajuster = (delta: number) => setValeur((v) => Math.max(PAS_MIN, Math.min(PAS_MAX, v + delta)));

  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
        <View style={styles.poignee} />
        <Titre style={styles.feuilleTitre}>{t('profile.goalSheetTitle')}</Titre>
        <Text style={styles.couleurTexte}>{t('profile.goalSheetDesc')}</Text>

        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperBouton}
            onPress={() => ajuster(-PAS_PALIER)}
            disabled={valeur <= PAS_MIN}
            accessibilityRole="button"
            accessibilityLabel="-"
          >
            <Text style={styles.stepperSigne}>−</Text>
          </Pressable>
          <View style={styles.stepperValeur}>
            <Mono style={styles.stepperNombre}>{nombre.format(valeur)}</Mono>
            <Eyebrow style={styles.stepperUnite}>{t('profile.goalStepperUnit')}</Eyebrow>
          </View>
          <Pressable
            style={styles.stepperBouton}
            onPress={() => ajuster(PAS_PALIER)}
            disabled={valeur >= PAS_MAX}
            accessibilityRole="button"
            accessibilityLabel="+"
          >
            <Text style={styles.stepperSigne}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.stepperHint}>{t('profile.goalStepperHint')}</Text>

        <Bouton onPress={() => { onChoisirObjectif(valeur); onFermer(); }} style={styles.stepperSave}>
          {t('profile.goalSave')}
        </Bouton>
      </Pressable>
    </Pressable>
  );
}

// Ligne de navigation vers un autre écran (sorties & quartiers) : une bande
// pleine largeur au fil du profil, plus facile à repérer et à toucher qu'une
// pastille isolée.
function LigneNav({ icone, texte, onPress }: { icone: NomIcone; texte: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.ligneNav} accessibilityRole="button" accessibilityLabel={texte}>
      <View style={styles.ligneNavIcone}>
        <Icone nom={icone} size={17} color={COLORS.encre} strokeWidth={1.7} />
      </View>
      <Text style={styles.ligneNavTexte}>{texte}</Text>
      <Icone nom="chevronDroit" size={16} color={COLORS.encre3} strokeWidth={1.9} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1600, backgroundColor: COLORS.papier },
  scroll: { flex: 1 },

  tete: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  rondReglages: {
    alignSelf: 'flex-end',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarBouton: { marginBottom: 14 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: COLORS.encre3,
    marginBottom: 6,
    textAlign: 'center',
  },
  nom: { fontSize: 24, textAlign: 'center' },

  lignePersonnaliser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 16,
  },
  lignePersonnaliserAvatar: { borderRadius: 17, overflow: 'hidden' },

  ligneNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 16,
  },
  ligneNavIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ligneNavTextes: { flex: 1 },
  ligneNavTexte: { fontFamily: FONTS.texteSemi, fontSize: 14.5, color: COLORS.encre },
  ligneNavDetail: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre2, marginTop: 1 },

  total: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, marginTop: 18 },
  totalN: { fontFamily: FONTS.display, fontSize: 60, lineHeight: 60, color: COLORS.trace, letterSpacing: -1.2 },
  totalTexte: { flex: 1 },
  totalLabel: { fontFamily: FONTS.texteSemi, fontSize: 14.5, color: COLORS.encre },
  totalDetail: { fontFamily: FONTS.texte, fontSize: 12.5, color: COLORS.encre2, marginTop: 2 },
  syncing: { fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre3, paddingHorizontal: 20, marginTop: 6 },

  cartes: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20 },
  carte: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
    padding: 11,
    gap: 3,
  },
  carteEyebrow: { fontSize: 8.5, letterSpacing: 0.9, marginBottom: 1 },
  carteNombre: { fontFamily: FONTS.monoSemi, fontSize: 21, color: COLORS.encre, letterSpacing: -0.4 },
  carteDetail: { fontFamily: FONTS.mono, fontSize: 9.5, color: COLORS.encre3 },
  jauge: { height: 4, borderRadius: 2, backgroundColor: COLORS.ligne, overflow: 'hidden', marginVertical: 2 },
  jaugePleine: { height: '100%', borderRadius: 2 },
  serieLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serieTier: { fontFamily: FONTS.texteSemi, fontSize: 10.5, color: COLORS.flamme, marginTop: 1 },
  objectifAtteintTexte: { color: COLORS.encre },

  sectionTitre: { paddingHorizontal: 20, marginTop: 26, marginBottom: 10 },

  pilules: { paddingHorizontal: 20, gap: 8 },
  pilule: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    backgroundColor: COLORS.surface,
  },
  pilulePleine: { backgroundColor: COLORS.encre, borderColor: COLORS.encre },
  piluleTexte: { fontFamily: FONTS.texteMedium, fontSize: 12.5, color: COLORS.encre2 },
  piluleTextePleine: { color: COLORS.surface },

  segments: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.s,
    borderWidth: 1,
    borderColor: COLORS.ligne,
  },
  segmentPlein: { backgroundColor: COLORS.papier, borderColor: COLORS.ligneForte },
  segmentTexte: { fontFamily: FONTS.texteMedium, fontSize: 12.5, color: COLORS.encre3 },
  segmentTextePlein: { color: COLORS.encre, fontFamily: FONTS.texteSemi },

  barres: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 72, paddingHorizontal: 20, marginTop: 18 },
  colonne: { flex: 1, alignItems: 'center', gap: 7 },
  barre: { width: 14, backgroundColor: COLORS.ligne, borderRadius: 3, minHeight: 3 },
  barreValeur: { fontSize: 10, fontFamily: FONTS.monoSemi, color: COLORS.trace, height: 13 },
  barreJour: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.encre3 },

  activiteResume: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10 },
  activiteResumeTexte: { fontFamily: FONTS.texte, fontSize: 12, color: COLORS.encre2 },
  activiteResumeTotal: { fontSize: 12, color: COLORS.encre3 },

  grille: { flexDirection: 'row', borderTopWidth: 1, borderColor: COLORS.ligne, marginTop: 20, marginHorizontal: 20 },
  case: { flex: 1, paddingVertical: 15, paddingHorizontal: 4, borderRightWidth: 1, borderColor: COLORS.ligne },
  caseFin: { borderRightWidth: 0 },
  caseValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, color: COLORS.encre, letterSpacing: -0.4 },
  caseLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2, marginTop: 2 },

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

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 24 },
  stepperBouton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    backgroundColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSigne: { fontFamily: FONTS.texteSemi, fontSize: 20, color: COLORS.encre, lineHeight: 22 },
  stepperValeur: { alignItems: 'center', minWidth: 120 },
  stepperNombre: { fontFamily: FONTS.display, fontSize: 34, color: COLORS.encre, letterSpacing: -0.6 },
  stepperUnite: { marginTop: 4 },
  stepperHint: { textAlign: 'center', fontFamily: FONTS.texte, fontSize: 11.5, color: COLORS.encre3, marginTop: 14 },
  stepperSave: { marginTop: 22 },
});
