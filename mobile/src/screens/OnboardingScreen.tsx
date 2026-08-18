// Parcours de première ouverture.
//
// L'ordre compte : l'onboarding passe avant la connexion, parce que demander un
// compte à quelqu'un qui ne sait pas encore à quoi sert l'app est la meilleure
// façon de le perdre.
//
// Trois écrans ici, un quatrième ailleurs : le dernier temps du parcours est la
// carte réelle avec un repère qui pointe le premier point à décrocher (voir
// MapScreen), pas une maquette de carte. La barre de progression compte donc
// quatre segments dont le dernier s'allume une fois l'onboarding refermé.
//
// L'écran 2 est la pièce maîtresse : on touche les quatre rues d'un carrefour
// du doigt et le point tombe. L'explication vient après le geste, jamais avant.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { COLORS, FONTS } from '../theme';
import { Bouton, Carte, Corps } from '../components/ui';
import { PlanSchema } from '../components/PlanSchema';

const ETAPES = 4;

// [angle en degrés, longueur] — quatre branches d'inégale longueur, parce
// qu'un carrefour parfaitement symétrique se lit comme un pictogramme et pas
// comme un morceau de plan.
const BRANCHES: [number, number][] = [
  [90, 78],
  [8, 84],
  [196, 72],
  [286, 80],
];

const CENTRE = 115;
const LARGEUR_RUE = 26;

function useReduceMotion(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (vivant) setReduit(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit);
    return () => {
      vivant = false;
      sub?.remove();
    };
  }, []);
  return reduit;
}

function Progression({ etape }: { etape: number }) {
  return (
    <View style={styles.progression}>
      {Array.from({ length: ETAPES }, (_, i) => (
        <View key={i} style={[styles.segment, i <= etape && styles.segmentActif]} />
      ))}
    </View>
  );
}

