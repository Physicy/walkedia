# Walkedia

Jeu d'exploration du réseau piéton : marche ou cours pour découvrir des chemins
(map matching GPS → réseau OpenStreetMap) et complète des intersections pour
marquer des points.

## Lancer en local

Aucune dépendance à installer — c'est une application web statique :

```
python -m http.server 8123
```

puis ouvrir <http://localhost:8123>.

## Tester sur téléphone

La géolocalisation du navigateur exige un **contexte sécurisé** (HTTPS ou
`localhost`). Une simple adresse IP locale (`http://192.168.x.x`) ne suffit pas.
Options :

- **Hébergement statique** : pousser le dossier tel quel sur GitHub Pages,
  Netlify ou Cloudflare Pages (aucun build nécessaire).
- **Tunnel HTTPS depuis le PC** : `npx localtunnel --port 8123` ou
  `cloudflared tunnel --url http://localhost:8123`.
- **Android + USB** : `chrome://inspect` → port forwarding de 8123, puis
  ouvrir `localhost:8123` sur le téléphone.

Sur mobile, garder l'écran allumé pendant une session : une page web n'a pas
accès au GPS en arrière-plan (limite connue du prototype ; une vraie app
native/Flutter lèvera cette contrainte).

## Fonctionnement

- **Graphe** : ways piétons OSM chargés via Overpass dans un rayon de 800 m,
  découpés aux jonctions puis simplifiés (fusion des nœuds de degré 2) pour que
  chaque arête relie deux vrais nœuds.
- **Extension dynamique** : pendant une session, dès qu'on s'approche à moins
  de 300 m du bord de la zone connue, une nouvelle zone de 800 m est
  téléchargée autour de la position et fusionnée au graphe (données OSM brutes
  cumulées, graphe reconstruit, couverture de session préservée). En cas
  d'échec (serveurs saturés), nouvelle tentative au plus tôt 30 s plus tard.
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
  le réseau principal, donc toutes les voies comptent (règle d'origine). Sur
  la zone urbaine test : 1131 nœuds bruts → 331 après consolidation → 185
  carrefours carrossables.
- **IDs d'arêtes** : dérivés de la géométrie (extrémités + milieu + longueur),
  stables entre sessions et indépendants des IDs OSM.
- **Map matching** : chaque position GPS (précision ≤ 40 m) est projetée sur
  l'arête la plus proche (≤ 30 m) ; l'arête est validée quand les projections
  couvrent une part suffisante de sa longueur (50 % si courte, ~75 % sinon).
- **Progression** : historique d'arêtes et intersections complétées en
  `localStorage` (clé `walkedia-v1`), sauvegarde continue pendant la session.
- **Garde-fou de bord** : les intersections à moins de 100 m du bord de la zone
  chargée ne sont pas évaluées (des branches pourraient manquer).
- **Navigation** : menu footer à trois onglets — *Aventure* (la carte, le
  lancement et l'arrêt des sessions), *Recherche* (réservé, vide pour
  l'instant) et *Profil*. Une session en cours continue d'enregistrer pendant
  qu'on consulte les autres onglets.
- **Profil** : points au total / aujourd'hui / cette semaine (depuis lundi) /
  ce mois-ci, graphique des 7 derniers jours, tronçons découverts, distance
  découverte cumulée et historique des dernières sessions. Chaque complétion
  est horodatée (`completedAt`) ; les points acquis avant l'ajout du suivi
  temporel restent comptés dans le total.

## Structure

- `js/overpass.js` — requête Overpass (types de voies piétonnes, filtres d'accès)
- `js/graph.js` — construction et simplification du graphe, IDs stables
- `js/matching.js` — index spatial en grille + critère de couverture
- `js/storage.js` — persistance locale
- `js/main.js` — carte Leaflet, session GPS, complétion, HUD
- `sw.js`, `manifest.webmanifest` — PWA (installable, shell en cache)

## Debug

Dans la console du navigateur, `window.__walkedia.feedFix(lat, lon, accuracy)`
injecte une position GPS dans la session en cours (utile pour simuler une
marche sans sortir).

## Limites connues (prototype)

- Pas de GPS en arrière-plan (limitation web).
- Map matching géométrique simple, pas de modèle HMM : de rares faux positifs
  restent possibles sur des chemins parallèles très proches (< 30 m).
- Si OSM modifie la géométrie d'un chemin, son ID change et il redevient « à
  découvrir » (les intersections déjà complétées restent acquises).
- Pas encore de synchronisation compte utilisateur (localStorage uniquement).
