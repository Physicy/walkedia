// Rappel d'objectif quotidien + notification de point débloqué. Isolé comme
// les autres modules de logique (prefs.ts, streak.ts) : pas d'état React
// ici, seulement des fonctions appelées depuis useWalkedia.ts et Réglages.
//
// La permission est demandée au premier `toggleNotifications(true)`, jamais
// au démarrage — même règle que la position (voir App.tsx, StartScreen) :
// ne rien demander avant que le joueur en ait exprimé le besoin.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REMINDER_ID = 'walkedia-objectif-quotidien';
const CHANNEL_ID = 'walkedia-defaut';
// Heure fixe raisonnable : assez tard pour connaître le total du jour, assez
// tôt pour encore pouvoir sortir marcher.
const REMINDER_HOUR = 19;
const REMINDER_MINUTE = 0;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Walkedia',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Reprogramme (ou annule) le rappel quotidien. À rappeler à chaque
// changement de `notificationsEnabled` ou de l'objectif de pas — le contenu
// du rappel dépend de l'objectif, donc un simple toggle ne suffit pas à le
// garder à jour.
export async function scheduleGoalReminder(goal: number, enabled: boolean, texte: { titre: string; corps: (goal: number) => string }): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!enabled) return;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: texte.titre, body: texte.corps(goal) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: REMINDER_HOUR, minute: REMINDER_MINUTE },
  });
}

export async function cancelGoalReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}

// Notification immédiate à l'ouverture d'un point : déclenchée juste à côté
// du toast existant (voir useWalkedia.ts, l'appel à `toast(...)` pour un
// point gagné), pas à sa place — le toast reste le retour dans l'app, la
// notification est ce qui arrive si l'app est en arrière-plan.
export async function notifyJunctionUnlocked(titre: string, corps: string): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: titre, body: corps },
    trigger: null,
  });
}
