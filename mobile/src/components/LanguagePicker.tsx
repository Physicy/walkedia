import React, { useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../theme';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language);

  const choose = async (code: LanguageCode) => {
    setOpen(false);
    const { rtlChanged } = await setLanguage(code);
    if (rtlChanged) {
      // eslint-disable-next-line no-alert
      Alert.alert(t('profile.language'), t('profile.restartForRtl'));
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.box} onPress={() => setOpen(true)}>
        <Text style={styles.label}>{t('profile.language')}</Text>
        <Text style={styles.value}>{current?.name ?? i18n.language}</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('profile.chooseLanguage')}</Text>
            <FlatList
              data={SUPPORTED_LANGUAGES}
              keyExtractor={(l) => l.code}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => choose(item.code)}>
                  <Text style={[styles.rowText, item.code === i18n.language && styles.rowTextActive]}>{item.name}</Text>
                  {item.code === i18n.language && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  value: { color: COLORS.textMuted, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '70%',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  sheetTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  rowText: { color: COLORS.textMuted, fontSize: 15 },
  rowTextActive: { color: COLORS.text, fontWeight: '700' },
  check: { color: COLORS.accentGreen, fontSize: 16, fontWeight: '700' },
});
