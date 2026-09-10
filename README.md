# Walkedia

Jeu d'exploration du réseau piéton : marche pour atteindre des **points
d'intersection** (les vraies jonctions du réseau OpenStreetMap) et relie-les
entre eux pour relever des **tronçons**.

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

- **Règles du jeu** : l'app implémente la spécification
  [points d'intersection, tronçons et suivi GPS](docs/spec-points-troncons-gps.md).
  Les repères entre parenthèses ci-dessous (A1, C3, D1…) renvoient à ses
  sections, repris tels quels dans les commentaires du code.
- **Point d'intersection** : le nœud interactif, celui qui rapporte. Il
  correspond à une vraie jonction physique entre voies (A1) : un nœud du
  graphe à au moins trois branches significatives. Un vertex de géométrie
  pure — celui qui ne fait que dessiner la courbure d'une rue — n'en génère
  aucun (fusion des chaînes de degré 2).
- **Tronçon** : le lien entre **deux points d'intersection adjacents**, sans
  aucun autre point entre les deux (B0). Les arêtes du découpage OSM s'arrêtent
  à tout nœud partagé par plusieurs ways (une entrée de parking, un trottoir
  qui rejoint la chaussée) ; elles sont donc recollées en chaînes, poursuivies
  tant que le nœud traversé n'est pas un point et n'a que deux branches
  significatives. Une chaîne qui n'a pas un point à ses deux bouts n'est pas un
  tronçon et disparaît du graphe : les impasses ne comptent pas. **Plusieurs
  tronçons peuvent relier les deux mêmes points** (B1 : les deux branches
  d'une boucle de desserte, les deux côtés d'un rond-point) ; chacun est une
  entité distincte, et c'est le suivi GPS qui les départage (voir plus bas).
- **Graphe** : tout ce qui précède est calculé **côté serveur** (voir
  « Backend » ci-dessous), pas sur le téléphone : l'app reçoit un graphe déjà
  construit par zone de 500 m et se contente de coller les zones bout à bout.
- **Consolidation des nœuds fragmentés** (A2) : OSM décrit parfois une même
  jonction physique par plusieurs nœuds légèrement décalés (une voie et un
  chemin piéton taggés séparément). Tout groupe de nœuds candidats
  mutuellement distants de moins de **5 m** est fusionné en un seul point de
  jeu, placé au barycentre du groupe. Conséquence assumée : un grand carrefour
  cartographié en chaussées séparées, avec îlots et passages piétons, donne
  plusieurs points — mais un point s'acquiert simplement en y passant, il
  n'exige plus d'avoir parcouru toutes ses branches.
- **Impasses** (A4) : une antenne de desserte plus courte que
  `DEAD_END_MAX_LENGTH_M` (30 m par défaut) n'est pas une branche
  significative : elle ne fait pas d'un nœud une jonction et n'est jamais un
  tronçon. **Décision ouverte** dans la spécification : le seuil est à trancher
  après tests terrain, d'où la constante exposée.
- **Extension dynamique** : le suivi de position GPS tourne en continu dès
  l'ouverture de la carte (indépendamment du démarrage d'une session) ; dès
  qu'on s'éloigne à plus de 300 m du centre de la zone connue, une nouvelle
  zone est demandée autour de la position et fusionnée au graphe (couverture
  de session préservée : les IDs de tronçons et de points sont stables). En cas
  d'échec, nouvelle tentative au plus tôt 8 s plus tard.
- **Remplissage au dézoom** : quand la carte passe en mode cluster, la vue
  visible est complétée avec les zones **déjà calculées**, lues en cache,
  quatre en parallèle, avec une échéance de 10 s et annulation dès que la vue
  bouge. Une zone absente du cache n'est pas calculée pour ce seul confort
  d'affichage : elle le sera quand le joueur ira marcher dedans ou centrera la
  carte dessus. C'est la leçon d'une mesure sur appareil : un unique dézoom
  avait enchaîné 26 zones à calculer, dont 8 timeouts Overpass de 60 s, pour
  un chargement affiché à 691 s et 6 zones rapportées.
- **Régime de zone** (A3) : en **zone urbaine standard**, seules les voies
  carrossables (`residential` et au-dessus + `living_street`) et les rues
  piétonnes (`highway=pedestrian`) génèrent un point — les entrées de
  commerces, courettes et maillages de trottoirs, non. Une zone est urbaine si
  elle tombe dans un contour `landuse=residential|commercial|retail`, ou, à
  défaut de `landuse` cartographié, si la densité locale de voirie carrossable
  dépasse `URBAN_MIN_ROAD` (grille de 250 m, fenêtre 3×3). En **zone rurale**,
  sentiers et chemins *sont* le réseau : toutes les voies comptent.
