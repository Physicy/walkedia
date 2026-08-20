// Chrome de l'écran carte : la barre de relevé, la carte d'objectif, et le
// panneau du bas dans ses deux états (prêt à démarrer / session en cours).
//
// L'ancien HUD affichait deux fractions dont le dénominateur bougeait avec les
// déplacements (voir Hud.tsx). Il devient une jauge d'une ligne, et la place
// gagnée va à la carte d'objectif : quel point, à quelle distance, quelle rue
// il manque — une action possible plutôt qu'un chiffre brut.
//
// Pas de nom de rue dans le fil de session : voir junctionInfo.ts, le graphe
// ne porte aucun nom de rue (trop de voies sans nom dans OSM). Le fil décrit
// donc ce qui a été gagné par son type et son ordre, pas par un nom inventé.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Jauge, Mono } from './ui';
import { Icone } from './Icones';
import { Carrefour, Branche } from './Carrefour';

function formatEcoule(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return `il y a ${h} h`;
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function ReleveBar({ trouves, total, couleur }: { trouves: number; total: number; couleur: string }) {
  const ratio = total > 0 ? trouves / total : 0;
  return (
    <View style={styles.releve}>
      <View style={styles.releveTete}>
        <Mono style={styles.releveNombre}>{trouves} tronçons</Mono>
        <Text style={styles.releveSur}>sur {total}</Text>
      </View>
      <Jauge ratio={ratio} couleur={couleur} />
    </View>
  );
}

export function BoutonRecentrer({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.outil} onPress={onPress} accessibilityLabel="Recentrer">
      <Icone nom="recentrer" size={19} color={COLORS.encre} />
    </Pressable>
  );
}

export function ObjectifCard({
  branches,
  eyebrow,
  numero,
  manque,
  distance,
  couleur,
}: {
  branches: Branche[];
  eyebrow: string;
  numero: number | null;
  manque: string[];
  distance: number;
  couleur: string;
}) {
  return (
    <View style={styles.objectif}>
      <Carrefour size={44} branches={branches} couleur={couleur} />
      <View style={styles.objectifTexte}>
        <Text style={styles.objectifEyebrow}>{eyebrow}</Text>
        <Text style={styles.objectifTitre}>{numero != null ? `Point n° ${numero}` : 'Prochain point'}</Text>
        {manque.length > 0 && (
          <Text style={styles.objectifManque}>
            Il te manque <Text style={styles.objectifManqueAccent}>{manque.length > 1 ? 'les rues ' : 'la rue '}{manque.join(' et ')}</Text>
          </Text>
        )}
      </View>
      <Mono style={styles.objectifDistance}>{formatDistance(distance)}</Mono>
    </View>
  );
}

function Poignee() {
  return <View style={styles.poignee} />;
}

export function PanneauPret({
  marcheDetectee,
  onImporterMarche,
  onIgnorerMarche,
  onDemarrer,
}: {
  marcheDetectee: { distanceM: number; minutes: number } | null;
  onImporterMarche: () => void;
  onIgnorerMarche: () => void;
  onDemarrer: () => void;
}) {
  return (
    <View style={styles.socle}>
      <Poignee />
      {marcheDetectee && (
        <View style={styles.marcheRow}>
          <Icone nom="position" size={18} color={COLORS.encre} strokeWidth={1.7} />
          <Text style={styles.marcheTexte}>
            <Text style={styles.marcheTexteGras}>Marche de {formatDistance(marcheDetectee.distanceM)}</Text> détectée{' '}
            {formatEcoule(marcheDetectee.minutes * 60000)}.
          </Text>
          <Pressable onPress={onImporterMarche} hitSlop={8}>
            <Text style={styles.lien}>Importer</Text>
          </Pressable>
          <Pressable onPress={onIgnorerMarche} hitSlop={8} style={styles.marcheFermer}>
            <Icone nom="fermer" size={13} color={COLORS.encre3} strokeWidth={1.8} />
          </Pressable>
        </View>
      )}
      <Bouton onPress={onDemarrer} icone={<Icone nom="lecture" size={17} color={COLORS.surface} />}>
        Démarrer une session
      </Bouton>
    </View>
  );
}

