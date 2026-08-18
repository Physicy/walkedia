// Parcours de première ouverture, affiché avant la connexion (voir App.tsx) :
// demander un compte à quelqu'un qui ne sait pas encore à quoi sert l'app est
// la meilleure façon de le perdre.
//
// Trois écrans : l'intention, la règle apprise au doigt, puis la position.
// L'écran 2 n'avance qu'une fois les quatre branches touchées — l'explication
// vient après le geste, jamais avant.
//
// Tout est dessiné en Views plutôt qu'en SVG : react-native-svg n'est pas dans
// le projet et l'ajouter imposerait un nouveau build du dev client.

import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../theme';

const BRANCHES = ['nord', 'est', 'sud', 'ouest'] as const;
type Branch = (typeof BRANCHES)[number];

function StreetFragment() {
  return (
    <View style={styles.fragment}>
      <View style={[styles.fragH, { top: 34 }]} />
      <View style={[styles.fragH, { top: 96, backgroundColor: COLORS.accentViolet }]} />
      <View style={[styles.fragH, { top: 158 }]} />
      <View style={[styles.fragV, { left: 40 }]} />
      <View style={[styles.fragV, { left: 110, backgroundColor: COLORS.accentViolet }]} />
      <View style={[styles.fragV, { left: 180 }]} />
    </View>
  );
}

function Junction({ taken, onTake }: { taken: Set<Branch>; onTake: (b: Branch) => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const complete = taken.size === BRANCHES.length;

  React.useEffect(() => {
    if (!complete) return;
    Animated.spring(fill, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [complete, fill]);

  const color = (b: Branch) => (taken.has(b) ? COLORS.accentViolet : COLORS.undiscovered);

  return (
    <View style={styles.junction}>
      <Pressable
        hitSlop={12}
        onPress={() => onTake('nord')}
        style={[styles.armV, { top: 0, backgroundColor: color('nord') }]}
      />
      <Pressable
        hitSlop={12}
        onPress={() => onTake('sud')}
        style={[styles.armV, { bottom: 0, backgroundColor: color('sud') }]}
      />
      <Pressable
        hitSlop={12}
        onPress={() => onTake('ouest')}
        style={[styles.armH, { left: 0, backgroundColor: color('ouest') }]}
      />
      <Pressable
        hitSlop={12}
        onPress={() => onTake('est')}
        style={[styles.armH, { right: 0, backgroundColor: color('est') }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.node, { transform: [{ scale: fill }], opacity: fill }]}
      />
    </View>
  );
}

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [taken, setTaken] = useState<Set<Branch>>(new Set());
  const complete = taken.size === BRANCHES.length;

  const take = (b: Branch) => setTaken((prev) => new Set(prev).add(b));
  const next = () => (step === 2 ? onDone() : setStep(step + 1));

  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        {step === 0 && (
          <>
            <StreetFragment />
            <Text style={styles.title}>Ton quartier a des rues que tu n'as jamais prises</Text>
            <Text style={styles.lead}>
              Walkedia garde la trace de celles que tu as marchées. Le reste attend.
            </Text>
          </>
        )}

        {step === 1 && (
          <>
            <Junction taken={taken} onTake={take} />
            <Text style={styles.title}>Touche les quatre rues</Text>
            <Text style={styles.lead}>
              {complete
                ? 'Un carrefour se décroche quand toutes ses rues ont été marchées. C’est la seule règle.'
                : `${taken.size} sur ${BRANCHES.length}.`}
            </Text>
          </>
        )}

        {step === 2 && (
          <>
            <View style={styles.fragment}>
              <View style={styles.positionRing} />
              <View style={styles.positionDot} />
            </View>
            <Text style={styles.title}>L'app suit ta position pendant que tu marches</Text>
            <Text style={styles.lead}>
              Uniquement pour savoir quelles rues tu as prises. Rien n'est envoyé à un tiers, et tu
              peux couper le suivi en arrière-plan à tout moment depuis ton profil.
            </Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.cta, step === 1 && !complete && styles.ctaDisabled]}
          onPress={next}
          disabled={step === 1 && !complete}
        >
          <Text style={styles.ctaText}>{step === 2 ? 'Commencer' : 'Suivant'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ARM = 12;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, padding: 24 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  fragment: {
    width: 220,
    height: 200,
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fragH: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: COLORS.undiscovered },
  fragV: { position: 'absolute', top: 0, bottom: 0, width: 6, borderRadius: 3, backgroundColor: COLORS.undiscovered },

  junction: { width: 200, height: 200, marginBottom: 40 },
  armV: {
    position: 'absolute',
    left: 100 - ARM / 2,
    width: ARM,
    height: 84,
    borderRadius: ARM / 2,
  },
  armH: {
    position: 'absolute',
    top: 100 - ARM / 2,
    height: ARM,
    width: 84,
    borderRadius: ARM / 2,
  },
  node: {
    position: 'absolute',
    left: 100 - 17,
    top: 100 - 17,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accentViolet,
  },

  positionRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: COLORS.accentViolet,
    opacity: 0.35,
  },
  positionDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.accentViolet },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 31,
  },
  lead: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 14,
    lineHeight: 22,
  },

  footer: { gap: 20, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.accentViolet },
  cta: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
