# Migration vers React Native - Phase 1 ✅

## Structure

```
walkedia/
├── mobile/                 # React Native app (Expo)
│   ├── src/
│   │   ├── services/       # locationService, storageService
│   │   ├── screens/        # MapScreen (WIP)
│   │   ├── components/     # (à venir)
│   │   └── App.tsx         # Point d'entrée
│   ├── app.json            # Config Expo
│   ├── tsconfig.json       # TypeScript config
│   └── package.json
├── shared/                 # Code pur partagé (web + mobile)
│   ├── types/              # TypeScript interfaces
│   ├── utils/
│   │   ├── geo.ts          # Géométrie ✅
│   │   ├── graph.ts        # Construction du graphe ✅
│   │   ├── matching.ts     # Map matching ✅
│   │   ├── overpass.ts     # Requête Overpass ✅
│   │   └── storage.ts      # Interface de stockage ✅
├── js/                     # Code web original
├── css/
└── index.html
```

## Qu'est-ce qui a été fait

### Phase 1 ✅ - Architecture & Code Pur

1. **Dossier `shared/`** : Code réutilisable entre web et mobile
   - TypeScript avec interfaces strictes
   - Zéro dépendances platform-spécifiques
   - Prêt à importer dans web ou mobile

2. **React Native Setup (Expo)**
   - `npm create-expo-app mobile`
   - TypeScript configuré
   - Dépendances clés installées

3. **Services pour Mobile**
   - `locationService.ts` : Wrapper autour expo-location
   - `storageService.ts` : AsyncStorage + SQLite

4. **Écran Initial**
   - `MapScreen.tsx` : Esquisse avec react-native-maps
   - GPS tracking actif
   - Session recording (WIP)

## Prochaines étapes (Phase 2)

### Semaine 2 : Rendre MapScreen fonctionnel

- [ ] Déboguer les imports TypeScript/ES modules
- [ ] Tester MapScreen sur Expo Go (Android/iOS simulateur)
- [ ] Afficher les edges du graphe
- [ ] Implémenter le scoring en temps réel
- [ ] Session start/stop + fixes de vitesse

### Semaine 3 : UI Complète

- [ ] ProfileScreen (statistiques, historique sessions)
- [ ] SearchScreen (réservé pour plus tard)
- [ ] BottomTabNavigator
- [ ] HUD avec score/stats
- [ ] Toast notifications

### Semaine 4 : Shadow Walk

- [ ] Background location service
- [ ] Shadow fixes -> SQLite
- [ ] Import proposal au démarrage de session
- [ ] Replay & session import

## Commandes

```bash
# Démarrer dev
cd mobile
npm start

# Sur simulateur Android
npm run android
# Scannez QR sur Expo Go, ou sur émulateur Android Studio

# Sur simulateur iOS (macOS only)
npm run ios

# Sur téléphone réel
npm start
# Ouvrez Expo Go, scannez QR

# Type-check
npm run type-check
```

## Notes

- **GPS réel** : Fonctionne sur téléphone + simulateur Android (Extended Controls → Location)
- **Simulation** : Utilisez `simulateFix()` dans locationService pour tester sans marche réelle
- **SQLite** : expo-sqlite gère la persistance de shadow walk + sessions
- **Imports** : TypeScript peut se plaindre des imports `../../shared/` — c'est normal, Expo résout

## Défis connus

1. **Google Maps API** : react-native-maps nécessite une clé API Google
   - À configurer dans `app.json` : `"googleMapsApiKey": "YOUR_KEY"`
   - Ou utiliser OpenStreetMap (Leaflet n'existe pas en RN)

2. **ES modules** : Les fichiers TypeScript utilisent `import ... from '.../file.js'`
   - Nécessaire pour Expo bundler
   - Peut générer des erreurs TypeScript (harmless)

3. **Permissions** : iOS nécessite des descriptions dans `info.plist`
   - À configurer dans `app.json` via `expo-build-properties`
