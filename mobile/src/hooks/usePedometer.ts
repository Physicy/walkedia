// Compteur de pas du jour, pour la carte objectif du profil (voir
// ProfileScreen.tsx). `Pedometer.watchStepCount` ne renvoie que les pas
// comptés depuis l'appel — jamais un historique — donc `pasAujourdhui` part
// d'une base recalée une fois au montage puis s'additionne au direct :
//  - iOS sait remonter jusqu'à sept jours en arrière (getStepCountAsync), la
//    base est donc le vrai total du jour ;
//  - Android n'a aucun historique via cette API : la base reprend le dernier
//    total connu pour aujourd'hui dans le journal local (stepsLog.ts) plutôt
//    que zéro, pour ne pas perdre les pas d'une session précédente.
// Ni l'un ni l'autre ne rattrape un changement de jour pendant que l'app
// reste ouverte sans jamais repasser en arrière-plan : cas marginal, ignoré.

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { loadStepsLog, recordToday, stepsOnDay, type StepsLog } from '../logic/stepsLog';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface PedometerState {
  disponible: boolean | null; // null tant que la vérification n'est pas faite
  autorise: boolean;
  pasAujourdhui: number;
  journal: StepsLog;
}

export function usePedometer(): PedometerState {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [autorise, setAutorise] = useState(false);
  const [pasAujourdhui, setPasAujourdhui] = useState(0);
  const [journal, setJournal] = useState<StepsLog>({});
  const base = useRef(0);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let annule = false;

    (async () => {
      const log = await loadStepsLog();
      if (annule) return;
      setJournal(log);

      const dispo = await Pedometer.isAvailableAsync().catch(() => false);
      if (annule) return;
      setDisponible(dispo);
      if (!dispo) return;

      const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
      if (annule || !perm?.granted) return;
      setAutorise(true);

      if (Platform.OS === 'ios') {
        const resultat = await Pedometer.getStepCountAsync(startOfToday(), new Date()).catch(() => null);
        base.current = resultat?.steps ?? 0;
      } else {
        base.current = stepsOnDay(log, Date.now());
      }
      if (annule) return;
      setPasAujourdhui(base.current);

      sub = Pedometer.watchStepCount((resultat) => {
        const total = base.current + resultat.steps;
        setPasAujourdhui(total);
        recordToday(total).then(setJournal);
      });
    })();

    return () => {
      annule = true;
      sub?.remove();
    };
  }, []);

  return { disponible, autorise, pasAujourdhui, journal };
}
