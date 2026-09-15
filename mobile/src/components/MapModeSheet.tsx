// Choix du mode de carte (voir logic/mapModes.ts) : une grille d'aperçus,
// puis la saison et le moment pour les modes qui ont une ambiance.
//
// Monté à deux endroits : directement sur l'écran Aventure (bouton sous
// « Recentrer », pour changer de mode sans quitter la carte) et dans
// Réglages > Apparence de la carte. Les deux sont contrôlés : ils affichent
// l'état du hook de jeu et remontent les choix, comme MapAppearanceSheet.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Eyebrow, Titre } from './ui';
import { tabBarHeight } from './TabBar';
import type { Prefs } from '../logic/prefs';
import { MODES_CARTE, ModeCarte, modeCarte, paletteApercu } from '../logic/mapModes';

const SAISONS: { id: Prefs['mapSeason']; nameKey: string }[] = [
  { id: 'auto', nameKey: 'settings.mapSeasonAuto' },
  { id: 'ete', nameKey: 'settings.mapSeasonSummer' },
  { id: 'automne', nameKey: 'settings.mapSeasonAutumn' },
  { id: 'hiver', nameKey: 'settings.mapSeasonWinter' },
];

const MOMENTS: { id: Prefs['mapTime']; nameKey: string }[] = [
  { id: 'auto', nameKey: 'settings.mapTimeAuto' },
  { id: 'jour', nameKey: 'settings.mapTimeDay' },
  { id: 'nuit', nameKey: 'settings.mapTimeNight' },
];

export interface MapModeChoixProps {
  mode: Prefs['mapBackground'];
  onChoisirMode: (id: Prefs['mapBackground']) => void;
  saison: Prefs['mapSeason'];
  onChoisirSaison: (id: Prefs['mapSeason']) => void;
  moment: Prefs['mapTime'];
  onChoisirMoment: (id: Prefs['mapTime']) => void;
  traceColor: string;
}

