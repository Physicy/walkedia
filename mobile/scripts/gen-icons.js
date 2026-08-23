// Script ponctuel : régénère les icônes de l'app à partir de
// logo/walkedia-logo-65.svg. Pas destiné à tourner en CI — sharp n'est pas une
// dépendance du projet, juste installée temporairement pour ce script.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'logo', 'walkedia-logo-65.svg'),
  'utf8'
);
const OUT = path.join(__dirname, '..', 'assets');
const BG = '#E8E7ED';

// Le mark seul (sans le rect de fond), pour les usages où le fond est géré
// séparément (icône adaptative Android, splash).
const MARK_SVG = SRC.replace(/<rect[^>]*\/>\s*/, '');

// Repeint tout le mark d'une seule couleur opaque : pour la version
// monochrome (Android 13+ tint le mark avec sa propre couleur de thème, seul
// l'alpha du fichier compte).
const MONO_SVG = MARK_SVG
  .replace(/fill="#[0-9A-Fa-f]{3,6}"/g, 'fill="#000000"')
  .replace(/stroke="#[0-9A-Fa-f]{3,6}"/g, 'stroke="#000000"');

// Le mark n'est pas symétrique (bras de la croix de longueurs très
// différentes) : centrer sur la bounding box du trim décale visiblement
// l'anneau/point (le vrai centre optique) hors du centre de l'icône. On
// centre donc explicitement sur ce point plutôt que sur la bbox — sa
// position dans le viewBox 512×512 se déduit du transform du SVG source
// (translate(23.88,-10.83) scale(1.1713)) appliqué au centre des cercles
// (cx=159.03, cy=184.32).
const RASTER = 2048; // 4x le viewBox 512x512
const FOCAL_X = (159.03 * 1.1713 + 23.88) * (RASTER / 512);
const FOCAL_Y = (184.32 * 1.1713 - 10.83) * (RASTER / 512);

async function markOnTransparent(svg, canvasSize, safeFrac) {
  const raw = await sharp(Buffer.from(svg), { density: 2000 })
    .resize(RASTER, RASTER)
    .png()
    .toBuffer();
  const { data: trimmed, info } = await sharp(raw)
    .trim()
    .toBuffer({ resolveWithObject: true });

  const focalXTrimmed = FOCAL_X - info.trimOffsetLeft;
  const focalYTrimmed = FOCAL_Y - info.trimOffsetTop;

  const target = Math.round(canvasSize * safeFrac);
  const scale = target / Math.max(info.width, info.height);
  const w = Math.round(info.width * scale);
  const h = Math.round(info.height * scale);
  const resized = await sharp(trimmed).resize(w, h).toBuffer();

  const left = Math.round(canvasSize / 2 - focalXTrimmed * scale);
  const top = Math.round(canvasSize / 2 - focalYTrimmed * scale);

  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left, top }])
    .png();
}

(async () => {
  // icon.png : logo complet (fond inclus), opaque, comme l'existant.
  await sharp(Buffer.from(SRC), { density: 2000 })
    .resize(1024, 1024)
    .flatten({ background: BG })
    .png()
    .toFile(path.join(OUT, 'icon.png'));

  // android-icon-background.png : aplat uni, même teinte que le fond du logo.
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .png()
    .toFile(path.join(OUT, 'android-icon-background.png'));

  // android-icon-foreground.png : mark seul, centré dans sa zone de sécurité.
  const fg = await markOnTransparent(MARK_SVG, 512, 0.62);
  await fg.toFile(path.join(OUT, 'android-icon-foreground.png'));

  // android-icon-monochrome.png : mark en silhouette, même zone de sécurité.
  const mono = await markOnTransparent(MONO_SVG, 432, 0.62);
  await mono.toFile(path.join(OUT, 'android-icon-monochrome.png'));

  // favicon.png : logo complet réduit.
  await sharp(Buffer.from(SRC), { density: 2000 })
    .resize(48, 48)
    .ensureAlpha()
    .png()
    .toFile(path.join(OUT, 'favicon.png'));

  // splash-icon.png : mark seul sur transparent, comme le foreground mais à
  // l'échelle du splash (canvas plus grand, mark un peu plus petit).
  const splash = await markOnTransparent(MARK_SVG, 1024, 0.5);
  await splash.toFile(path.join(OUT, 'splash-icon.png'));

  console.log('done');
})();
