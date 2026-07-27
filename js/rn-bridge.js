// Bridge pour réutiliser le code shared/ en web
// Cette approche permet que web et mobile utilisent la même logique métier

export async function initSharedModules() {
  // Import dynamique des modules shared (TypeScript compilés)
  // Pour web, on peut soit:
  // 1. Utiliser les modules TS directement (si bundler configure)
  // 2. Re-exporter les JS compilés
  // 3. Garder le code JS existant et migrer graduellement

  // Pour maintenant: web continue avec l'implémentation JS existante
  // Mobile utilise le code TypeScript dans shared/
  console.log('Shared modules bridge ready');
}
