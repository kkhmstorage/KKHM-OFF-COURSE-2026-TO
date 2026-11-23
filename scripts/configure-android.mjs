import fs from 'node:fs';
import path from 'node:path';

/**
 * Configures the generated Capacitor Android project with KKHM Islamic & Arts College
 * branding (deep navy status bar, custom launcher icons, app name, and permissions).
 */
const rootDir = process.cwd();
const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(androidResDir)) {
  console.error('Android project folder not found. Run "npx cap add android" first.');
  process.exit(1);
}

// 1. Copy KKHM launcher icons into all Android mipmap density directories
const icon192 = path.join(rootDir, 'public', 'pwa-192x192.png');
const icon512 = path.join(rootDir, 'public', 'pwa-512x512.png');

if (fs.existsSync(icon192) && fs.existsSync(icon512)) {
  const entries = fs.readdirSync(androidResDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('mipmap-') && !entry.name.includes('anydpi')) {
      const targetDir = path.join(androidResDir, entry.name);
      const srcIcon =
        entry.name.includes('xxxhdpi') || entry.name.includes('xxhdpi') ? icon512 : icon192;

      for (const fileName of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
        const dest = path.join(targetDir, fileName);
        if (fs.existsSync(dest)) {
          fs.copyFileSync(srcIcon, dest);
        }
      }
    }
  }
  console.log('✓ Applied KKHM launcher icons across Android mipmap directories');
}

// 2. Apply KKHM Deep Navy (#1E3A5F) & Teal (#0D9488) theme colors
const valuesDir = path.join(androidResDir, 'values');
fs.mkdirSync(valuesDir, { recursive: true });

const icLauncherBgPath = path.join(valuesDir, 'ic_launcher_background.xml');
fs.writeFileSync(
  icLauncherBgPath,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1E3A5F</color>\n</resources>\n`,
  'utf8'
);

const colorsPath = path.join(valuesDir, 'colors.xml');
fs.writeFileSync(
  colorsPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#1E3A5F</color>
    <color name="colorPrimaryDark">#152B47</color>
    <color name="colorAccent">#0D9488</color>
</resources>
`,
  'utf8'
);

const stringsPath = path.join(valuesDir, 'strings.xml');
if (fs.existsSync(stringsPath)) {
  let stringsXml = fs.readFileSync(stringsPath, 'utf8');
  stringsXml = stringsXml.replace(
    /<string name="app_name">.*?<\/string>/,
    '<string name="app_name">KKHM AMS</string>'
  );
  stringsXml = stringsXml.replace(
    /<string name="title_activity_main">.*?<\/string>/,
    '<string name="title_activity_main">KKHM AMS</string>'
  );
  fs.writeFileSync(stringsPath, stringsXml, 'utf8');
}
console.log('✓ Applied KKHM Deep Navy Android theme colors & strings');

// 3. Ensure INTERNET permission is present in AndroidManifest.xml
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android.permission.INTERNET')) {
    manifest = manifest.replace(
      '<application',
      '    <uses-permission android:name="android.permission.INTERNET" />\n\n    <application'
    );
    fs.writeFileSync(manifestPath, manifest, 'utf8');
  }
  console.log('✓ Verified AndroidManifest.xml permissions');
}
