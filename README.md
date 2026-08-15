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

### Compte, synchronisation, classement, amis

Fonctionne au-dessus d'un projet [Supabase](https://supabase.com) (gratuit).
Sans configuration, l'app fonctionne normalement (carte, sessions,
progression locale) mais la connexion est désactivée.

1. Créer un projet Supabase, puis appliquer `supabase/migrations/0001_init.sql`
   (SQL Editor du dashboard, ou `supabase db push` avec la CLI).
2. `cp mobile/.env.example mobile/.env` et renseigner `EXPO_PUBLIC_SUPABASE_URL`
   / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
3. Pour la connexion Google/Apple : `useAuth.ts` délègue tout le flux OAuth à
   Supabase (`supabase.auth.signInWithOAuth`), donc **rien à mettre dans
   `.env`** pour ça — tout se configure côté dashboard Supabase
   (Authentication → Providers) :
   - **Google** : créer un OAuth Client ID *Web application* (Google Cloud
     Console → APIs & Services → Credentials), avec comme *Authorized
     redirect URI* `https://<ref-projet>.supabase.co/auth/v1/callback`.
     Renseigner le Client ID **et** le Client Secret générés dans
     Supabase → Authentication → Providers → Google.
   - **Apple** : créer un Services ID Sign in with Apple (Apple Developer,
     compte payant requis), même principe côté Supabase → Providers → Apple.
   - Dans les deux cas, ajouter `walkedia://` comme URL de redirection
     autorisée côté Supabase (Authentication → URL Configuration).

**Important** : la redirection OAuth utilise un scheme d'URL personnalisé
(`walkedia://`), non supporté par Expo Go. Tout le reste de l'app (carte,
GPS, sessions) continue de fonctionner en Expo Go — seuls les boutons de
connexion nécessitent un **dev client** :

```
cd mobile
npx eas login          # compte Expo gratuit
eas build --profile development --platform android
```

Installer l'APK généré sur le téléphone, puis lancer `npx expo start` et
s'y connecter depuis cette app (au lieu de scanner le QR code avec Expo Go).

## Fonctionnement

- **Graphe** : ways piétons OSM découpés aux jonctions puis simplifiés (fusion
  des nœuds de degré 2) pour que chaque arête relie deux vrais nœuds. Ce
  calcul se fait **côté serveur** (voir « Backend » ci-dessous), pas sur le
  téléphone : l'app reçoit un graphe déjà construit par zone de 500 m et se
  contente de coller les zones bout à bout.
