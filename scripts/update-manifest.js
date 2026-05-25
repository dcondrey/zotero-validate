const fs = require("fs");
const path = require("path");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf-8"),
);

const version = manifest.version;
const id = manifest.id;
const minVersion = manifest.applications.zotero.strict_min_version;
const maxVersion = manifest.applications.zotero.strict_max_version;
const repo = process.env.GITHUB_REPOSITORY || "dcondrey/zotero-validate";

const updateManifest = {
  addons: {
    [id]: {
      updates: [
        {
          version,
          update_link: `https://github.com/${repo}/releases/download/v${version}/zotero-reference-validator.xpi`,
          applications: {
            zotero: {
              strict_min_version: minVersion,
              strict_max_version: maxVersion,
            },
          },
        },
      ],
    },
  },
};

fs.writeFileSync(
  path.join(__dirname, "..", "update.json"),
  JSON.stringify(updateManifest, null, 2) + "\n",
);

process.stdout.write(`Generated update.json for v${version}\n`);