export interface FilEntree {
  id: string;
  type: 'troncon' | 'carrefour';
  at: number;
}

export function PanneauSession({
  duree,
  km,
  gain,
  fil,
  onTerminer,
}: {
  duree: string;
  km: number;
  gain: number;
  fil: FilEntree[];
  onTerminer: () => void;
}) {
  return (
    <View style={styles.socle}>
      <Poignee />
      <View style={styles.compteurs}>
        <View style={styles.compteur}>
          <Mono style={styles.compteurValeur}>{duree}</Mono>
          <Text style={styles.compteurLabel}>durée</Text>
        </View>
        <View style={styles.compteur}>
          <Mono style={styles.compteurValeur}>{km.toFixed(1)} km</Mono>
          <Text style={styles.compteurLabel}>parcourus</Text>
        </View>
        <View style={styles.compteur}>
          <Mono style={[styles.compteurValeur, styles.compteurGain]}>{gain}</Mono>
          <Text style={styles.compteurLabel}>tronçons</Text>
        </View>
      </View>

      {fil.slice(0, 3).map((entree, i) => (
        <View key={entree.id} style={styles.filLigne}>
          <View style={[styles.pastille, i > 0 && styles.pastilleVide]} />
          <Text style={styles.filTexte}>{entree.type === 'carrefour' ? 'Carrefour complété' : 'Nouveau tronçon'}</Text>
          <Mono style={styles.filTemps}>{formatEcoule(Date.now() - entree.at)}</Mono>
        </View>
      ))}

      <Bouton variante="sortie" onPress={onTerminer} style={styles.boutonStop}>
        Terminer la session
      </Bouton>
    </View>
  );
}

const styles = StyleSheet.create({
  releve: {
    flex: 1,
    backgroundColor: 'rgba(251, 250, 253, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
    padding: 13,
  },
  releveTete: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 },
  releveNombre: { fontSize: 13, fontFamily: FONTS.monoSemi, letterSpacing: -0.26 },
  releveSur: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: COLORS.encre3,
  },

  outil: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 250, 253, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },

  objectif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(251, 250, 253, 0.96)',
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.m,
    padding: 12,
  },
  objectifTexte: { flex: 1 },
  objectifEyebrow: {
    fontFamily: FONTS.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    color: COLORS.encre3,
    marginBottom: 3,
  },
  objectifTitre: { fontFamily: FONTS.texteSemi, fontSize: 15, color: COLORS.encre },
  objectifManque: { fontFamily: FONTS.texte, fontSize: 12.5, color: COLORS.encre2, marginTop: 2 },
  objectifManqueAccent: { fontFamily: FONTS.texteSemi, color: COLORS.encre },
  objectifDistance: { fontSize: 13, color: COLORS.encre },

  socle: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.l,
    borderTopRightRadius: RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderBottomWidth: 0,
    padding: 18,
    paddingTop: 10,
    gap: 12,
  },
  poignee: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.ligneForte, alignSelf: 'center', marginBottom: 4 },

  marcheRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  marcheTexte: { flex: 1, fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 17, color: COLORS.encre2 },
  marcheTexteGras: { fontFamily: FONTS.texteSemi, color: COLORS.encre },
  lien: {
    fontFamily: FONTS.texteSemi,
    fontSize: 13,
    color: COLORS.encre,
    textDecorationLine: 'underline',
    padding: 4,
  },
  marcheFermer: { padding: 4 },

  compteurs: { flexDirection: 'row' },
  compteur: { flex: 1, alignItems: 'center', gap: 3 },
  compteurValeur: { fontSize: 19, fontFamily: FONTS.monoSemi, letterSpacing: -0.4 },
  compteurGain: { color: COLORS.trace },
  compteurLabel: { fontFamily: FONTS.texte, fontSize: 11, color: COLORS.encre2 },

  filLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  pastille: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.trace },
  pastilleVide: { backgroundColor: COLORS.ligneForte },
  filTexte: { flex: 1, fontFamily: FONTS.texteMedium, fontSize: 13, color: COLORS.encre },
  filTemps: { fontSize: 10, color: COLORS.encre3 },

  boutonStop: { marginTop: 4 },
});
