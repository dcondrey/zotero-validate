const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "build");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Build bootstrap
esbuild
  .build({
    entryPoints: ["src/bootstrap.ts"],
    bundle: true,
    outfile: "build/bootstrap.js",
    target: "firefox115",
    format: "iife",
    globalName: "ZoteroReferenceValidator",
    footer: {
      js: "function install(a){return ZoteroReferenceValidator.install(a)}\nfunction startup(a){return ZoteroReferenceValidator.startup(a)}\nfunction shutdown(a){return ZoteroReferenceValidator.shutdown(a)}\nfunction uninstall(a){return ZoteroReferenceValidator.uninstall(a)}",
    },
  })
  .catch(() => process.exit(1));

// Copy static assets to build root
const assets = [
  "manifest.json",
  "chrome.manifest",
  "defaults/preferences.xhtml",
  "defaults/preferences.js",
  "defaults/preferences.css",
];

for (const asset of assets) {
  if (fs.existsSync(asset)) {
    const fileName = path.basename(asset);
    fs.copyFileSync(asset, path.join(outDir, fileName));
  }
}

// Copy default preferences
const defaultsDir = path.join(outDir, "defaults", "preferences");
if (!fs.existsSync(defaultsDir)) {
  fs.mkdirSync(defaultsDir, { recursive: true });
}
const prefsFile = "defaults/preferences/prefs.js";
if (fs.existsSync(prefsFile)) {
  fs.copyFileSync(prefsFile, path.join(defaultsDir, "prefs.js"));
}
