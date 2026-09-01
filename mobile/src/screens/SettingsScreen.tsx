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
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS } from '../theme';
import { Eyebrow, Jeton, Mono } from '../components/ui';
import { Icone } from '../components/Icones';
import { LanguageRow, LanguageSheet } from '../components/LanguagePicker';
import { MapAppearanceSheet, MAP_LAYERS } from '../components/MapAppearanceSheet';
import type { Prefs } from '../logic/prefs';
import type { useAuth } from '../hooks/useAuth';

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Eyebrow style={styles.sectionTitre}>{titre}</Eyebrow>
      {children}
    </View>
  );
}

// Ligne d'ouverture d'une feuille : même gabarit que les lignes de réglage
// (filet en haut, pas de fond, valeur courante à droite) plutôt que la carte
// posée sur le papier d'avant. « Apparence de la carte » était la seule
// entrée de l'écran à ressembler à un bouton, ce qui la faisait lire comme
// une action alors que c'est un réglage parmi les autres.
function NavRow({ texte, detail, onPress }: { texte: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navRow} accessibilityRole="button" accessibilityLabel={texte}>
      <Text style={styles.navRowTexte}>{texte}</Text>
      {detail && <Text style={styles.navRowDetail}>{detail}</Text>}
      <Icone nom="chevronDroit" size={16} color={COLORS.encre3} strokeWidth={1.9} />
    </Pressable>
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
  notificationsEnabled,
  onToggleNotifications,
  hideStats,
  onToggleHideStats,
  traceColor,
  onChoisirCouleur,
  mapLayer,
  onChoisirCalque,
  mapBackground,
  onChoisirFond,
  onWipeProgress,
  onFermer,
}: {
  auth: ReturnType<typeof useAuth>;
  backgroundTrackingEnabled: boolean;
  onToggleBackgroundTracking: (next: boolean) => void;
  arretAutoVitesse: boolean;
  onToggleArretAutoVitesse: (next: boolean) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: (next: boolean) => void;
  hideStats: boolean;
  onToggleHideStats: (next: boolean) => void;
  traceColor: string;
  onChoisirCouleur: (hex: string) => void;
  mapLayer: Prefs['mapLayer'];
  onChoisirCalque: (id: Prefs['mapLayer']) => void;
  mapBackground: Prefs['mapBackground'];
  onChoisirFond: (id: Prefs['mapBackground']) => void;
  onWipeProgress: () => Promise<void>;
  onFermer: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [confirmeEffacement, setConfirmeEffacement] = useState(false);
  const [effacement, setEffacement] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  // Les deux feuilles sont montées à côté du ScrollView, jamais dedans : celle
  // des langues contient une FlatList, qu'un ScrollView de même orientation
  // au-dessus d'elle casserait (voir LanguagePicker.tsx).
  const [langueOuverte, setLangueOuverte] = useState(false);

  const calqueCourant = MAP_LAYERS.find((l) => l.id === mapLayer);

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
        <Pressable style={styles.rond} onPress={onFermer} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Icone nom="retour" size={18} color={COLORS.encre} strokeWidth={1.9} />
        </Pressable>
        <Text style={styles.titre}>{t('profile.settingsNav')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 26 }} showsVerticalScrollIndicator={false}>
        <Section titre={t('settings.walkSection')}>
          <Reglage
            titre={t('settings.bgTrackingTitle')}
            texte={t('settings.bgTrackingDesc')}
            valeur={backgroundTrackingEnabled}
            onChange={onToggleBackgroundTracking}
          />
          <Reglage
            titre={t('settings.autoStopTitle')}
            texte={t('settings.autoStopDesc')}
            valeur={arretAutoVitesse}
            onChange={onToggleArretAutoVitesse}
          />
        </Section>

        <Section titre={t('settings.notificationsSection')}>
          <Reglage
            titre={t('settings.notificationsTitle')}
            texte={t('settings.notificationsDesc')}
            valeur={notificationsEnabled}
            onChange={onToggleNotifications}
          />
        </Section>

        <Section titre={t('settings.privacySection')}>
          <Reglage
            titre={t('settings.hideStatsTitle')}
            texte={t('settings.hideStatsDesc')}
            valeur={hideStats}
            onChange={onToggleHideStats}
          />
        </Section>

        <Section titre={t('settings.accountSection')}>
          {auth.user ? (
            <View style={styles.compte}>
              <Jeton nom={nom} size={34} />
              <View style={styles.compteTexte}>
                <Text style={styles.compteNom} numberOfLines={1}>
                  {nom || t('settings.accountConnected')}
                </Text>
              </View>
              <Pressable onPress={auth.signOut} hitSlop={8}>
                <Text style={styles.lien}>{t('account.signOut')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.pasDeCompte}>{t('settings.noAccount')}</Text>
          )}
        </Section>

        <Section titre={t('profile.language')}>
          <LanguageRow onPress={() => setLangueOuverte(true)} />
        </Section>

        <Section titre={t('settings.mapAppearanceTitle')}>
          <NavRow
            texte={t('settings.mapLayerSectionTitle')}
            detail={calqueCourant ? t(calqueCourant.nameKey) : undefined}
            onPress={() => setCarteOuverte(true)}
          />
        </Section>

        <Section titre={t('settings.dataSection')}>
          <View style={styles.reglage}>
            <View style={styles.reglageTexte}>
              <Text style={styles.reglageTitre}>{t('settings.wipeTitle')}</Text>
              <Text style={styles.reglageDetail}>
                {confirmeEffacement ? t('settings.wipeConfirmDesc') : t('settings.wipeDesc')}
              </Text>
            </View>
            <Pressable onPress={effacer} disabled={effacement} hitSlop={8}>
              <Text style={styles.lienDanger}>
                {effacement ? '…' : confirmeEffacement ? t('settings.wipeConfirm') : t('settings.wipeAction')}
              </Text>
            </Pressable>
          </View>
        </Section>

        <Mono style={styles.version}>Walkedia 1.0.0</Mono>
      </ScrollView>

      {langueOuverte && <LanguageSheet onFermer={() => setLangueOuverte(false)} />}

      {carteOuverte && (
        <MapAppearanceSheet
          mapLayer={mapLayer}
          onChoisirCalque={onChoisirCalque}
          mapBackground={mapBackground}
          onChoisirFond={onChoisirFond}
          traceColor={traceColor}
          onChoisirCouleur={onChoisirCouleur}
          onFermer={() => setCarteOuverte(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 1900, backgroundColor: COLORS.papier },
  scroll: { flex: 1 },
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

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.ligne,
  },
  navRowTexte: { flex: 1, fontFamily: FONTS.texteSemi, fontSize: 14, color: COLORS.encre },
  navRowDetail: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.encre3 },

  version: {
    textAlign: 'center',
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: COLORS.encre3,
    marginTop: 30,
  },
});
