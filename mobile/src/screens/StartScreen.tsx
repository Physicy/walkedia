// Écran de démarrage : le temps que la géolocalisation aboutisse et que la
// zone se calcule.
//
// Le statut est affiché même hors erreur, avec un décompte : un spinner nu ne
// se distingue pas d'un blocage réel pendant les 10 à 30 secondes (parfois
// plus) que prend le premier calcul d'une zone jamais visitée. Les zones déjà
// en cache reviennent immédiatement (voir logic/region.ts).
//
// En cas d'échec, la panne est nommée plutôt que rendue par une ligne d'ambre :
// « position refusée » et « zone indisponible » demandent deux gestes
// différents, et une seule des deux se répare depuis l'app.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Corps } from '../components/ui';
import { Icone, NomIcone } from '../components/Icones';
import type { StartStatusKind } from '../hooks/useWalkedia';

type Panne = { icone: NomIcone; titre: string; texte: string; reglages: boolean } | null;

// `kind` porte la nature de la panne (voir useWalkedia.ts) : le statut lui-
// même est un texte traduit, donc son contenu ne peut plus servir à deviner
// s'il s'agit d'un refus de permission ou d'une autre erreur — auparavant
// reconnu par une regex sur le français, cassée dès qu'on a traduit ce texte.
function lirePanne(kind: StartStatusKind, t: (key: string) => string): Panne {
  if (kind === 'permissionDenied') {
    return {
      icone: 'positionCoupee',
      titre: t('start.permissionDeniedTitle'),
      texte: t('start.permissionDeniedBody'),
      reglages: true,
    };
  }
  if (kind === 'error') {
    return {
      icone: 'carteMuette',
      titre: t('start.zoneErrorTitle'),
      texte: t('start.zoneErrorBody'),
      reglages: false,
    };
  }
  return null;
}

export function StartScreen({
  status,
  kind,
  onLocate,
}: {
  status: string;
  kind: StartStatusKind;
  onLocate: () => void;
}) {
  const { t } = useTranslation();
  const panne = lirePanne(kind, t);
  const [ecoule, setEcoule] = useState(0);
  const depuis = useRef(Date.now());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (panne) return;
    depuis.current = Date.now();
    setEcoule(0);
    const id = setInterval(() => setEcoule(Math.round((Date.now() - depuis.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status, panne]);

  if (panne) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.carte}>
          <View style={styles.rond}>
            <Icone nom={panne.icone} size={20} color={COLORS.encre} strokeWidth={1.9} />
          </View>
          <Text style={styles.titre}>{panne.titre}</Text>
          <Corps style={styles.texte}>{panne.texte}</Corps>
          <View style={styles.actions}>
            {panne.reglages ? (
              <>
                <Bouton onPress={() => Linking.openSettings()}>{t('start.openSettings')}</Bouton>
                <Bouton variante="fantome" onPress={onLocate}>
                  {t('common.retry')}
                </Bouton>
              </>
            ) : (
              <Bouton onPress={onLocate}>{t('start.retryNow')}</Bouton>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <ActivityIndicator color={COLORS.trace} />
      {!!status && (
        <Text style={styles.statut}>
          {status}
          {ecoule >= 5 ? ` (${ecoule} s)` : ''}
        </Text>
      )}
      {ecoule >= 15 && <Text style={styles.indice}>{t('start.slowServersHint')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.papier,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carte: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.ligne,
    borderRadius: RADIUS.l,
    padding: 24,
  },
  rond: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.papier,
    borderWidth: 1,
    borderColor: COLORS.ligneForte,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titre: {
    fontFamily: FONTS.display,
    fontSize: 21,
    lineHeight: 24,
    letterSpacing: -0.42,
    color: COLORS.encre,
    marginBottom: 8,
  },
  texte: { fontSize: 13.5, lineHeight: 20 },
  actions: { gap: 8, marginTop: 20 },

  statut: {
    fontFamily: FONTS.texte,
    fontSize: 13,
    color: COLORS.encre2,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 14,
  },
  indice: {
    fontFamily: FONTS.texte,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.encre3,
    textAlign: 'center',
    maxWidth: 290,
    marginTop: 8,
  },
});
