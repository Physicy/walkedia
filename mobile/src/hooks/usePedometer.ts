// Comptage de pas, isolé de useWalkedia.ts comme useAuth/useFriends/
// useLeaderboard : un capteur de plus n'a pas sa place dans l'état de jeu
// central.
//
// iOS et Android divergent sur ce qu'expo-sensors permet (voir la doc
// versionnée du SDK, vérifiée avant d'écrire ce fichier) :
// - iOS : Pedometer.getStepCountAsync(debut, fin) relit un vrai historique
//   (7 jours max, fourni par CoreMotion) — `stepsToday` est donc exact et
//   survit à un redémarrage de l'app.
// - Android : seul watchStepCount() existe, un compteur EN DIRECT qui ne
//   délivre plus rien dès que l'app passe en arrière-plan. On cumule donc
//   depuis l'ouverture de l'app, persisté (survit à un redémarrage dans la
//   même journée locale) mais sous-estime si le téléphone reste en poche
//   app fermée — c'est le compromis "meilleur effort" retenu plutôt qu'une
//   dépendance Health Connect séparée. Réglages/la modale objectif portent
//   ce texte d'avertissement sur Android (voir traduction `pedometer.androidCaveat`).

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from '../logic/streak';

const KEY = 'walkedia-steps-v1';
// Aligné sur la limite d'historique iOS (Pedometer.getStepCountAsync) : pas
// la peine de garder plus que ce que la source la plus généreuse offre.
const HISTORY_DAYS = 7;

type History = Record<string, number>;

async function loadHistory(): Promise<History> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function pruneHistory(history: History): History {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const cutoffKey = localDateKey(cutoff);
  const pruned: History = {};
  for (const [key, val] of Object.entries(history)) {
    if (key >= cutoffKey) pruned[key] = val;
  }
  return pruned;
}

async function saveHistory(history: History): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(pruneHistory(history)));
  } catch {
    // pas persisté : le compte du jour reste juste en mémoire jusqu'au
    // redémarrage, pas d'échec bloquant pour autant
  }
}

export interface PedometerState {
  disponible: boolean; // false tant que la permission n'est pas accordée ou le capteur absent
  stepsToday: number;
  history: History; // localDateKey -> pas, pour le graphique 7 jours
  meilleurEffortAndroid: boolean; // Android uniquement : signale la limite du comptage en direct
  demanderPermission: () => Promise<boolean>;
}

export function usePedometer(): PedometerState {
  const [disponible, setDisponible] = useState(false);
  const [stepsToday, setStepsToday] = useState(0);
  const [history, setHistory] = useState<History>({});
  const historyRef = useRef<History>({});
  const abonnement = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    let vivant = true;
    loadHistory().then((h) => {
      if (vivant) {
        historyRef.current = h;
        setHistory(h);
      }
    });
    return () => {
      vivant = false;
    };
  }, []);

  const demarrerSuivi = async () => {
    const dispo = await Pedometer.isAvailableAsync();
    if (!dispo) {
      setDisponible(false);
      return;
    }
    setDisponible(true);

    if (Platform.OS === 'ios') {
      const debut = new Date();
      debut.setHours(0, 0, 0, 0);
      try {
        const { steps } = await Pedometer.getStepCountAsync(debut, new Date());
        setStepsToday(steps);
        const key = localDateKey(new Date());
        const next = { ...historyRef.current, [key]: steps };
        historyRef.current = next;
        setHistory(next);
        saveHistory(next);
      } catch {
        // historique indisponible (au-delà de 7 jours, capteur occupé...) :
        // on retombe sur 0 plutôt que de bloquer l'écran
        setStepsToday(0);
      }
    } else {
      // Android : reprend le cumul du jour déjà persisté (redémarrage dans
      // la même journée locale), puis compte en direct par-dessus tant que
      // l'app reste ouverte.
      const key = localDateKey(new Date());
      const dejaCompte = historyRef.current[key] ?? 0;
      setStepsToday(dejaCompte);
      abonnement.current = Pedometer.watchStepCount(({ steps }) => {
        setStepsToday((prev) => {
          const total = dejaCompte + steps;
          const k = localDateKey(new Date());
          const next = { ...historyRef.current, [k]: total };
          historyRef.current = next;
          setHistory(next);
          saveHistory(next);
          return total;
        });
      });
    }
  };

  const demanderPermission = async (): Promise<boolean> => {
    const { status } = await Pedometer.requestPermissionsAsync();
    const accorde = status === 'granted';
    if (accorde) demarrerSuivi();
    return accorde;
  };

  useEffect(() => {
    let vivant = true;
    Pedometer.getPermissionsAsync().then(({ status }) => {
      if (vivant && status === 'granted') demarrerSuivi();
    });
    return () => {
      vivant = false;
      abonnement.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    disponible,
    stepsToday,
    history,
    meilleurEffortAndroid: Platform.OS === 'android',
    demanderPermission,
  };
}
