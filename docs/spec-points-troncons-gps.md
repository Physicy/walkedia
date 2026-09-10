# Walkedia — Spécification : points d'intersection, tronçons et suivi GPS

Version de travail — destinée à l'implémentation (Claude Code).

## 0. Terminologie

- **Point d'intersection** : nœud interactif du graphe de jeu, correspondant à une vraie jonction physique entre voies/chemins.
- **Tronçon** : lien entre deux points d'intersection adjacents dans le graphe (aucun autre point d'intersection sur le trajet entre les deux).
- **Session** : une marche délimitée par l'action « Démarrer une session » et sa clôture (bouton stop / fin auto).
- **Trace GPS brute** : suite des positions GPS horodatées enregistrées pendant une session, avant tout traitement.
- **Géométrie OSM snappée** : la géométrie du chemin telle que décrite par les données OSM, utilisée comme tracé canonique une fois un tronçon validé.

---

## 1. Génération des points d'intersection

### A1 — Un point = une vraie jonction

Seuls les nœuds correspondant à une jonction physique entre au moins deux voies/chemins distincts génèrent un point interactif. Les vertices de géométrie pure (points qui ne font que dessiner la courbure d'une rue, sans embranchement) ne génèrent aucun point.

### A2 — Consolidation des nœuds OSM fragmentés

Plusieurs nœuds OSM peuvent représenter la même intersection physique (ex. une voie et un chemin piéton taggés séparément, avec des coordonnées légèrement décalées). Règle : tout groupe de nœuds OSM dont les coordonnées sont mutuellement à moins de **5 m** doit être fusionné en un seul point de jeu, aux coordonnées du barycentre du groupe.

### A3 — Filtrage contextuel selon le type de zone

- **Zone urbaine standard** (`landuse` résidentiel/commercial, hors parc) : seules les voies carrossables et piétonnes principales génèrent un point. Les entrées de commerces, courettes, parkings privés ne génèrent aucun nœud, indépendamment de la densité de POI affichés sur la carte.
- **Zone parc / forêt** (`leisure=park`, `landuse=forest`, ou équivalent) : tous les carrefours de chemins comptent, y compris les bifurcations mineures de sentiers non revêtus.

### A4 — Impasses courtes ignorées *(décision ouverte)*

Une antenne/boucle de desserte qui se termine en cul-de-sac ou qui rejoint la voie principale sans embranchement propre ne génère pas de point à son point de rebroussement. Seuls ses points de raccordement à la voie principale sont marqués.
→ **À trancher** : longueur maximale (en mètres) en dessous de laquelle une impasse est considérée comme « courte » et donc ignorée. Paramètre à exposer en config (`DEAD_END_MAX_LENGTH_M`), valeur par défaut à définir après tests terrain.

### A5 — Infrastructures non praticables exclues

Les tracés d'infrastructures non praticables à pied (voies de tram, voies ferrées, etc.) ne génèrent aucun point, même lorsqu'ils croisent visuellement une voie piétonne/carrossable.

---

## 2. Tronçons

### B0 — Définition

Un tronçon est le lien entre deux points d'intersection adjacents (au sens du graphe post-filtrage A1–A5 et post-consolidation A2). Il peut correspondre à une ou plusieurs portions de voie OSM chaînées entre ces deux points, sans qu'aucun autre point d'intersection ne s'intercale.

### B1 — Multi-candidats

Il est possible que **plusieurs tronçons distincts** relient les deux mêmes points d'intersection sans passer par un point tiers (ex. les deux branches d'une petite boucle de desserte, ou les deux côtés d'un rond-point). Chaque tronçon candidat est stocké comme une entité géométrique distincte dans le graphe, même s'il partage ses deux extrémités avec un autre tronçon.

### B2 — Tracé affiché après validation

Une fois un tronçon validé (cf. section 4), le tracé affiché sur la carte du joueur n'est **jamais** la trace GPS brute, mais la géométrie OSM snappée du tronçon lui-même. Ceci élimine le bruit GPS et garantit un rendu visuel homogène.

---

## 3. Suivi GPS pendant une session

### C1 — Enregistrement

Pendant une session active, la position GPS est échantillonnée en continu et horodatée. Chaque point échantillonné est associé au timestamp de capture.

### C2 — Détection de passage par un point d'intersection

Un point d'intersection est considéré comme **atteint** dès que la position GPS du joueur passe à moins de **5 m** de ses coordonnées (post-consolidation A2).

### C3 — Anti-jitter (hystérésis)

Pour éviter un flicker d'état si le signal GPS oscille près du seuil :
- Entrée dans l'état « atteint » : distance < 5 m.
- Sortie de l'état « atteint » (permettant un nouveau déclenchement futur) : distance > **8 m**.
- Tant que le joueur reste entre 5 m et 8 m, l'état reste inchangé (pas de nouveau déclenchement, pas de perte de l'état acquis).

