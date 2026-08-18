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

import { COLORS, FONTS, RADIUS } from '../theme';
import { Bouton, Corps } from '../components/ui';
import { Icone, NomIcone } from '../components/Icones';

type Panne = { icone: NomIcone; titre: string; texte: string; reglages: boolean } | null;

// Le hook ne renvoie qu'une phrase de statut ; c'est elle qui porte la nature
// de la panne. On la reconnaît plutôt que de changer le contrat du hook pour
// cet écran seul.
function lirePanne(status: string): Panne {
  if (/refusé/i.test(status)) {
    return {
      icone: 'positionCoupee',
      titre: 'Walkedia ne peut pas te situer.',
      texte:
        "L'accès à la position est refusé pour cette app. Active-le dans les réglages du téléphone pour reprendre le relevé. Ta progression est intacte.",
      reglages: true,
    };
  }
  if (/indisponible|dépassé|impossible|erreur/i.test(status)) {
    return {
      icone: 'carteMuette',
      titre: "Ce quartier n'a pas pu être chargé.",
      texte:
        'Les quartiers déjà chargés restent affichés, et ta progression est intacte. Réessaie dans un instant.',
      reglages: false,
    };
  }
  return null;
}

export function StartScreen({ status, onLocate }: { status: string; onLocate: () => void }) {
  const panne = lirePanne(status);
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
                <Bouton onPress={() => Linking.openSettings()}>Ouvrir les réglages</Bouton>
                <Bouton variante="fantome" onPress={onLocate}>
                  Réessayer
                </Bouton>
              </>
            ) : (
              <Bouton onPress={onLocate}>Réessayer maintenant</Bouton>
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
      {ecoule >= 15 && (
        <Text style={styles.indice}>
          Les serveurs OpenStreetMap publics peuvent être lents. Le premier chargement d'un quartier
          jamais visité peut prendre jusqu'à une minute ; les suivants sont immédiats.
        </Text>
      )}
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
