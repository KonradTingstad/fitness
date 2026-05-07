#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const https = require('https');
const http = require('http');

const DEFAULT_INPUT_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../src/data/seed/freeExerciseDb.ts');
const SOURCE = 'free-exercise-db';

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT_URL,
    output: DEFAULT_OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === '--input' || arg === '-i') && argv[index + 1]) {
      args.input = argv[index + 1];
      index += 1;
      continue;
    }
    if ((arg === '--output' || arg === '-o') && argv[index + 1]) {
      args.output = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/import-exercises.js [--input <path-or-url>] [--output <path>]

Generates a local TypeScript seed file from yuhonas/free-exercise-db.

Defaults:
  input:  ${DEFAULT_INPUT_URL}
  output: ${DEFAULT_OUTPUT_PATH}`);
}

function readUrl(url) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        readUrl(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to fetch ${url}: HTTP ${response.statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
  });
}

async function readInput(input) {
  if (/^https?:\/\//i.test(input)) {
    return readUrl(input);
  }
  return fs.readFile(path.resolve(process.cwd(), input), 'utf8');
}

function normalizeAscii(value) {
  if (value == null) return null;
  const withCommonSymbols = String(value)
    .replace(/\u00bc/g, '1/4')
    .replace(/\u00bd/g, '1/2')
    .replace(/\u00be/g, '3/4');

  return withCommonSymbols
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e\n\r\t]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeAscii(value);
  return normalized && normalized.toLowerCase() !== 'null' ? normalized : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    const next = normalizeNullableString(item);
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(next);
  }
  return normalized;
}

function normalizeEquipment(value) {
  const equipment = normalizeNullableString(value) || 'Bodyweight';
  return equipment.toLowerCase() === 'body only' ? 'Bodyweight' : equipment;
}

function normalizeExerciseName(value) {
  return normalizeAscii(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(value) {
  return normalizeAscii(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeExercise(raw) {
  if (!raw || raw.category !== 'strength') {
    return null;
  }

  const sourceId = normalizeNullableString(raw.id);
  const name = normalizeNullableString(raw.name);
  if (!sourceId || !name) {
    return null;
  }

  const primaryMuscles = normalizeStringArray(raw.primaryMuscles);
  const secondaryMuscles = normalizeStringArray(raw.secondaryMuscles);
  const equipment = normalizeEquipment(raw.equipment);
  const idSlug = slugify(sourceId || name);
  if (!idSlug) {
    return null;
  }

  return {
    id: `exercise_free_exercise_db_${idSlug}`,
    source: SOURCE,
    sourceId,
    isCustom: false,
    name,
    normalizedName: normalizeExerciseName(name),
    category: 'strength',
    force: normalizeNullableString(raw.force),
    mechanic: normalizeNullableString(raw.mechanic),
    equipment,
    primaryMuscle: primaryMuscles[0] || 'Full Body',
    primaryMuscles,
    secondaryMuscles,
    imagePaths: normalizeStringArray(raw.images),
  };
}

function normalizeExercises(rawExercises) {
  if (!Array.isArray(rawExercises)) {
    throw new Error('Expected exercises.json to contain an array.');
  }

  const bySourceId = new Set();
  const byName = new Set();
  const exercises = [];

  for (const raw of rawExercises) {
    const normalized = normalizeExercise(raw);
    if (!normalized) continue;
    if (bySourceId.has(normalized.sourceId) || byName.has(normalized.normalizedName)) {
      continue;
    }
    bySourceId.add(normalized.sourceId);
    byName.add(normalized.normalizedName);
    const { normalizedName, ...seedExercise } = normalized;
    exercises.push(seedExercise);
  }

  exercises.sort((a, b) => a.name.localeCompare(b.name));
  return exercises;
}

function stringifyAscii(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7f]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

function buildOutput(exercises) {
  return `// Generated by scripts/import-exercises.js from yuhonas/free-exercise-db.
// Do not edit manually. Re-run the script to refresh this seed.

export interface ExerciseSeedItem {
  id: string;
  source: string;
  sourceId: string;
  isCustom: boolean;
  name: string;
  category: string;
  force: string | null;
  mechanic: string | null;
  equipment: string;
  primaryMuscle: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  imagePaths: string[];
}

export const FREE_EXERCISE_DB_EXERCISES: ExerciseSeedItem[] = ${stringifyAscii(exercises)};
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const raw = await readInput(args.input);
  const parsed = JSON.parse(raw);
  const exercises = normalizeExercises(parsed);
  if (!exercises.length) {
    throw new Error('No strength exercises were imported.');
  }

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, buildOutput(exercises), 'utf8');
  console.log(`Imported ${exercises.length} strength exercises to ${path.relative(process.cwd(), args.output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
