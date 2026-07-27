# Guide de Test Local - React Native Expo

## Démarrage Rapide

### Prérequis

```bash
# Node.js 18+ et npm
node --version  # v18.0.0 ou plus récent
npm --version

# Expo Go (app mobile gratuite)
# - Google Play (Android)
# - App Store (iOS)
```

### Option 1: Simulateur Android (recommandé pour first-time)

```bash
# 1. Installer Android Studio
#    https://developer.android.com/studio

# 2. Créer un émulateur virtuel
#    - Ouvrir Android Studio
#    - Tools → Device Manager → Create Device
#    - Sélectionner Pixel 6 ou autre modèle
#    - Finir la configuration

# 3. Lancer l'app
cd mobile
npm start

# 4. Dans le terminal Expo, appuyer sur 'a' pour Android
# → L'émulateur se lance et charge l'app automatiquement
```

### Option 2: Expo Go sur Téléphone Réel

```bash
# 1. Sur téléphone: Installer Expo Go (App Store ou Play Store)

# 2. Sur PC/Mac:
cd mobile
npm start

# 3. Scanner le QR code avec téléphone
# - Android: Ouvrir Expo Go → Scanner QR
# - iOS: Ouvrir Appareil Photo → Scanner QR → Ouvrir Expo Go

# La app charge en 10-30 secondes
```

### Option 3: Simulateur iOS (macOS only)

```bash
cd mobile
npm start

# Appuyer sur 'i' pour iOS
# Xcode se lance et le simulateur iPhone démarre
```

## Que Tester

### Phase 1 ✅ - Code Pur (Actuellement)
- [x] TypeScript compiles sans erreur (`npm run type-check`)
- [x] Imports de `shared/` résolvent correctement
- [x] Services compilent

### Phase 2 - À Tester (Prochaine)
- [ ] App démarre sans crash
- [ ] Location permission prompt s'affiche
- [ ] MapView affiche la carte
- [ ] Score affiche 0
- [ ] Bouton Start/Stop fonctionne
- [ ] Position actuelle affiche sur carte

### Phase 3 - Session Recording (Semaine 2)
- [ ] Démarrer session + marcher
- [ ] Edges deviennent verts en temps réel
- [ ] Score augmente
- [ ] Arrêter session → sauve dans AsyncStorage

## Commandes Utiles

```bash
cd mobile

# Démarrer développement
npm start

# Type-check TypeScript
npm run type-check

# Nettoyer cache Expo
npm start -- --clear

# Recompiler tout
npm start -- --no-cache
```

## Dépanner

### "Can't connect to server"
```bash
# Redémarrer Expo
npm start -- --clear

# Si problème persiste:
# - Redémarrer téléphone/émulateur
# - Vérifier même réseau WiFi
# - Sur émulateur Android: adb reverse tcp:8081 tcp:8081
```

### "Module not found: shared/utils/geo.ts"
```bash
# Vérifier que shared/ existe à la racine
ls -la ../shared/utils/

# Si manquant, checker git status
git status

# Les fichiers shared/ doivent être commités
```

### "Cannot find module with ES module"
```bash
# Tsc génère des erreurs d'import harmless
# C'est normal pour Expo bundler
# La app fonctionne même si tsc se plaint

# Pour vérifier la compilation Expo:
npm start  # Regarder les messages
```

### Problèmes de Permission
```bash
# Si la permission de localisation ne s'affiche pas:
# 1. Sur simulateur Android: déjà accordée par défaut
# 2. Sur téléphone réel: aller à Settings → Walkedia → Permissions → Location
# 3. Sur iOS: Settings → Apps → Walkedia → Location → Always
```

## Fichiers Clés

```
mobile/
├── src/
│   ├── App.tsx              # Point d'entrée
│   ├── services/
│   │   ├── locationService.ts
│   │   └── storageService.ts
│   └── screens/
│       └── MapScreen.tsx
├── app.json                 # Config Expo
└── package.json
../shared/
├── types/
│   └── index.ts
└── utils/
    ├── geo.ts
    ├── graph.ts
    ├── matching.ts
    ├── overpass.ts
    └── storage.ts
```

## Debug Console

Utiliser React Native Debugger pour voir les logs:

```bash
# Installation (optionnel, complètement)
npm install --save-dev react-native-debugger

# Lors du dev, ouvrir le dev menu sur l'app:
# - Android: Shake device ou Cmd+M
# - iOS: Cmd+D
```

## Prochaines Étapes

Une fois Phase 2 validée:
1. ✅ App démarre et affiche la carte
2. ✅ GPS fonctionne (fix position)
3. ✅ Session recording marche

Faire la PR avec results + screenshots, puis passer à Phase 3:
- Shadow walk implementation
- Background location (iOS/Android native)
- Full UI (profile screen, etc.)
