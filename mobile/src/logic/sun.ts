// Hauteur du soleil au-dessus de l'horizon, pour le moment « auto » des modes
// de carte (voir mapModes.ts) : la carte passe en nuit quand il fait
// réellement nuit là où marche le joueur, pas à une heure fixe qui serait
// fausse l'hiver comme l'été, et d'un fuseau à l'autre.
//
// Algorithme basse précision de l'Astronomical Almanac (position du soleil à
// environ 1° près) : largement assez pour trancher entre jour et nuit, sans
// dépendance. Contrôlé sur Paris au solstice d'été (64,5° à 12:00 UTC,
// -17,7° à 00:00 UTC) et sur le lever du 15 septembre à Vannes.

const RAD = Math.PI / 180;

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export function hauteurSoleil(date: Date, lat: number, lon: number): number {
  // jours écoulés depuis J2000.0
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const longitudeMoyenne = mod(280.46 + 0.9856474 * n, 360);
  const anomalie = mod(357.528 + 0.9856003 * n, 360) * RAD;
  const lambda = (longitudeMoyenne + 1.915 * Math.sin(anomalie) + 0.02 * Math.sin(2 * anomalie)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const ascension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const declinaison = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  // temps sidéral de Greenwich (en heures), puis angle horaire local
  const gmst = mod(18.697374558 + 24.06570982441908 * n, 24);
  const angleHoraire = (gmst * 15 + lon) * RAD - ascension;
  const phi = lat * RAD;
  return (
    Math.asin(Math.sin(phi) * Math.sin(declinaison) + Math.cos(phi) * Math.cos(declinaison) * Math.cos(angleHoraire)) / RAD
  );
}