export function MapModeChoix({ mode, onChoisirMode, saison, onChoisirSaison, moment, onChoisirMoment, traceColor }: MapModeChoixProps) {
  const { t } = useTranslation();
  const ambiance = modeCarte(mode).ambiance;

  return (
    <View>
      <View style={styles.grille}>
        {MODES_CARTE.map((m) => {
          const actif = m.id === mode;
          return (
            <Pressable
              key={m.id}
              style={styles.tuile}
              onPress={() => onChoisirMode(m.id)}
              accessibilityRole="button"
              accessibilityLabel={t(m.nameKey)}
              accessibilityState={{ selected: actif }}
            >
              <View style={[styles.apercuCadre, actif && styles.apercuCadreActif]}>
                <Apercu mode={m} traceColor={traceColor} />
              </View>
              <Text style={[styles.tuileNom, actif && styles.tuileNomActif]} numberOfLines={1}>
                {t(m.nameKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {ambiance ? (
        <>
          <Eyebrow style={styles.section}>{t('settings.mapSeasonTitle')}</Eyebrow>
          <Puces options={SAISONS} valeur={saison} onChoisir={onChoisirSaison} />
          <Eyebrow style={styles.section}>{t('settings.mapTimeTitle')}</Eyebrow>
          <Puces options={MOMENTS} valeur={moment} onChoisir={onChoisirMoment} />
        </>
      ) : (
        <Text style={styles.note}>{t('settings.mapAmbianceFixed')}</Text>
      )}
    </View>
  );
}

export function MapModeSheet({ onFermer, ...choix }: MapModeChoixProps & { onFermer: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // La barre d'onglets (voir TabBar.tsx) est montée par-dessus l'écran carte :
  // le contenu de la feuille remonte au-dessus d'elle plutôt que d'y passer
  // dessous.
  return (
    <Pressable style={styles.voile} onPress={onFermer}>
      <Pressable
        style={[styles.feuille, { paddingBottom: tabBarHeight(insets.bottom) + 14 }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.poignee} />
        <Titre style={styles.titre}>{t('settings.mapModeTitle')}</Titre>
        <MapModeChoix {...choix} />
      </Pressable>
    </Pressable>
  );
}

function Puces<T extends string>({
  options,
  valeur,
  onChoisir,
}: {
  options: { id: T; nameKey: string }[];
  valeur: T;
  onChoisir: (id: T) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.puces}>
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChoisir(o.id)}
            style={[styles.puce, actif && styles.puceActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
          >
            <Text style={[styles.puceTexte, actif && styles.puceTexteActive]} numberOfLines={1}>
              {t(o.nameKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Vignette peinte avec la palette du mode (de jour, en été) : un carrefour,
// deux rues dont une relevée, un chemin et un point atteint. Pas une capture
// de carte : elle doit rester lisible à 70 px et ne rien charger.
function Apercu({ mode, traceColor }: { mode: ModeCarte; traceColor: string }) {
  const p = paletteApercu(mode.id);
  const trace = p.trace ?? traceColor;
  const carre = mode.fond === 'dessin';
  return (
    <View style={[styles.apercu, { backgroundColor: p.sol }]}>
      <View style={[StyleSheet.absoluteFill, mode.inclinaison > 0 && styles.apercuIncline]}>
        <View style={[styles.chemin, { backgroundColor: p.chemin }]} />
        <View style={[styles.rueH, { backgroundColor: p.rue }]} />
        <View style={[styles.rueV, { backgroundColor: p.rue }]} />
        <View style={[styles.traceH, { backgroundColor: trace, borderColor: p.traceBord }]} />
        <View style={[styles.traceV, { backgroundColor: trace, borderColor: p.traceBord }]} />
        <View style={[styles.point, carre ? styles.pointCarre : styles.pointRond, { backgroundColor: trace, borderColor: p.traceBord }]} />
      </View>
    </View>
  );
}

const LARGEUR_RUE = 7;
const TAILLE_POINT = 12;

const styles = StyleSheet.create({
  voile: { ...StyleSheet.absoluteFillObject, zIndex: 1800, backgroundColor: 'rgba(26, 27, 46, 0.35)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    padding: 22,
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 16 },
  titre: { fontSize: 21, textAlign: 'center', marginBottom: 18 },
  section: { marginTop: 18, marginBottom: 8 },

  // Quatre colonnes : 4 x 23 % laisse l'espace entre les tuiles à
  // space-between, sans dépendre de la largeur de l'écran.
  grille: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tuile: { width: '23%', alignItems: 'center' },
  apercuCadre: { width: '100%', padding: 2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  apercuCadreActif: { borderColor: COLORS.encre },
  apercu: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  apercuIncline: { transform: [{ perspective: 220 }, { rotateX: '42deg' }, { scale: 1.3 }] },
  tuileNom: { fontFamily: FONTS.texteMedium, fontSize: 11, color: COLORS.encre2, marginTop: 5, textAlign: 'center' },
  tuileNomActif: { fontFamily: FONTS.texteSemi, color: COLORS.encre },

  chemin: { position: 'absolute', left: 0, right: 0, top: '22%', height: 3 },
  rueH: { position: 'absolute', left: 0, right: 0, top: '58%', height: LARGEUR_RUE },
  rueV: { position: 'absolute', top: 0, bottom: 0, left: '34%', width: LARGEUR_RUE },
  traceH: { position: 'absolute', left: '34%', right: 0, top: '58%', height: LARGEUR_RUE, borderWidth: 1.5 },
  traceV: { position: 'absolute', top: 0, left: '34%', height: '62%', width: LARGEUR_RUE, borderWidth: 1.5 },
  point: {
    position: 'absolute',
    left: '34%',
    top: '58%',
    width: TAILLE_POINT,
    height: TAILLE_POINT,
    marginLeft: -(TAILLE_POINT - LARGEUR_RUE) / 2,
    marginTop: -(TAILLE_POINT - LARGEUR_RUE) / 2,
    borderWidth: 2,
  },
  pointRond: { borderRadius: TAILLE_POINT / 2 },
  pointCarre: { borderRadius: 1 },

  puces: { flexDirection: 'row', gap: 8 },
  puce: { flex: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4, borderRadius: 11, backgroundColor: COLORS.papier },
  puceActive: { backgroundColor: COLORS.encre },
  puceTexte: { fontFamily: FONTS.texteSemi, fontSize: 12, color: COLORS.encre2 },
  puceTexteActive: { color: COLORS.surface },

  note: { fontFamily: FONTS.texte, fontSize: 12, lineHeight: 17, color: COLORS.encre3, marginTop: 14 },
});