- **Extension dynamique** : le suivi de position GPS tourne en continu dès
  l'ouverture de la carte (indépendamment du démarrage d'une session) ; dès
  qu'on s'éloigne à plus de 300 m du centre de la zone connue, une nouvelle
  zone est demandée autour de la position et fusionnée au graphe (couverture
  de session préservée : les IDs d'arêtes sont stables). En cas d'échec,
  nouvelle tentative au plus tôt 8 s plus tard.
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
  et au-dessus + `living_street`) comptent : les maillages de places et
  trottoirs ne génèrent plus de points. En rural, les sentiers et chemins sont
  le réseau principal, donc toutes les voies comptent (règle d'origine).
- **Espaces verts** : exception géométrique à la règle urbaine ci-dessus. Les
  contours des parcs, jardins, forêts et terrains de sport (`leisure=park
  |garden|nature_reserve|recreation_ground|pitch|sports_centre`,
  `landuse=forest|meadow`, `natural=wood`) sont récupérés via Overpass en même
  temps que la voirie ; un carrefour situé à l'intérieur d'un de ces contours
  compte toutes ses branches piétonnes, même si la zone environnante est par
  ailleurs classée urbaine. Les places/esplanades restent volontairement
  exclues (règle ci-dessus inchangée pour elles). Limitation connue : seuls
  les contours simples (ways fermés) sont gérés, pas les relations
  multipolygones (rare pour les parcs).
- **Quartiers** : les contours OSM (`place=suburb|neighbourhood|quarter` avec
  un `name` et une géométrie de way fermé) sont récupérés par l'Edge Function
  en même temps que la zone, et chaque carrefour est assigné au quartier qui
  le contient. La carte les dessine en violet translucide : le contour délimite
  l'ensemble des carrefours qui comptent pour ce quartier, donc tout ce qui
  reste à compléter pour le débloquer — le pourcentage correspondant est
  listé dans le *Profil*. Ils ne sont plus dessinés au-delà de ~30 km de
  hauteur visible. Limitation connue : beaucoup de villes ne taguent leurs
  quartiers que par un nœud sans contour, auquel cas rien n'est affiché et
  aucun carrefour n'est assigné.
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
  tampon glissant (1 h max, purgé au fil de l'eau). Dès que ce tampon
  représente une marche significative (≥ 80 m) — pas forcément au moment de
  démarrer une session — l'app propose de l'importer.
- **Progression** : historique d'arêtes et intersections complétées en
  stockage local (`AsyncStorage`), sauvegarde continue pendant la session.
- **Garde-fou de bord** : les intersections à moins de 60 m du bord de la zone
  chargée ne sont pas évaluées (des branches pourraient manquer).
- **Navigation** : menu footer à trois onglets — *Aventure* (la carte, le
  lancement et l'arrêt des sessions), *Recherche* (classement et amis) et
  *Profil*.
- **Profil** : points au total / aujourd'hui / cette semaine (depuis lundi) /
  ce mois-ci, graphique des 7 derniers jours, tronçons découverts, distance
  découverte cumulée, historique des dernières sessions, et section compte
  (connexion Google/Apple, statut de synchronisation).
- **Compte (Supabase, optionnel)** : à la connexion, la progression locale et
  celle déjà associée au compte (autre appareil) sont fusionnées par union
  (jamais d'écrasement — un tronçon acquis d'un côté ou de l'autre reste
  acquis), puis synchronisées en continu à chaque sauvegarde locale. Le
  classement n'expose que le total de points par joueur (jamais le détail
  des tronçons parcourus), globalement ou filtré aux amis acceptés.

## Backend (Edge Function `get-region`)

L'app ne parle plus à Overpass directement : elle demande une zone à une Edge
Function Supabase, qui la calcule au premier appel puis la sert depuis un
cache partagé entre tous les joueurs (table `regions`). Une zone déjà visitée
par n'importe qui revient immédiatement, et une panne des miroirs Overpass
publics (fréquente) devient invisible sur tout ce qui est déjà en cache.

La clé de cache est le centre de la zone **arrondi sur une grille de 500 m**
(même arrondi côté client et côté serveur, sinon chaque joueur créerait sa
propre entrée légèrement décalée).

Point subtil : le client fusionne des graphes construits séparément, sans
jamais reconstruire. Pour que deux zones voisines décrivent leur recouvrement
à l'identique, la fonction **construit sur 1000 m et ne sert que 550 m** —
sans cette marge, les chaînes de degré 2 s'interrompent au bord des données et
produisent des arêtes différentes de part et d'autre. Mesuré sur 4 zones
adjacentes (Paris et périurbain) : 3 à 6 % d'arêtes en double sans la marge,
1 arête sur 4834 avec. `scripts/check-region-contract.mjs` rejoue cette
comparaison de bout en bout.

Déploiement (CLI Supabase, depuis la racine du dépôt) :

```
npx supabase link --project-ref <ref-projet>
npx supabase db push
npx supabase functions deploy get-region
```

## Structure

- `mobile/src/logic/geo.js` — utilitaires géométriques (projection, distances)
- `mobile/src/logic/region.ts` — appel de l'Edge Function `get-region`
- `mobile/src/logic/regionGraph.ts` — forme du graphe côté client, fusion des zones
- `mobile/src/logic/matching.js` — index spatial en grille + critère de couverture
- `mobile/src/logic/storage.ts` — persistance locale (`AsyncStorage`)
- `mobile/src/hooks/useWalkedia.ts` — état global, GPS, sessions, complétion,
  synchronisation de la progression vers Supabase
- `mobile/src/hooks/useAuth.ts` — connexion Google/Apple (flux OAuth web
  Supabase), état de session
- `mobile/src/hooks/useFriends.ts` / `useLeaderboard.ts` — amis, classement
- `mobile/src/lib/supabase.ts` — client Supabase
- `mobile/src/screens/` — écrans (démarrage, carte, recherche/social, profil)
- `mobile/src/components/` — HUD, barre d'onglets, toast, panneau de debug,
  section compte
- `supabase/migrations/` — schéma (profils, progression, sessions, amis,
  cache de zones), policies RLS, vue de classement
- `supabase/functions/get-region/` — Edge Function de calcul/cache des zones
- `supabase/functions/_shared/` — requête Overpass, construction du graphe,
  quartiers, découpe/sérialisation du payload (seuls exemplaires de cette
  logique depuis la bascule côté serveur)
- `scripts/check-region-contract.mjs` — vérifie que le graphe fusionné côté
  client reste identique à un graphe construit d'un seul tenant

## Limites connues (prototype)

- Pas de GPS en arrière-plan (l'app doit rester ouverte/au premier plan
  pendant une marche) : ajouter le suivi en arrière-plan est possible via
  `expo-location` + `expo-task-manager`, mais demande un build natif (dev
  client) et des permissions supplémentaires — non fait ici.
- Map matching géométrique simple, pas de modèle HMM : de rares faux positifs
  restent possibles sur des chemins parallèles très proches (< 30 m).
- Si OSM modifie la géométrie d'un chemin, son ID change et il redevient « à
  découvrir » (les intersections déjà complétées restent acquises).
- Connexion Google/Apple : nécessite un dev client (EAS Build), incompatible
  avec Expo Go (scheme d'URL personnalisé pour la redirection OAuth).
- `edgeMeters` (km découverts affichés au profil) n'est qu'approximé lors
  d'une fusion multi-appareils (maximum des deux valeurs, faute de pouvoir
  recalculer exactement la distance de l'union sans la géométrie complète
  des deux zones).
