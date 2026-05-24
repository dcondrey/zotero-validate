const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'build');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

esbuild.build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  outfile: 'build/bootstrap.js',
  target: 'firefox115',
  format: 'iife',
  globalName: 'ZoteroReferenceValidator',
}).catch(() => process.exit(1));

// Copy static assets
const assets = ['manifest.json'];
for (const asset of assets) {
  if (fs.existsSync(asset)) {
    fs.copyFileSync(asset, path.join(outDir, asset));
  }
}

// Copy prefs.js
const defaultsDir = path.join(outDir, 'defaults', 'preferences');
if (!fs.existsSync(defaultsDir)) {
  fs.mkdirSync(defaultsDir, { recursive: true });
}
if (fs.existsSync('defaults/preferences/prefs.js')) {
    fs.copyFileSync('defaults/preferences/prefs.js', path.join(defaultsDir, 'prefs.js'));
}
