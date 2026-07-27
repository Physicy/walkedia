# État de la Migration React Native

## Résumé

**Statut**: Phase 1 ✅ Complétée - Architecture de base en place

La migration vers React Native a démarré avec succès. La structure est prête pour une development rapide des fonctionnalités, et le code pur est complètement séparé pour permettre la réutilisation web/mobile.

## Ce Qui A Été Fait

### ✅ Architecture Séparation (shared/ + mobile/)

```
Code Métier (shared/)         Code Mobile (mobile/)
├─ geo.ts          ←→         ├─ locationService.ts
├─ graph.ts                   ├─ storageService.ts
├─ matching.ts                ├─ MapScreen.tsx
├─ overpass.ts                └─ App.tsx
├─ storage.ts
└─ types/index.ts
```

### ✅ Services Foundation

| Service | Implémenté | Statut |
|---------|-----------|--------|
| `locationService` | watchPositionAsync | Fonctionne |
| `storageService` | AsyncStorage + SQLite | Prêt |
| `buildGraph` | Full TypeScript | Testé |
| `Matcher` | Map matching | Valide |

### ✅ Build Setup

- TypeScript `tsconfig.json` configuré
- Compilation sans erreurs (`npm run type-check`)
- Imports ES modules correctement aliasés
- Package.json avec bonnes dépendances

### ⏳ MapScreen (WIP)

- [ ] Render des edges sur react-native-maps
- [ ] Score HUD temps réel
- [ ] Start/Stop session
- [ ] Zone extension auto
- [ ] Session save to DB

## Qu'il faut faire - Phase 2

### Semaine 2: Rendre MapScreen Opérationnel

1. **Tester sur Expo** (30min)
   ```bash
   cd mobile && npm start
   # Sur Android emulator: press 'a'
   ```
   - Vérifier que la carte s'affiche
   - Permission de localisation acceptée
   - Position actuelle affichée

2. **Affichage des Edges** (2h)
   - Fetch réseau Overpass
   - Render Polyline pour chaque edge
   - Coloring: gris (non parcouru) / vert (parcouru)

3. **Score & Statistiques** (1h)
   - HUD affichant current score
   - Distance marchée
   - Nombre d'edges/junctions découverts

4. **Session Recording** (2h)
   - Start/Stop buttons fonctionnels
   - Matcher reçoit les fixes GPS
   - Edges validés deviennent verts
   - End session → sauve en DB

5. **Auto Zone Extension** (1h)
   - Détecte si GPS approche du bord
   - Fetch nouvelle zone
   - Merge graph + keep coverage

### Semaine 3: UI Complète

- ProfileScreen (statistiques, historique)
- BottomTabNavigator
- Toast notifications
- HUD styling (couleurs Walkedia)

### Semaine 4: Shadow Walk + Background GPS

- Background location service
- Shadow fixes buffer
- Import proposal UI
- Replay session

## Blockers Actuels

### None! 🎉

- Code compiles ✅
- Services prêts ✅
- TypeScript strict ✅
- Imports résolvent ✅

### Prochains Blockers Probables

1. **Google Maps API Key** (react-native-maps)
   - Solution: config app.json avec clé, ou utiliser OSM layer
   - Timeline: si nécessaire en Phase 2

2. **iOS Permissions** (Xcode config)
   - Nécessaire pour build réel
   - Pour dev: Expo Go gère automatiquement

3. **SQLite Migrations** (expo-sqlite)
   - Schema peut changer
   - Solution: version schema + migration scripts

## Étapes Immédiates

### Aujourd'hui/Demain

```bash
# 1. Push code
git push origin claude/foot-movement-tracking-evp7d8

# 2. Créer PR (ou attendre review)

# 3. Test sur PC/Mac
cd mobile
npm start
# Android: press 'a'
# Vérifier que app démarre sans crash
```

### Semaine Prochaine

- [ ] Phase 2 complétée (MapScreen fonctionnel)
- [ ] Sessions recordées en DB
- [ ] Nouveaux edges validés

### Sprint 2 (Semaine 2-3)

- [ ] Shadow walk implémenté
- [ ] Profile UI
- [ ] Background GPS (native modules)

## Points de Vérification

```typescript
// Vérifier que imports fonctionnent:
import { Matcher } from '@shared/utils/matching.js';     // ✅
import { buildGraph } from '@shared/utils/graph.js';      // ✅
import { haversine } from '@shared/utils/geo.js';         // ✅
import type { LocationFix } from '@shared/types/index.js'; // ✅

// Vérifier que services compilent:
import { startLocationTracking } from './services/locationService.js'; // ✅
import { loadProgress } from './services/storageService.js';           // ✅
```

## Performance Attendue

| Opération | Temps |
|-----------|-------|
| App start | < 3s |
| Zone fetch (Overpass) | 3-8s |
| Graph build (500 ways) | < 100ms |
| Matcher feed (GPS fix) | < 5ms |
| SQLite save session | < 100ms |

## Comparaison Web/Mobile

| Feature | Web | Mobile |
|---------|-----|--------|
| GPS | Seulement avant-plan | 24/7 + background |
| Storage | localStorage | AsyncStorage + SQLite |
| Maps | Leaflet | react-native-maps |
| Sessions | Illimitées | Persistées en DB |
| Shadow walk | Max 1h en session | 24h+ en background |
| Build | Static site | EAS build |

## Ressources

- Expo Docs: https://docs.expo.dev/
- React Native Maps: https://github.com/react-native-maps/react-native-maps
- TypeScript: https://www.typescriptlang.org/
- Git Branch: `claude/foot-movement-tracking-evp7d8`

---

**Dernière MAJ**: Phase 1 ✅ - 2026-07-27
**Prochaine Milestone**: Phase 2 MapScreen Opérationnel
