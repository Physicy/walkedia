// Réglages : sortis du profil, où ils occupaient le premier bloc avant toute
// donnée de jeu (voir ProfileScreen.tsx). Chaque règle qui peut se couper est
// ici, expliquée — pas juste nommée.
//
// Pas de réglage d'unités ni d'export GeoJSON : aucun des deux n'est câblé
// nulle part ailleurs dans l'app (le premier demanderait de refaire tous les
// points d'affichage de distance, le second une dépendance de partage de
// fichiers pas encore installée). Un bouton qui ne fait rien serait pire
// qu'un bouton absent.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS } from '../theme';
import { Eyebrow, Jeton, Mono } from '../components/ui';
import { Icone } from '../components/Icones';
import type { useAuth } from '../hooks/useAuth';

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Eyebrow style={styles.sectionTitre}>{titre}</Eyebrow>
      {children}
    </View>
  );
}

function Reglage({
  titre,
  texte,
  valeur,
  onChange,
}: {
  titre: string;
  texte: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.reglage}>
      <View style={styles.reglageTexte}>
        <Text style={styles.reglageTitre}>{titre}</Text>
        <Text style={styles.reglageDetail}>{texte}</Text>
      </View>
      <Switch
        value={valeur}
        onValueChange={onChange}
        trackColor={{ false: COLORS.papier, true: COLORS.encre }}
        thumbColor={COLORS.surface}
        ios_backgroundColor={COLORS.papier}
      />
    </View>
  );
}

export function SettingsScreen({
  auth,
  backgroundTrackingEnabled,
  onToggleBackgroundTracking,
  arretAutoVitesse,
  onToggleArretAutoVitesse,
  onWipeProgress,
  onFermer,
}: {
  auth: ReturnType<typeof useAuth>;
  backgroundTrackingEnabled: boolean;
  onToggleBackgroundTracking: (next: boolean) => void;
  arretAutoVitesse: boolean;
  onToggleArretAutoVitesse: (next: boolean) => void;
  onWipeProgress: () => Promise<void>;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [confirmeEffacement, setConfirmeEffacement] = useState(false);
  const [effacement, setEffacement] = useState(false);

  const nom =
    auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || auth.user?.email || null;

  const effacer = async () => {
    if (!confirmeEffacement) {
      setConfirmeEffacement(true);
      return;
    }
    setEffacement(true);
    try {
      await onWipeProgress();
    } finally {
      setEffacement(false);
      setConfirmeEffacement(false);
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.tete}>
        <Pressable style={styles.rond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Retour">
          <Icone nom="retour" size={18} color={COLORS.encre} strokeWidth={1.9} />
        </Pressable>
        <Text style={styles.titre}>Réglages</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 26 }} showsVerticalScrollIndicator={false}>
        <Section titre="Marche">
          <Reglage
            titre="Détecter mes marches hors de l'app"
            texte="Walkedia note tes trajets en arrière-plan et te propose de les importer au retour. Coupe-le quand tu veux."
            valeur={backgroundTrackingEnabled}
            onChange={onToggleBackgroundTracking}
          />
          <Reglage
            titre="Arrêter la session en véhicule"
            texte="Au-dessus de 20 km/h, la session s'arrête toute seule. Désactive si tu marches vite en descente et que ça te coupe à tort."
            valeur={arretAutoVitesse}
            onChange={onToggleArretAutoVitesse}
          />
        </Section>

        <Section titre="Compte">
          {auth.user ? (
            <View style={styles.compte}>
              <Jeton nom={nom} size={34} />
              <View style={styles.compteTexte}>
                <Text style={styles.compteNom} numberOfLines={1}>
                  {nom || 'Compte connecté'}
                </Text>
              </View>
              <Pressable onPress={auth.signOut} hitSlop={8}>
                <Text style={styles.lien}>Se déconnecter</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.pasDeCompte}>Pas de compte : ton relevé reste sur cet appareil.</Text>
          )}
        </Section>

        <Section titre="Mes données">
          <View style={styles.reglage}>
            <View style={styles.reglageTexte}>
              <Text style={styles.reglageTitre}>Effacer ma progression</Text>
              <Text style={styles.reglageDetail}>
                {confirmeEffacement
                  ? 'Sans retour possible. Touche à nouveau pour confirmer.'
                  : 'Supprime les rues, les points et les sessions, sur l’appareil et sur le compte.'}
              </Text>
            </View>
            <Pressable onPress={effacer} disabled={effacement} hitSlop={8}>
              <Text style={styles.lienDanger}>{effacement ? '…' : confirmeEffacement ? 'Confirmer' : 'Effacer'}</Text>
            </Pressable>
          </View>
        </Section>

        <Mono style={styles.version}>Walkedia 1.0.0</Mono>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1900, backgroundColor: COLORS.papier },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
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
  titre: { fontFamily: FONTS.display, fontSize: 21, letterSpacing: -0.42, color: COLORS.encre, flex: 1 },

  section: { marginTop: 22, paddingHorizontal: 20 },
  sectionTitre: { marginBottom: 4 },

  reglage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },
  reglageTexte: { flex: 1 },
  reglageTitre: { fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre, marginBottom: 3 },
  reglageDetail: { fontFamily: FONTS.texte, fontSize: 12.5, lineHeight: 18, color: COLORS.encre2 },

  compte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },
  compteTexte: { flex: 1 },
  compteNom: { fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  pasDeCompte: {
    fontFamily: FONTS.texte,
    fontSize: 13,
    color: COLORS.encre2,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },

  lien: {
    fontFamily: FONTS.texteSemi,
    fontSize: 13,
    color: COLORS.encre2,
    textDecorationLine: 'underline',
    padding: 4,
  },
  lienDanger: {
    fontFamily: FONTS.texteSemi,
    fontSize: 13,
    color: COLORS.alerte,
    textDecorationLine: 'underline',
    padding: 4,
  },

  version: {
    textAlign: 'center',
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: COLORS.encre3,
    marginTop: 30,
  },
});
