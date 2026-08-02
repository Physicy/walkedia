const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js expose un champ "exports" moderne que la résolution
// package-exports de Metro ne gère pas encore correctement (résout vers un
// .cjs introuvable). On repasse sur la résolution main/module classique.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