- **Parcs et forêts** (A3, second régime) : les contours des parcs, jardins,
  forêts et terrains de sport (`leisure=park|garden|nature_reserve
  |recreation_ground|pitch|sports_centre`, `landuse=forest|meadow`,
  `natural=wood`) sont récupérés via Overpass en même temps que la voirie. Un
  nœud situé à l'intérieur compte **toutes** ses branches piétonnes, y compris
  les bifurcations mineures de sentiers, même en pleine ville. Les
  places/esplanades restent volontairement exclues. Limitation connue : seuls
  les contours simples (ways fermés) sont gérés, pas les relations
  multipolygones (rare pour les parcs).
- **Infrastructures non praticables** (A5) : voies de tram, voies ferrées et
  compagnie ne sont tout simplement pas demandées à Overpass (seules des ways
  `highway=…` le sont). Elles n'apportent aucun nœud et ne peuvent donc pas
  créer de point là où elles croisent visuellement une rue.
- **IDs de tronçons** : dérivés de la seule géométrie (extrémités + point
  milieu + longueur), stables entre sessions et indépendants des IDs OSM. Le
  point milieu en fait partie précisément pour distinguer deux tronçons
  parallèles reliant les mêmes points (B1).
- **Atteindre un point** (C2/C3) : un point est atteint dès que la position
  GPS (précision ≤ 40 m) passe à moins de **5 m** de ses coordonnées. Pour que
  le signal qui oscille autour du seuil ne fasse pas clignoter l'état, celui-ci
  ne se relâche qu'au-delà de **8 m** (hystérésis) : entre 5 et 8 m, rien ne
  change — ni nouveau déclenchement, ni perte de l'acquis. Entre deux fix
  successifs, la position est rééchantillonnée en ligne droite tous les 5 m
  (sauf saut > 150 m ou écart > 20 s, considérés comme une coupure) : sans ça,
  deux fix espacés sauteraient par-dessus un point sans jamais entrer dans son
  rayon.
- **Relever un tronçon** (D1) : un tronçon N↔N' est validé **uniquement** si N
  et N' ont été atteints l'un après l'autre dans la même session, sans aucun
  autre point franchi entre les deux. Un trajet N → M → N' relève N-M et M-N',
  jamais N-N' — même si un tronçon direct existe. Rien ne s'accumule d'une
  session à l'autre (D2) : atteindre N un jour et N' un autre ne relève rien.
  Les points, eux, restent acquis définitivement.
- **Départager plusieurs tronçons** (D3) : quand plusieurs candidats relient
  les deux mêmes points (B1), la sous-trace GPS brute enregistrée entre les
  deux passages est comparée à la géométrie OSM de chaque candidat par
  **distance de Fréchet** discrète. Le meilleur score l'emporte s'il devance le
  deuxième d'au moins **20 %** ; sinon (ou si la sous-trace fait moins de
  3 points), c'est le **tronçon le plus court** qui est retenu. La marge de
  20 % est à réajuster après collecte de sessions réelles, en particulier là où
  la couverture GPS est mauvaise (forêt, rues étroites).
- **Ce qui s'affiche** (B2) : une fois un tronçon validé, c'est sa **géométrie
  OSM** qui est dessinée, jamais la trace GPS — rendu homogène, sans bruit. La
  trace brute n'apparaît que sous forme du fil pointillé de la session en
  cours.
- **Cycle de vie de la trace GPS** (E1/E2, RGPD) : la trace brute ne vit que le
  temps du traitement. Les points sont détectés au fil de l'eau et les tronçons
  validés dès que deux points se suivent, donc l'app ne détient à aucun moment
  plus que le segment en cours de résolution ; à la clôture de la session, tout
  ce qui pourrait reconstituer le trajet est relâché explicitement. Ce qui
  survit à une sortie, ce sont les données de jeu (points atteints, tronçons
  validés) et des métadonnées agrégées (distance, durée) — jamais des
  coordonnées. Seule exception, et elle est bornée : le suivi en arrière-plan
  (opt-in, voir ci-dessous) doit écrire ses fix dans un tampon puisque l'app
  est fermée ; ce tampon garde au plus une heure, se purge au fil de l'eau, et
  est effacé à la lecture — avant même que le rejeu commence.
- **Arrêt automatique** : si la vitesse dépasse 20 km/h (mesure GPS Doppler
  quand disponible, sinon distance/temps entre deux fix) sur au moins deux fix
  GPS consécutifs, la session est arrêtée automatiquement (vélo, voiture…).
