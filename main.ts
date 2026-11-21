// NEON HARBOR's submission entry. Port Kessel is a plain static Canvas 2D game in game/ with no
// runtime dependencies. This file copies game/ and the four Chrome captures into /output, then
// writes dossier.json through the vendored make.fun helper used by the gta6-01 kit.
//
// Play locally with `node serve.ts --port 8123`, then open http://127.0.0.1:8123/index.html.
// Build the submission bundle outside the competition container with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outputGame = join(outputDirectory, 'game');
const outputScreenshots = join(outputDirectory, 'screenshots');
const sourceScreenshots = join(PROJECT_ROOT, 'screenshots');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the dossier bytes; the
// others refuse an entry the scorer would refuse. A dossier has at most four screenshots (each
// under 256 KiB), game/ has at most 993 files and 48 MiB, and no game path is over 1000 bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDirectory, { recursive: true });
cpSync(join(PROJECT_ROOT, 'game'), outputGame, { recursive: true });
mkdirSync(outputScreenshots, { recursive: true });
if (existsSync(sourceScreenshots)) {
  cpSync(sourceScreenshots, outputScreenshots, { recursive: true });
}

writeFileSync(join(outputDirectory, 'dossier.json'), buildDossier(outputDirectory, DOSSIER_CAPS));
