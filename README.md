# Walkedia

Jeu d'exploration du réseau piéton : marche ou cours pour découvrir des chemins
(map matching GPS → réseau OpenStreetMap) et complète des intersections pour
marquer des points.

App native **Expo / React Native** (voir [`mobile/`](mobile)) — portage de
l'ancien prototype PWA, avec la même logique métier.

## Lancer en local

```
cd mobile
npm install
npx expo start
```

Scanner le QR code affiché avec l'app **Expo Go** (Android/iOS), sur le même
réseau Wi-Fi que l'ordinateur. Autoriser l'accès à la position au premier
lancement.

Un test GPS réel nécessite un téléphone physique (les simulateurs n'ont pas de
vrai déplacement). En développement (`__DEV__`), un bouton « 🐞 Simuler un
déplacement » sur la carte injecte des positions GPS synthétiques le long du
réseau chargé, pour tester tout le pipeline (matching, progression, HUD, sessions,
profil) sans sortir — équivalent du hook `window.__walkedia.feedFix` de
l'ancien prototype web.

## Fonctionnement

- **Graphe** : ways piétons OSM chargés via Overpass dans un rayon de 800 m,
  découpés aux jonctions puis simplifiés (fusion des nœuds de degré 2) pour que
  chaque arête relie deux vrais nœuds.
- **Extension dynamique** : le suivi de position GPS tourne en continu dès
  l'ouverture de la carte (indépendamment du démarrage d'une session) ; dès
  qu'on s'approche à moins de 300 m du bord de la zone connue, une nouvelle
  zone de 800 m est téléchargée autour de la position et fusionnée au graphe
  (données OSM brutes cumulées, graphe reconstruit, couverture de session
  préservée). En cas d'échec (serveurs saturés), nouvelle tentative au plus
  tôt 30 s plus tard.
- **Carrefours** : le degré est calculé sur les branches *significatives* (les
  impasses de moins de 30 m — entrées de bâtiments, allées — ne comptent pas),
  puis les nœuds de degré ≥ 3 reliés par des arêtes de moins de 25 m sont
  consolidés en un seul carrefour (plafond de 60 m de diagonale par groupe).
  OSM fragmente un carrefour réel en 4 à 8 nœuds (trottoirs, passages piétons,
  chaussées séparées). La fusion n'a lieu que si le lien est un artefact d'un
  seul carrefour réel : arc de rond-point, segment à sens unique, traversée
  piétonne (`footway=crossing`) ou nœud posé sur des chaussées séparées. Deux
  intersections décalées le long d'un même axe, reliées par un tronçon de rue
  à double sens, restent deux carrefours distincts à 3 branches chacun. Un
  carrefour est complété quand toutes ses branches externes significatives
  ont été parcourues ; les micro-arêtes internes (traversées) sont des bonus
  non exigés.
- **Urbain / rural** : chaque zone est classée par densité locale de voirie
  carrossable (grille de 250 m, fenêtre 3×3, seuil `URBAN_MIN_ROAD`). En
  urbain, seuls les carrefours du réseau accessible en voiture (`residential`
  et au-dessus + `living_street`) comptent : les maillages de parcs, places et
  trottoirs ne génèrent plus de points. En rural, les sentiers et chemins sont
  le réseau principal, donc toutes les voies comptent (règle d'origine).
- **IDs d'arêtes** : dérivés de la géométrie (extrémités + milieu + longueur),
  stables entre sessions et indépendants des IDs OSM.
- **Map matching** : chaque position GPS (précision ≤ 40 m) est projetée sur
  l'arête la plus proche (≤ 30 m) ; l'arête est validée quand les projections
  couvrent une part suffisante de sa longueur (50 % si courte, ~75 % sinon).
  Entre deux fix GPS successifs, la position est rééchantillonnée en ligne
  droite tous les 5 m (sauf saut > 150 m ou écart > 20 s, considérés comme
  une coupure).
- **Arrêt automatique** : si la vitesse dépasse 20 km/h (mesure GPS Doppler
  quand disponible, sinon distance/temps entre deux fix) sur au moins deux fix
  GPS consécutifs, la session est arrêtée automatiquement (vélo, voiture…).
- **Import d'une marche oubliée** : le suivi de position tournant en continu
  même hors session, les fix reçus sans session active sont gardés dans un
  tampon glissant (1 h max, purgé au fil de l'eau). Au démarrage d'une
  nouvelle session, si ce tampon représente une marche significative (≥ 80 m),
  l'app propose de l'importer.
- **Progression** : historique d'arêtes et intersections complétées en
  stockage local (`AsyncStorage`), sauvegarde continue pendant la session.
- **Garde-fou de bord** : les intersections à moins de 100 m du bord de la zone
  chargée ne sont pas évaluées (des branches pourraient manquer).
- **Navigation** : menu footer à trois onglets — *Aventure* (la carte, le
  lancement et l'arrêt des sessions), *Recherche* (réservé, vide pour
  l'instant) et *Profil*.
- **Profil** : points au total / aujourd'hui / cette semaine (depuis lundi) /
  ce mois-ci, graphique des 7 derniers jours, tronçons découverts, distance
  découverte cumulée et historique des dernières sessions.

## Structure

- `mobile/src/logic/geo.js` — utilitaires géométriques (projection, distances)
- `mobile/src/logic/overpass.js` — requête Overpass (types de voies piétonnes, filtres d'accès)
- `mobile/src/logic/graph.js` — construction et simplification du graphe, IDs stables
- `mobile/src/logic/matching.js` — index spatial en grille + critère de couverture
- `mobile/src/logic/storage.ts` — persistance locale (`AsyncStorage`)
- `mobile/src/hooks/useWalkedia.ts` — état global, GPS, sessions, complétion
- `mobile/src/screens/` — écrans (démarrage, carte, recherche, profil)
- `mobile/src/components/` — HUD, barre d'onglets, toast, panneau de debug

## Limites connues (prototype)

- Pas de GPS en arrière-plan (l'app doit rester ouverte/au premier plan
  pendant une marche) : ajouter le suivi en arrière-plan est possible via
  `expo-location` + `expo-task-manager`, mais demande un build natif (dev
  client) et des permissions supplémentaires — non fait ici.
- Map matching géométrique simple, pas de modèle HMM : de rares faux positifs
  restent possibles sur des chemins parallèles très proches (< 30 m).
- Si OSM modifie la géométrie d'un chemin, son ID change et il redevient « à
  découvrir » (les intersections déjà complétées restent acquises).
- Pas encore de synchronisation compte utilisateur (stockage local uniquement).