### C4 — Journal des points validés dans la session

Chaque session maintient une liste ordonnée et chronologique des points d'intersection atteints (un point ne peut apparaître qu'une fois dans cette liste, même s'il est retraversé — seul le premier passage compte pour l'ordre).

---

## 4. Validation des tronçons

### D1 — Règle de consécutivité stricte

Un tronçon N↔N' est validé **uniquement** si, dans le journal chronologique des points validés d'une même session (C4), N et N' apparaissent de manière **consécutive** (aucun autre point d'intersection franchi entre les deux).

Exemple : trajet N → M → N' dans une même session → on valide N-M et M-N', **jamais** N-N' même si un tronçon direct existe dans le graphe.

### D2 — Pas d'accumulation multi-session pour un tronçon

Contrairement aux points d'intersection (qui restent acquis définitivement une fois atteints, cf. principe général de non-perte de progression), un tronçon n'est validé que si la consécutivité D1 est observée **au sein d'une seule et même session**. Atteindre N un jour et N' un autre jour ne valide aucun tronçon.

### D3 — Désambiguïsation multi-candidats (cas B1)

Quand plusieurs tronçons candidats relient N et N' sans point intermédiaire (cf. B1), la procédure de sélection est :

1. **Extraction** de la sous-trace GPS brute enregistrée entre l'horodatage de passage à N et celui de passage à N' (source : enregistrement C1).
2. **Comparaison** de cette sous-trace à la géométrie OSM snappée de chaque tronçon candidat, via une **distance de Fréchet** (ou DTW en repli si Fréchet s'avère trop coûteuse en pratique) entre la polyligne GPS et chaque polyligne candidate.
3. **Sélection** :
   - Si le nombre de points GPS dans la sous-trace est **< 3** → fallback direct : valider le tronçon candidat **le plus court** (pas de calcul de Fréchet).
   - Sinon, calculer le score de Fréchet pour chaque candidat. Soit `score_min` le meilleur score (le plus faible) et `score_2e` le deuxième meilleur.
     - Si `score_2e ≥ 1,2 × score_min` (marge ≥ 20 %) → valider le candidat au `score_min`.
     - Sinon (marge insuffisante, ambiguïté non tranchée) → fallback : valider le tronçon candidat **le plus court**.

### D4 — Complexité algorithmique

Le nombre de tronçons candidats entre deux points est borné localement (arêtes du graphe reliant directement N et N' sans passer par un point tiers — typiquement 2, rarement plus de 3). Chaque calcul de Fréchet porte sur des polylignes courtes (quelques dizaines de points GPS contre quelques dizaines de points de géométrie OSM). Le calcul peut donc s'exécuter côté client, en fin de session, sans nécessiter de traitement serveur dédié ni de traitement asynchrone lourd.

---

## 5. Cycle de vie de la trace GPS (RGPD)

### E1 — Fenêtre de vie de la trace brute

La trace GPS brute d'une session n'a besoin de vivre que le temps nécessaire au traitement de fin de session (détection des points atteints C2, validation des tronçons D1-D3).

### E2 — Suppression post-traitement

Une fois les tronçons de la session résolus et la géométrie OSM snappée enregistrée comme tracé canonique (B2), les coordonnées GPS brutes de la session doivent être supprimées. Seules les données de jeu dérivées (points atteints, tronçons validés, métadonnées agrégées éventuelles — distance totale, durée) sont conservées durablement.

---

## 6. Récapitulatif des paramètres de configuration

| Paramètre | Valeur | Statut |
|---|---|---|
| Rayon de consolidation des nœuds OSM fragmentés (A2) | 5 m | Validé |
| Longueur max. d'impasse ignorée (A4) | — | **Ouvert** — à définir après tests terrain |
| Seuil de détection de passage (C2) | 5 m | Validé |
| Seuil de sortie anti-jitter (C3) | 8 m | Validé |
| Nombre min. de points GPS pour tenter Fréchet (D3) | 3 | Validé — sinon fallback direct « plus court » |
| Marge minimale de désambiguïsation Fréchet (D3) | 20 % (`score_2e ≥ 1,2 × score_min`) | Validé provisoirement — à réajuster après tests terrain (bruit GPS variant selon couverture urbaine/forêt) |
| Fallback en cas d'ambiguïté ou de trace pauvre (D3) | Tronçon le plus court | Validé |

---

## 7. Décisions encore ouvertes

- **A4** : seuil de longueur définissant une « impasse courte » non génératrice de point.
- **Marge 20 % (D3)** : à valider/ajuster empiriquement une fois des sessions réelles collectées, en particulier en zone à faible couverture GPS (forêt/parc, cf. images de référence).