- **Import d'une marche oubliée** : le suivi de position tournant en continu
  même hors session, les fix reçus sans session active sont gardés dans un
  tampon glissant (1 h max, purgé au fil de l'eau). Dès que ce tampon
  représente une marche significative (≥ 80 m) — pas forcément au moment de
  démarrer une session — l'app propose de l'importer.
- **Progression** : points atteints et tronçons relevés en stockage local
  (`AsyncStorage`), sauvegarde continue pendant la session.
- **Élagage** : un identifiant qui n'existe plus dans une zone chargée (OSM a
  changé le tracé, ou les règles de construction ont changé — c'est le cas au
  passage à cette spécification) est retiré de la progression, avec ses
  compteurs et sa géométrie. Seulement à l'intérieur des zones connues, à 60 m
  du bord près : ailleurs, l'absence ne prouve rien. Chaque appareil élague ce
  qu'il visite et pousse le résultat, la synchronisation converge.
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
produisent des tronçons différents de part et d'autre. Mesuré sur 4 zones
adjacentes (Paris et périurbain) : 3 à 6 % de tronçons en double sans la marge,
1 sur 4834 avec. `scripts/check-region-contract.mjs` rejoue cette comparaison
de bout en bout.

Une zone sert aussi les points d'intersection situés au bout des tronçons
qu'elle contient, même hors de son cercle : relever un tronçon demande d'avoir
atteint ses **deux** points (D1), donc en servir un sans l'autre le rendrait
invalidable tant que la zone voisine n'est pas chargée.

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
- `mobile/src/logic/tracking.ts` — détection de passage par un point,
  hystérésis (C2/C3)
- `mobile/src/logic/troncons.ts` — index des candidats par paire de points,
  choix par distance de Fréchet (B1/D3)
- `mobile/src/logic/storage.ts` — persistance locale (`AsyncStorage`)
- `mobile/src/hooks/useWalkedia.ts` — état global, GPS, sessions, journal des
  points, validation des tronçons, synchronisation vers Supabase
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
- `scripts/check-region-contract.mjs` — vérifie, sur de vraies données, que le
  graphe fusionné côté client reste identique à un graphe construit d'un seul
  tenant (dépend d'Overpass)
- `scripts/check-graph-rules.mjs` — vérifie les règles de construction (A1 à
  A4, B0, B1) sur des scènes OSM synthétiques, sans réseau
- `scripts/check-tracking.mjs` — rejoue les règles de jeu côté client (C2, C3,
  C4, D1, D3) sur un graphe synthétique, sans réseau
- `scripts/inspect-points.mjs` — montre sur un vrai quartier ce que la
  consolidation à 5 m recolle, ce qu'elle laisse séparé, et l'effet d'un autre
  rayon : l'outil des deux décisions restées ouvertes (A2, A4)

## Limites connues (prototype)

- Pas de GPS en arrière-plan (l'app doit rester ouverte/au premier plan
  pendant une marche) : ajouter le suivi en arrière-plan est possible via
  `expo-location` + `expo-task-manager`, mais demande un build natif (dev
  client) et des permissions supplémentaires — non fait ici.
- Un point manqué par le GPS coupe la chaîne : les deux points effectivement
  détectés de part et d'autre ne sont pas adjacents dans le graphe, donc aucun
  tronçon ne les relie et rien n'est crédité pour ce bout de trajet (D1
  appliqué à la lettre). C'est le prix de la règle : jamais de faux positif,
  au risque d'un oubli quand le signal est mauvais.
- Deux paramètres restent à trancher après tests terrain, comme le note la
  spécification : `DEAD_END_MAX_LENGTH_M` (A4, 30 m par défaut) et la marge de
  désambiguïsation de 20 % (D3). `scripts/inspect-points.mjs` balaie le
  premier, ainsi que le rayon de consolidation, sur un quartier réel.
- La consolidation à 5 m (A2) laisse séparés des nœuds qu'OSM étale sur 10 à
  25 m autour d'un même carrefour réel (chaussées séparées, îlots, passages
  piétons). Mesuré sur une zone de 500 m : 3 points consolidés à Paris/Châtelet
  et 8 en périurbain rennais, contre 133 paires de points distincts espacés de
  5 à 25 m dans chacune des deux. C'est le paramètre à remonter si le comptage
  paraît dilué.
- Si OSM modifie la géométrie d'un chemin, son ID change et le tronçon
  redevient « à relever » (les points déjà atteints, eux, restent acquis).
- Connexion Google/Apple : nécessite un dev client (EAS Build), incompatible
  avec Expo Go (scheme d'URL personnalisé pour la redirection OAuth).
- `edgeMeters` (km découverts affichés au profil) n'est qu'approximé lors
  d'une fusion multi-appareils (maximum des deux valeurs, faute de pouvoir
  recalculer exactement la distance de l'union sans la géométrie complète
  des deux zones).
