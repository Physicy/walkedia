// Chargement des trois familles du système : Archivo pour les titres,
// Instrument Sans pour le texte courant, Martian Mono pour les chiffres et les
// étiquettes en capitales.
//
// Le mono porte tous les nombres du relevé : il est tabulaire, donc un
// compteur qui s'incrémente ne fait pas danser la mise en page.
//
// Les imports visent le sous-chemin de chaque poids et non la racine du
// paquet : l'index de @expo-google-fonts réexporte toute la famille, italiques
// et Black compris, et chaque réexport est un `require` de .ttf. Importer
// depuis la racine faisait entrer une trentaine de fichiers dans le bundle
// pour neuf réellement utilisés.

import { useFonts } from 'expo-font';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { MartianMono_400Regular } from '@expo-google-fonts/martian-mono/400Regular';
import { MartianMono_500Medium } from '@expo-google-fonts/martian-mono/500Medium';
import { MartianMono_600SemiBold } from '@expo-google-fonts/martian-mono/600SemiBold';

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    MartianMono_400Regular,
    MartianMono_500Medium,
    MartianMono_600SemiBold,
  });
  // Une police manquante ne doit pas retenir l'app indéfiniment : on démarre
  // avec les polices système plutôt que de bloquer sur un écran vide.
  return loaded || !!error;
}
