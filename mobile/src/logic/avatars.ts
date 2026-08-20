// Registre des avatars sélectionnables (assets/avatars/*.png). `require()`
// doit rester statique pour que Metro les embarque dans le bundle — pas de
// construction dynamique du chemin à partir de l'id.
//
// L'id stocké (voir prefs.ts, profiles.avatar_url) est le nom de fichier sans
// extension : une clé stable, indépendante de l'ordre de cette liste.

export const AVATARS: Record<string, number> = {
  icon_01: require('../../assets/avatars/icon_01.png'),
  icon_02: require('../../assets/avatars/icon_02.png'),
  icon_03: require('../../assets/avatars/icon_03.png'),
  icon_04: require('../../assets/avatars/icon_04.png'),
  icon_05: require('../../assets/avatars/icon_05.png'),
  icon_06: require('../../assets/avatars/icon_06.png'),
  icon_07: require('../../assets/avatars/icon_07.png'),
  icon_08: require('../../assets/avatars/icon_08.png'),
  icon_09: require('../../assets/avatars/icon_09.png'),
  icon_10: require('../../assets/avatars/icon_10.png'),
  icon_11: require('../../assets/avatars/icon_11.png'),
  icon_12: require('../../assets/avatars/icon_12.png'),
  icon_13: require('../../assets/avatars/icon_13.png'),
  icon_14: require('../../assets/avatars/icon_14.png'),
  icon_15: require('../../assets/avatars/icon_15.png'),
  icon_16: require('../../assets/avatars/icon_16.png'),
  icon_17: require('../../assets/avatars/icon_17.png'),
  icon_18: require('../../assets/avatars/icon_18.png'),
  icon_19: require('../../assets/avatars/icon_19.png'),
  icon_20: require('../../assets/avatars/icon_20.png'),
  icon_21: require('../../assets/avatars/icon_21.png'),
  icon_22: require('../../assets/avatars/icon_22.png'),
  icon_23: require('../../assets/avatars/icon_23.png'),
  icon_24: require('../../assets/avatars/icon_24.png'),
  icon_25: require('../../assets/avatars/icon_25.png'),
};

export const AVATAR_IDS = Object.keys(AVATARS);
