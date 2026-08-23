// Système de traduction : catalogues statiques (voir locales/*.json) chargés
// dans i18next, pas de traduction à la volée via une API externe — voir la
// discussion avec l'utilisateur : plus rapide, fonctionne hors-ligne, pas de
// coût récurrent. La langue initiale est déduite de la langue du téléphone
// (expo-localization, synchrone) puis corrigée dès que la préférence
// éventuellement sauvegardée par l'utilisateur (AsyncStorage) est relue —
// cette seconde étape est asynchrone mais quasi instantanée, donc le léger
// re-render qu'elle déclenche est imperceptible.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import fr from './locales/fr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import it from './locales/it.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';
import pl from './locales/pl.json';
import ro from './locales/ro.json';
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import hr from './locales/hr.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import el from './locales/el.json';
import tr from './locales/tr.json';
import da from './locales/da.json';
import sv from './locales/sv.json';
import nb from './locales/nb.json';
import fi from './locales/fi.json';
import hu from './locales/hu.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ar from './locales/ar.json';
import hi from './locales/hi.json';
import th from './locales/th.json';
import vi from './locales/vi.json';
import ms from './locales/ms.json';
import id from './locales/id.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'ro', name: 'Română' },
  { code: 'cs', name: 'Čeština' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'da', name: 'Dansk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'nb', name: 'Norsk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'hu', name: 'Magyar' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'id', name: 'Bahasa Indonesia' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];
const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as string[];
const RTL_LANGUAGES = new Set(['ar']);
const LANG_STORAGE_KEY = 'walkedia-lang';

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  de: { translation: de },
  es: { translation: es },
  it: { translation: it },
  nl: { translation: nl },
  pt: { translation: pt },
  pl: { translation: pl },
  ro: { translation: ro },
  cs: { translation: cs },
  sk: { translation: sk },
  hr: { translation: hr },
  ru: { translation: ru },
  uk: { translation: uk },
  el: { translation: el },
  tr: { translation: tr },
  da: { translation: da },
  sv: { translation: sv },
  nb: { translation: nb },
  fi: { translation: fi },
  hu: { translation: hu },
  'zh-Hans': { translation: zhHans },
  'zh-Hant': { translation: zhHant },
  ja: { translation: ja },
  ko: { translation: ko },
  ar: { translation: ar },
  hi: { translation: hi },
  th: { translation: th },
  vi: { translation: vi },
  ms: { translation: ms },
  id: { translation: id },
};

// Devine la langue de démarrage depuis les réglages du téléphone (synchrone,
// donc disponible dès le premier rendu, avant même la lecture d'
// AsyncStorage). Le chinois a deux entrées séparées (Hans/Hant) : on
// distingue simplifié/traditionnel via la région du script système.
function guessDeviceLanguage(): LanguageCode {
  const locales = Localization.getLocales();
  for (const l of locales) {
    if (l.languageCode === 'zh') {
      return l.languageScriptCode === 'Hant' || l.regionCode === 'TW' || l.regionCode === 'HK' || l.regionCode === 'MO'
        ? 'zh-Hant'
        : 'zh-Hans';
    }
    if (l.languageCode && SUPPORTED_CODES.includes(l.languageCode)) {
      return l.languageCode as LanguageCode;
    }
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: guessDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

applyRtl(i18n.language);

export async function loadSavedLanguage() {
  try {
    const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (saved && SUPPORTED_CODES.includes(saved) && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
      applyRtl(saved);
    }
  } catch {
    // pas de préférence sauvegardée ou stockage indisponible : on garde la langue devinée
  }
}

// I18nManager.forceRTL ne prend effet qu'après redémarrage de l'app (limite
// React Native) : on le pose quand même tout de suite pour que le prochain
// démarrage à froid soit correct, et on prévient l'utilisateur dans l'écran
// Profil (voir ProfileScreen.tsx) qu'un redémarrage manuel est nécessaire
// pour que la mise en page (pas le texte, déjà bidi-correct) s'inverse.
function applyRtl(lang: string) {
  const shouldBeRtl = RTL_LANGUAGES.has(lang);
  if (I18nManager.isRTL !== shouldBeRtl) {
    I18nManager.allowRTL(shouldBeRtl);
    I18nManager.forceRTL(shouldBeRtl);
  }
}

export async function setLanguage(code: LanguageCode) {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    // stockage indisponible : la préférence ne survivra pas à un redémarrage
  }
  const wasRtl = I18nManager.isRTL;
  applyRtl(code);
  return { rtlChanged: wasRtl !== I18nManager.isRTL };
}

export default i18n;