// Le carrefour qu'on marche au doigt.
function Atelier({ reduit }: { reduit: boolean }) {
  const [faites, setFaites] = useState<number[]>([]);
  const complet = faites.length === BRANCHES.length;
  const pop = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!complet) return;
    if (reduit) {
      pop.setValue(1);
      pill.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(pill, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [complet, reduit, pop, pill]);

  const marcher = useCallback((i: number) => {
    setFaites((prev) => (prev.includes(i) ? prev : [...prev, i]));
  }, []);

  const rejouer = () => {
    setFaites([]);
    pop.setValue(0);
    pill.setValue(0);
  };

  return (
    <View style={styles.atelier}>
      {faites.length === 0 ? (
        <Text style={styles.consigne}>Touche chaque rue pour la marcher</Text>
      ) : (
        <Text style={styles.rejouer} onPress={rejouer} accessibilityRole="button">
          Recommencer
        </Text>
      )}

      <Svg width={230} height={230} viewBox="0 0 230 230">
        {BRANCHES.map(([angle, longueur], i) => {
          const rad = (angle * Math.PI) / 180;
          const x2 = CENTRE + Math.cos(rad) * longueur;
          const y2 = CENTRE - Math.sin(rad) * longueur;
          const marchee = faites.includes(i);
          return (
            <React.Fragment key={i}>
              <Line
                x1={CENTRE}
                y1={CENTRE}
                x2={x2}
                y2={y2}
                stroke="#DAD8E4"
                strokeWidth={LARGEUR_RUE}
                strokeLinecap="round"
              />
              {marchee ? (
                <Line
                  x1={CENTRE}
                  y1={CENTRE}
                  x2={x2}
                  y2={y2}
                  stroke={COLORS.trace}
                  strokeWidth={LARGEUR_RUE}
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <Line
                    x1={CENTRE}
                    y1={CENTRE}
                    x2={x2}
                    y2={y2}
                    stroke={COLORS.encre}
                    strokeOpacity={0.3}
                    strokeWidth={2.5}
                    strokeDasharray="8 7"
                  />
                  {/* zone tactile large : la bande dessinée fait 26 px, la cible 44 */}
                  <Line
                    x1={CENTRE}
                    y1={CENTRE}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={44}
                    strokeLinecap="round"
                    onPress={() => marcher(i)}
                    accessible
                    accessibilityLabel={`Marcher la rue ${i + 1}`}
                  />
                </>
              )}
            </React.Fragment>
          );
        })}

        {!complet && (
          <Circle
            cx={CENTRE}
            cy={CENTRE}
            r={LARGEUR_RUE * 0.56}
            fill={COLORS.surface}
            stroke={COLORS.encre}
            strokeOpacity={0.45}
            strokeWidth={3}
          />
        )}
      </Svg>

      {complet && (
        <Animated.View pointerEvents="none" style={[styles.noeudComplet, { transform: [{ scale: pop }] }]} />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.gain,
          {
            opacity: pill,
            transform: [{ translateY: pill.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <Text style={styles.gainTexte}>Carrefour complété · +1 point</Text>
      </Animated.View>
    </View>
  );
}

export function OnboardingScreen({ onDone }: { onDone: (autoriser: boolean) => void }) {
  const [etape, setEtape] = useState(0);
  const reduit = useReduceMotion();
  const insets = useSafeAreaInsets();
  const pied = { paddingBottom: insets.bottom + 22 };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <Progression etape={etape} />

      {etape === 0 && (
        <View style={styles.corps}>
          <View style={styles.contenu}>
            <View style={styles.hero}>
              <PlanSchema
                hauteur={266}
                trace={['M48 190 L176 190 L176 122 L244 122']}
                noeuds={[
                  [176, 190, [[90, true], [0, true], [180, true], [270, false]]],
                  [176, 122, [[90, false], [0, true], [180, false], [270, true]]],
                  [48, 190, [[0, true], [90, false], [180, false], [270, false]]],
                ]}
                moi={[244, 122]}
              />
            </View>
            <Text style={styles.titre}>
              Ton quartier a des rues que tu n'as <Text style={styles.titreAccent}>jamais prises</Text>.
            </Text>
            <Corps>
              Walkedia les compte. Chaque rue que tu marches pour la première fois entre dans ton
              relevé, et le gris recule autour de chez toi.
            </Corps>
          </View>
          <View style={[styles.pied, pied]}>
            <Bouton onPress={() => setEtape(1)}>Commencer</Bouton>
          </View>
        </View>
      )}

      {etape === 1 && (
        <View style={styles.corps}>
          <View style={styles.contenu}>
            <Atelier reduit={reduit} />
            <Text style={styles.titre}>
              Un carrefour complet vaut <Text style={styles.titreAccent}>1 point</Text>.
            </Text>
            <Corps>
              Il faut avoir marché toutes les rues qui partent d'un carrefour, pas seulement l'avoir
              traversé. C'est ce qui pousse à prendre la rue d'à côté plutôt que la même qu'hier.
            </Corps>
          </View>
          <View style={[styles.pied, pied]}>
            <Bouton onPress={() => setEtape(2)}>J'ai compris</Bouton>
          </View>
        </View>
      )}

      {etape === 2 && (
        <View style={styles.corps}>
          <ScrollView contentContainerStyle={styles.contenuPerm} showsVerticalScrollIndicator={false}>
            <Text style={[styles.titre, styles.titrePerm]}>
              Walkedia a besoin de ta <Text style={styles.titreAccent}>position</Text>.
            </Text>
            <Corps>Voilà exactement ce qu'elle en fait.</Corps>

            <View style={styles.permListe}>
              <Carte style={styles.permItem}>
                <Text style={styles.permTitre}>Pendant que tu marches</Text>
                <Text style={styles.permTexte}>
                  Ta position est comparée aux rues du quartier pour cocher celles que tu parcours.
                </Text>
              </Carte>
              <Carte style={styles.permItem}>
                <Text style={styles.permTitre}>Le détail reste sur ton téléphone</Text>
                <Text style={styles.permTexte}>
                  Tes rues sont gardées sur l'appareil. Ce que ton compte synchronise, c'est ta
                  progression, pas ton trajet minute par minute.
                </Text>
              </Carte>
              <Carte style={styles.permItem}>
                <Text style={styles.permTitre}>Tu coupes quand tu veux</Text>
                <Text style={styles.permTexte}>
                  Le suivi en arrière-plan est désactivé par défaut, et se règle depuis ton profil.
                </Text>
              </Carte>
            </View>
          </ScrollView>
          <View style={[styles.pied, pied]}>
            <Bouton onPress={() => onDone(true)}>Autoriser la position</Bouton>
            <Bouton variante="fantome" onPress={() => onDone(false)}>
              Plus tard
            </Bouton>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.papier },

  progression: { flexDirection: 'row', gap: 5, marginHorizontal: 24, marginTop: 14 },
  segment: { height: 3, flex: 1, borderRadius: 2, backgroundColor: COLORS.ligneForte, opacity: 0.35 },
  segmentActif: { opacity: 1, backgroundColor: COLORS.encre },

  corps: { flex: 1 },
  contenu: { flex: 1, paddingHorizontal: 24 },
  pied: { paddingHorizontal: 24, paddingTop: 16, gap: 4 },

  hero: {
    height: 266,
    marginHorizontal: -24,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ligne,
  },

  titre: {
    fontFamily: FONTS.display,
    fontSize: 34,
    lineHeight: 35,
    letterSpacing: -0.85,
    color: COLORS.encre,
    marginTop: 26,
    marginBottom: 12,
  },
  titreAccent: { color: COLORS.trace },
  titrePerm: { marginTop: 34 },

  atelier: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -24,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ligne,
  },
  consigne: {
    position: 'absolute',
    top: 20,
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.encre3,
  },
  rejouer: {
    position: 'absolute',
    top: 14,
    right: 16,
    padding: 6,
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.encre3,
  },
  noeudComplet: {
    position: 'absolute',
    width: LARGEUR_RUE * 1.72,
    height: LARGEUR_RUE * 1.72,
    borderRadius: LARGEUR_RUE * 0.86,
    backgroundColor: COLORS.trace,
    borderWidth: 3.5,
    borderColor: COLORS.traceFonce,
  },
  gain: {
    position: 'absolute',
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: COLORS.trace,
  },
  gainTexte: { fontFamily: FONTS.monoSemi, fontSize: 12, color: '#fff' },

  contenuPerm: { paddingHorizontal: 24, paddingBottom: 16 },
  permListe: { gap: 12, marginTop: 22 },
  permItem: { padding: 15 },
  permTitre: { fontFamily: FONTS.texteSemi, fontSize: 14.5, color: COLORS.encre, marginBottom: 3 },
  permTexte: { fontFamily: FONTS.texte, fontSize: 13, lineHeight: 19, color: COLORS.encre2 },
});
