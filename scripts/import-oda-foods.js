#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const ROOT_SITEMAP_URL = 'https://oda.com/sitemap.xml';
const ODA_API_BASE_URL = 'https://oda.com/api/v1/products';
const ODA_BASE_URL = 'https://oda.com';
const ODA_PRODUCT_URL_REGEX = /^https:\/\/oda\.com\/no\/products\/(\d+)-[^/?#]+\/?$/i;
const ODA_PRODUCT_URL_FALLBACK_REGEX = /\/no\/products\/(\d+)-[^/?#]+\/?$/i;

const SOURCE_PROVIDER = 'oda_private_snapshot';
const USER_AGENT = 'FuelForm-private-import-bot/1.0';

const DEFAULT_DELAY_MS = 1200;
const DEFAULT_LIMIT = 100;
const HARD_MAX_REQUEST_LIMIT = 1000;
const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_SAMPLE_INSPECTION_COUNT = 5;
const MAX_HTTP_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

const STOP_THRESHOLDS = {
  status429: 15,
  status403: 6,
  status401: 3,
  status5xx: 20,
  consecutiveRequestErrors: 20,
};

const CACHE_DIR = path.resolve(__dirname, 'oda-import', '.cache');
const DISCOVERY_CACHE_FILE = path.join(CACHE_DIR, 'discovered-products.json');
const PROGRESS_FILE = path.join(CACHE_DIR, 'import-progress.json');
const FAILED_IMPORTS_FILE = path.join(CACHE_DIR, 'failed-imports.jsonl');
const SAMPLE_STRUCTURE_FILE = path.join(CACHE_DIR, 'sample-response-structure.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parsePositiveInteger(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    resume: false,
    all: false,
    sample: null,
    limit: null,
    onlyProductId: null,
    delayMs: DEFAULT_DELAY_MS,
    batchSize: DEFAULT_BATCH_SIZE,
    inspectCount: DEFAULT_SAMPLE_INSPECTION_COUNT,
    sitemapUrl: ROOT_SITEMAP_URL,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--resume') {
      parsed.resume = true;
      continue;
    }
    if (arg === '--all') {
      parsed.all = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg.startsWith('--sample=')) {
      parsed.sample = parsePositiveInteger(arg.split('=')[1]);
      continue;
    }
    if (arg.startsWith('--limit=')) {
      parsed.limit = parsePositiveInteger(arg.split('=')[1]);
      continue;
    }
    if (arg.startsWith('--only-product-id=')) {
      const value = arg.split('=')[1] ?? '';
      if (/^\d+$/.test(value)) {
        parsed.onlyProductId = value;
      }
      continue;
    }
    if (arg.startsWith('--delay-ms=')) {
      parsed.delayMs = parsePositiveInteger(arg.split('=')[1], DEFAULT_DELAY_MS) ?? DEFAULT_DELAY_MS;
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      parsed.batchSize = parsePositiveInteger(arg.split('=')[1], DEFAULT_BATCH_SIZE) ?? DEFAULT_BATCH_SIZE;
      continue;
    }
    if (arg.startsWith('--inspect-count=')) {
      parsed.inspectCount = parsePositiveInteger(arg.split('=')[1], DEFAULT_SAMPLE_INSPECTION_COUNT) ?? DEFAULT_SAMPLE_INSPECTION_COUNT;
      continue;
    }
    if (arg.startsWith('--sitemap-url=')) {
      const value = arg.split('=')[1];
      if (value && value.startsWith('http')) {
        parsed.sitemapUrl = value;
      }
      continue;
    }
  }

  if (parsed.onlyProductId) {
    parsed.limit = 1;
  } else if (parsed.sample) {
    parsed.limit = parsed.sample;
  } else if (!parsed.all && !parsed.limit) {
    parsed.limit = DEFAULT_LIMIT;
  }

  if (!parsed.all && parsed.limit && parsed.limit > HARD_MAX_REQUEST_LIMIT) {
    console.warn(
      `Requested limit (${parsed.limit}) exceeds safe hard max (${HARD_MAX_REQUEST_LIMIT}). Capping limit to ${HARD_MAX_REQUEST_LIMIT}. Use --all to remove this cap.`,
    );
    parsed.limit = HARD_MAX_REQUEST_LIMIT;
  }

  return parsed;
}

function printHelp() {
  console.log('FuelForm private Oda importer');
  console.log('');
  console.log('Usage:');
  console.log('  npm run import:oda-foods -- --sample=5');
  console.log('  npm run import:oda-foods -- --limit=20 --dry-run');
  console.log('  npm run import:oda-foods -- --limit=500');
  console.log('  npm run import:oda-foods -- --all');
  console.log('  npm run import:oda-foods -- --only-product-id=36715');
  console.log('  npm run import:oda-foods -- --resume');
  console.log('');
  console.log('Flags:');
  console.log('  --dry-run            Parse and print data without Supabase writes');
  console.log('  --resume             Continue from scripts/oda-import/.cache/import-progress.json');
  console.log('  --all                Remove hard request cap');
  console.log('  --sample=N           Process first N discovered products (sets limit)');
  console.log('  --limit=N            Process up to N products');
  console.log('  --only-product-id=N  Process one product ID directly');
  console.log('  --delay-ms=N         Delay between requests (default 1200)');
  console.log('  --batch-size=N       Supabase upsert batch size (default 40)');
  console.log('  --inspect-count=N    Number of sampled responses to inspect first (default 5)');
  console.log('  --sitemap-url=URL    Override root sitemap URL');
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const delimiterIndex = trimmed.indexOf('=');
    if (delimiterIndex <= 0) continue;

    const key = trimmed.slice(0, delimiterIndex).trim();
    let value = trimmed.slice(delimiterIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadImporterEnvironment() {
  const projectRoot = path.resolve(__dirname, '..');
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env.local'));
}

function parseRetryAfterMs(retryAfterValue) {
  if (!retryAfterValue) return null;

  const asSeconds = Number.parseFloat(retryAfterValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }

  const asDate = Date.parse(retryAfterValue);
  if (Number.isNaN(asDate)) return null;

  return Math.max(0, asDate - Date.now());
}

function computeBackoffMs(attempt) {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(MAX_BACKOFF_MS, exponential + jitter);
}

async function requestWithBackoff(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    accept = '*/*',
    parseAs = 'text',
    maxAttempts = MAX_HTTP_ATTEMPTS,
    stopOnAuthErrors = true,
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          ...headers,
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts) {
        return {
          ok: false,
          status: 0,
          attempts: attempt,
          error: lastError,
        };
      }

      await sleep(computeBackoffMs(attempt));
      continue;
    }

    if (response.ok) {
      if (parseAs === 'json') {
        try {
          const data = await response.json();
          return { ok: true, status: response.status, attempts: attempt, data, headers: response.headers };
        } catch (error) {
          return {
            ok: false,
            status: response.status,
            attempts: attempt,
            error: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      const text = await response.text();
      return { ok: true, status: response.status, attempts: attempt, data: text, headers: response.headers };
    }

    const status = response.status;
    const responseBody = await safeReadText(response);

    const isRetryableStatus = status === 429 || status === 408 || status === 425 || status >= 500;
    const isAuthStatus = status === 401 || status === 403;

    if (isAuthStatus && stopOnAuthErrors) {
      return {
        ok: false,
        status,
        attempts: attempt,
        error: `HTTP ${status}`,
        body: responseBody,
      };
    }

    if (!isRetryableStatus || attempt >= maxAttempts) {
      return {
        ok: false,
        status,
        attempts: attempt,
        error: `HTTP ${status}`,
        body: responseBody,
      };
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    await sleep(retryAfterMs ?? computeBackoffMs(attempt));
  }

  return {
    ok: false,
    status: 0,
    attempts: maxAttempts,
    error: lastError ?? 'Unknown request error',
  };
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function decodeXmlEntities(input) {
  if (!input) return '';
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSitemapXml(xml) {
  const locs = [];
  const regex = /<loc>(.*?)<\/loc>/gims;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const value = decodeXmlEntities(String(match[1] ?? '').trim());
    if (value) {
      locs.push(value);
    }
  }
  return locs;
}

function isLikelySitemapUrl(url) {
  return /\.xml(?:\?|$)/i.test(url);
}

function extractProductIdFromOdaUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const direct = url.match(ODA_PRODUCT_URL_REGEX);
  if (direct) return direct[1];

  const fallback = url.match(ODA_PRODUCT_URL_FALLBACK_REGEX);
  if (fallback) return fallback[1];

  return null;
}

async function discoverProductUrls(options) {
  const {
    sitemapUrl,
    delayMs,
    cacheFilePath = DISCOVERY_CACHE_FILE,
    useCache = false,
    logger = console,
  } = options;

  if (useCache && fs.existsSync(cacheFilePath)) {
    const cached = JSON.parse(await fsp.readFile(cacheFilePath, 'utf8'));
    if (Array.isArray(cached.products) && cached.products.length > 0) {
      logger.log(`Loaded ${cached.products.length} discovered products from cache.`);
      return {
        products: cached.products,
        visitedSitemaps: Array.isArray(cached.visitedSitemaps) ? cached.visitedSitemaps : [],
        fromCache: true,
      };
    }
  }

  const queue = [sitemapUrl];
  const visited = new Set();
  const productsById = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const result = await requestWithBackoff(current, {
      accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      parseAs: 'text',
    });

    if (!result.ok) {
      logger.warn(`Failed sitemap fetch ${current}: ${result.error} (status ${result.status || 'n/a'})`);
      continue;
    }

    const locs = parseSitemapXml(result.data);
    for (const loc of locs) {
      const productId = extractProductIdFromOdaUrl(loc);
      if (productId) {
        if (!productsById.has(productId)) {
          productsById.set(productId, {
            productId,
            productUrl: loc,
          });
        }
        continue;
      }

      if (isLikelySitemapUrl(loc) && !visited.has(loc)) {
        queue.push(loc);
      }
    }

    await sleep(Math.max(150, Math.min(delayMs, 800)));
  }

  const products = Array.from(productsById.values()).sort((a, b) => Number(a.productId) - Number(b.productId));
  const visitedSitemaps = Array.from(visited.values());

  await fsp.writeFile(
    cacheFilePath,
    JSON.stringify(
      {
        discoveredAt: nowIso(),
        sourceSitemap: sitemapUrl,
        visitedSitemaps,
        products,
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    products,
    visitedSitemaps,
    fromCache: false,
  };
}

function normalizeLabel(label) {
  if (!label) return '';
  return String(label)
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[åÅ]/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDecimalNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;

  const normalized = match[0].replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseEnergyValue(value) {
  if (!value) return { kj: null, kcal: null };

  const text = String(value);
  const kjMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*kj\b/i);
  const kcalMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*kcal\b/i);

  const kj = kjMatch ? parseDecimalNumber(kjMatch[1]) : null;
  const kcal = kcalMatch ? parseDecimalNumber(kcalMatch[1]) : null;

  return { kj, kcal };
}

function extractBarcode(rawValue) {
  if (!rawValue) return null;
  const match = String(rawValue).replace(/\s+/g, '').match(/\b\d{8,14}\b/);
  return match ? match[0] : null;
}

function pickPreferredLocalDetails(product) {
  const localEntries = product?.detailed_info?.local;
  if (!Array.isArray(localEntries) || localEntries.length === 0) return null;

  const norwegian = localEntries.find((entry) => String(entry?.language ?? '').toLowerCase() === 'nb');
  return norwegian ?? localEntries[0] ?? null;
}

function extractContentValues(contentsRows) {
  const result = {
    packageSize: null,
    ingredients: null,
    allergens: null,
    barcode: null,
    filteredRows: [],
  };

  if (!Array.isArray(contentsRows)) {
    return result;
  }

  for (const row of contentsRows) {
    const rawKey = String(row?.key ?? '').trim();
    if (!rawKey) continue;

    const normalizedKey = normalizeLabel(rawKey);
    const rawValue = row?.value;
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue == null ? null : String(rawValue);

    const isIngredients = normalizedKey.includes('ingrediens') || normalizedKey.includes('ingredients');
    const isAllergens = normalizedKey.includes('allergen');
    const isSize = normalizedKey.includes('storrelse') || normalizedKey.includes('size');
    const isBarcode =
      normalizedKey.includes('ean') ||
      normalizedKey.includes('gtin') ||
      normalizedKey.includes('barcode') ||
      normalizedKey.includes('strekkode');

    if (isIngredients && value) {
      result.ingredients = value;
    }
    if (isAllergens && value) {
      result.allergens = value;
    }
    if (isSize && value) {
      result.packageSize = value;
    }
    if (isBarcode && value) {
      result.barcode = extractBarcode(value);
    }

    if (isIngredients || isAllergens || isSize || isBarcode) {
      result.filteredRows.push({ key: rawKey, value });
    }
  }

  return result;
}

function normalizeNutritionRows(nutritionRows) {
  const output = {
    calories_per_100: null,
    kj_per_100: null,
    protein_per_100: null,
    carbs_per_100: null,
    sugar_per_100: null,
    fat_per_100: null,
    saturated_fat_per_100: null,
    fiber_per_100: null,
    salt_per_100: null,
    matchedLabels: [],
  };

  if (!Array.isArray(nutritionRows)) {
    return output;
  }

  for (const row of nutritionRows) {
    const key = normalizeLabel(row?.key ?? '');
    const value = String(row?.value ?? '').trim();
    if (!key || !value) continue;

    if (key.includes('energi') || key.includes('energy')) {
      const energy = parseEnergyValue(value);
      if (energy.kj !== null) output.kj_per_100 = energy.kj;
      if (energy.kcal !== null) output.calories_per_100 = energy.kcal;
      output.matchedLabels.push(row.key);
      continue;
    }

    if ((key.includes('mettede') || key.includes('saturated')) && key.includes('fett')) {
      output.saturated_fat_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if ((key.includes('sukker') || key.includes('sugar')) && !key.includes('free')) {
      output.sugar_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if (key.includes('karbohyd') || key.includes('carbohyd') || key === 'carbs') {
      output.carbs_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if (key.includes('protein')) {
      output.protein_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if (key === 'fett' || key === 'fat') {
      output.fat_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if (key.includes('kostfiber') || key === 'fiber' || key.includes('dietary fiber')) {
      output.fiber_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }

    if (key === 'salt' || key.includes('salt')) {
      output.salt_per_100 = parseDecimalNumber(value);
      output.matchedLabels.push(row.key);
      continue;
    }
  }

  return output;
}

function parseVariant(nameExtra) {
  if (!nameExtra || typeof nameExtra !== 'string') return null;

  const firstSegment = nameExtra.split(',')[0]?.trim();
  if (!firstSegment) return null;

  if (/\d/.test(firstSegment) && /(g|kg|ml|l|liter|gram)/i.test(firstSegment)) {
    return null;
  }

  return firstSegment;
}

function chooseServingUnit(nutritionTitle) {
  const normalized = normalizeLabel(nutritionTitle);
  if (!normalized) return 'g';

  if (normalized.includes('100ml') && !normalized.includes('100g')) {
    return 'ml';
  }

  return 'g';
}

function hasUsefulNutrition(normalizedProduct) {
  const values = [
    normalizedProduct.calories_per_100,
    normalizedProduct.kj_per_100,
    normalizedProduct.protein_per_100,
    normalizedProduct.carbs_per_100,
    normalizedProduct.sugar_per_100,
    normalizedProduct.fat_per_100,
    normalizedProduct.saturated_fat_per_100,
    normalizedProduct.fiber_per_100,
    normalizedProduct.salt_per_100,
  ];

  return values.some((value) => value !== null && value !== undefined);
}

function countNutritionFields(product) {
  const keys = [
    'calories_per_100',
    'kj_per_100',
    'protein_per_100',
    'carbs_per_100',
    'sugar_per_100',
    'fat_per_100',
    'saturated_fat_per_100',
    'fiber_per_100',
    'salt_per_100',
  ];

  return keys.reduce((count, key) => {
    const value = product[key];
    return value === null || value === undefined ? count : count + 1;
  }, 0);
}

function sanitizeRawSourceData(product, localDetails, filteredContentRows) {
  const nutritionInfoRows = localDetails?.nutrition_info_table?.rows;

  return {
    id: product?.id ?? null,
    name: product?.name ?? null,
    full_name: product?.full_name ?? null,
    brand: product?.brand ?? null,
    name_extra: product?.name_extra ?? null,
    front_url: product?.front_url ?? null,
    absolute_url: product?.absolute_url ?? null,
    detailed_info: {
      language: localDetails?.language ?? null,
      language_name: localDetails?.language_name ?? null,
      local_product_name: localDetails?.local_product_name ?? null,
      nutrition_info_table: {
        title: localDetails?.nutrition_info_table?.title ?? null,
        rows: Array.isArray(nutritionInfoRows)
          ? nutritionInfoRows.map((row) => ({
              key: row?.key ?? null,
              value: row?.value ?? null,
            }))
          : [],
      },
      contents_table: {
        rows: Array.isArray(filteredContentRows)
          ? filteredContentRows.map((row) => ({ key: row.key, value: row.value }))
          : [],
      },
      hazards: localDetails?.hazards ?? null,
    },
  };
}

function toAbsoluteProductUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${ODA_BASE_URL}${value}`;
  return `${ODA_BASE_URL}/${value}`;
}

function normalizeOdaProduct(product) {
  const productId = product?.id != null ? String(product.id) : null;
  if (!productId) {
    return {
      normalized: null,
      skipReason: 'missing_product_id',
      missingNutritionFields: [],
    };
  }

  const localDetails = pickPreferredLocalDetails(product);
  const nutritionRows = localDetails?.nutrition_info_table?.rows ?? [];
  const nutrition = normalizeNutritionRows(nutritionRows);
  const contentInfo = extractContentValues(localDetails?.contents_table?.rows ?? []);

  const name = String(product?.full_name ?? product?.name ?? '').trim();
  if (!name) {
    return {
      normalized: null,
      skipReason: 'missing_name',
      missingNutritionFields: [],
    };
  }

  const normalized = {
    id: `oda_${productId}`,
    user_id: null,
    brand_id: null,
    name,
    brand: product?.brand ? String(product.brand).trim() : null,
    variant: parseVariant(product?.name_extra),
    package_size: contentInfo.packageSize,
    barcode: contentInfo.barcode,
    source_provider: SOURCE_PROVIDER,
    source_product_id: productId,
    source_url: toAbsoluteProductUrl(product?.front_url ?? product?.absolute_url),
    api_url: `${ODA_API_BASE_URL}/${productId}/`,
    imported_at: nowIso(),
    private_snapshot: true,
    verified: false,
    calories_per_100: nutrition.calories_per_100,
    kj_per_100: nutrition.kj_per_100,
    protein_per_100: nutrition.protein_per_100,
    carbs_per_100: nutrition.carbs_per_100,
    sugar_per_100: nutrition.sugar_per_100,
    fat_per_100: nutrition.fat_per_100,
    saturated_fat_per_100: nutrition.saturated_fat_per_100,
    fiber_per_100: nutrition.fiber_per_100,
    salt_per_100: nutrition.salt_per_100,
    ingredients: contentInfo.ingredients,
    allergens: contentInfo.allergens,
    raw_source_data: sanitizeRawSourceData(product, localDetails, contentInfo.filteredRows),
  };

  const missingNutritionFields = [];
  const nutritionFieldKeys = [
    'calories_per_100',
    'kj_per_100',
    'protein_per_100',
    'carbs_per_100',
    'sugar_per_100',
    'fat_per_100',
    'saturated_fat_per_100',
    'fiber_per_100',
    'salt_per_100',
  ];

  for (const key of nutritionFieldKeys) {
    if (normalized[key] === null || normalized[key] === undefined) {
      missingNutritionFields.push(key);
    }
  }

  if (!hasUsefulNutrition(normalized)) {
    return {
      normalized: null,
      skipReason: 'missing_useful_nutrition',
      missingNutritionFields,
    };
  }

  return {
    normalized,
    skipReason: null,
    missingNutritionFields,
  };
}

function normalizedToUpsertRow(normalized) {
  const sodiumMg = normalized.salt_per_100 != null ? Number((normalized.salt_per_100 * 400).toFixed(2)) : null;

  return {
    id: normalized.id,
    user_id: null,
    brand_id: null,
    brand_name: normalized.brand,
    name: normalized.name,
    serving_size: 100,
    serving_unit: 'g',
    grams_per_serving: 100,
    calories: normalized.calories_per_100 ?? 0,
    protein_g: normalized.protein_per_100 ?? 0,
    carbs_g: normalized.carbs_per_100 ?? 0,
    fat_g: normalized.fat_per_100 ?? 0,
    fiber_g: normalized.fiber_per_100,
    sugar_g: normalized.sugar_per_100,
    saturated_fat_g: normalized.saturated_fat_per_100,
    sodium_mg: sodiumMg,
    barcode: normalized.barcode,
    source_provider: SOURCE_PROVIDER,
    source_product_id: normalized.source_product_id,
    source_url: normalized.source_url,
    api_url: normalized.api_url,
    imported_at: normalized.imported_at,
    private_snapshot: true,
    is_verified: false,
    is_custom: false,
    variant: normalized.variant,
    package_size: normalized.package_size,
    kj_per_100: normalized.kj_per_100,
    calories_per_100: normalized.calories_per_100,
    protein_per_100: normalized.protein_per_100,
    carbs_per_100: normalized.carbs_per_100,
    sugar_per_100: normalized.sugar_per_100,
    fat_per_100: normalized.fat_per_100,
    saturated_fat_per_100: normalized.saturated_fat_per_100,
    fiber_per_100: normalized.fiber_per_100,
    salt_per_100: normalized.salt_per_100,
    ingredients: normalized.ingredients,
    allergens: normalized.allergens,
    raw_source_data: normalized.raw_source_data,
  };
}

function dedupeNormalizedProducts(products) {
  const bySource = new Map();

  for (const product of products) {
    const key = `${product.source_provider}:${product.source_product_id}`;
    const existing = bySource.get(key);
    if (!existing) {
      bySource.set(key, product);
      continue;
    }

    if (countNutritionFields(product) > countNutritionFields(existing)) {
      bySource.set(key, product);
    }
  }

  const dedupedByBarcode = new Map();
  const deduped = [];

  for (const product of bySource.values()) {
    const barcode = product.barcode;
    if (!barcode) {
      deduped.push(product);
      continue;
    }

    const existingIndex = dedupedByBarcode.get(barcode);
    if (existingIndex === undefined) {
      dedupedByBarcode.set(barcode, deduped.length);
      deduped.push(product);
      continue;
    }

    const existing = deduped[existingIndex];
    if (countNutritionFields(product) > countNutritionFields(existing)) {
      deduped[existingIndex] = product;
    }
  }

  return deduped;
}

function buildUpsertPayload(normalizedProducts) {
  return dedupeNormalizedProducts(normalizedProducts).map(normalizedToUpsertRow);
}

async function ensureCacheDirectory() {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function appendJsonLine(filePath, value) {
  await fsp.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function shouldStopForErrors(httpErrorCounters, consecutiveRequestErrors) {
  if (httpErrorCounters.status429 >= STOP_THRESHOLDS.status429) return true;
  if (httpErrorCounters.status403 >= STOP_THRESHOLDS.status403) return true;
  if (httpErrorCounters.status401 >= STOP_THRESHOLDS.status401) return true;
  if (httpErrorCounters.status5xx >= STOP_THRESHOLDS.status5xx) return true;
  if (consecutiveRequestErrors >= STOP_THRESHOLDS.consecutiveRequestErrors) return true;

  return false;
}

function classifyHttpError(statusCode, counters) {
  if (statusCode === 429) counters.status429 += 1;
  if (statusCode === 403) counters.status403 += 1;
  if (statusCode === 401) counters.status401 += 1;
  if (statusCode >= 500 && statusCode <= 599) counters.status5xx += 1;
}

function normalizeSupabaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/rest\/v1$/i, '');
}

function isMissingColumnError(error, column) {
  if (!error) return false;
  const message = String(error.message ?? '');
  if (error.code === '42703') return true;
  if (message.includes('does not exist') && message.includes(column)) return true;
  return false;
}

async function tableHasColumn(client, column) {
  const { error } = await client.from('food_items').select(column).limit(1);
  if (!error) return true;
  if (isMissingColumnError(error, column)) return false;
  throw new Error(`Failed schema probe for food_items.${column}: ${error.message}`);
}

function pickWritableColumns(row, writableColumns) {
  const picked = {};
  for (const [key, value] of Object.entries(row)) {
    if (writableColumns.has(key)) {
      picked[key] = value;
    }
  }
  return picked;
}

async function resolveFoodItemsWriteContext(client) {
  const upsertColumns = [
    'id',
    'user_id',
    'brand_id',
    'brand_name',
    'name',
    'serving_size',
    'serving_unit',
    'grams_per_serving',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fiber_g',
    'sugar_g',
    'saturated_fat_g',
    'sodium_mg',
    'barcode',
    'source_provider',
    'source_product_id',
    'source_url',
    'api_url',
    'imported_at',
    'private_snapshot',
    'is_verified',
    'is_custom',
    'variant',
    'package_size',
    'kj_per_100',
    'calories_per_100',
    'protein_per_100',
    'carbs_per_100',
    'sugar_per_100',
    'fat_per_100',
    'saturated_fat_per_100',
    'fiber_per_100',
    'salt_per_100',
    'ingredients',
    'allergens',
    'raw_source_data',
  ];

  const writableColumns = new Set();
  for (const column of upsertColumns) {
    if (await tableHasColumn(client, column)) {
      writableColumns.add(column);
    }
  }

  const hasSourceProductId = writableColumns.has('source_product_id');
  const hasBarcode = writableColumns.has('barcode');

  return {
    writableColumns,
    hasSourceProductId,
    hasBarcode,
    conflictTarget: hasSourceProductId ? 'source_provider,source_product_id' : 'id',
    mode: hasSourceProductId ? 'extended' : 'legacy',
  };
}

function resolveSupabaseConfig(options) {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

  if (!url) {
    throw new Error('Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) in environment.');
  }

  if (!options.dryRun && !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY). Write mode requires service role key so importer can upsert with RLS enabled.',
    );
  }

  return {
    url: normalizeSupabaseUrl(url),
    serviceRoleKey,
  };
}

function createImportStats() {
  return {
    startedAt: nowIso(),
    discoveredProductUrls: 0,
    attemptedProducts: 0,
    successfullyParsed: 0,
    inserted: 0,
    updated: 0,
    skippedMissingData: 0,
    failedApiRequests: 0,
    failedDatabaseInserts: 0,
    dedupedByBarcode: 0,
    missingNutritionFieldCounts: {},
  };
}

function incrementMissingFieldCounters(stats, missingFields) {
  for (const field of missingFields) {
    stats.missingNutritionFieldCounts[field] = (stats.missingNutritionFieldCounts[field] ?? 0) + 1;
  }
}

async function inspectSampleResponses(products, inspectCount, delayMs) {
  const inspected = [];
  const sample = products.slice(0, Math.max(0, inspectCount));

  for (const item of sample) {
    const apiUrl = `${ODA_API_BASE_URL}/${item.productId}/`;
    const response = await requestWithBackoff(apiUrl, {
      accept: 'application/json',
      parseAs: 'json',
      stopOnAuthErrors: false,
    });

    if (!response.ok) {
      inspected.push({
        productId: item.productId,
        apiUrl,
        ok: false,
        status: response.status,
        error: response.error,
      });
      await sleep(delayMs);
      continue;
    }

    const product = response.data;
    const local = pickPreferredLocalDetails(product);
    const nutritionRows = local?.nutrition_info_table?.rows ?? [];
    const contentRows = local?.contents_table?.rows ?? [];

    inspected.push({
      productId: item.productId,
      apiUrl,
      ok: true,
      topLevelKeys: Object.keys(product ?? {}).sort(),
      localKeys: Object.keys(local ?? {}).sort(),
      nutritionKeys: nutritionRows.map((row) => row?.key).filter(Boolean),
      contentKeys: contentRows.map((row) => row?.key).filter(Boolean),
    });

    await sleep(delayMs);
  }

  await writeJsonFile(SAMPLE_STRUCTURE_FILE, {
    inspectedAt: nowIso(),
    inspected,
  });

  return inspected;
}

async function fetchProductJson(productId) {
  const apiUrl = `${ODA_API_BASE_URL}/${productId}/`;
  const response = await requestWithBackoff(apiUrl, {
    accept: 'application/json',
    parseAs: 'json',
    stopOnAuthErrors: false,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: response.error,
      body: response.body,
      apiUrl,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: response.data,
    apiUrl,
  };
}

async function upsertFoodBatch(client, upsertRows, writeContext) {
  if (!upsertRows.length) {
    return {
      inserted: 0,
      updated: 0,
      dedupedByBarcode: 0,
      errors: [],
    };
  }

  const sourceProductIds = writeContext.hasSourceProductId
    ? upsertRows.map((row) => row.source_product_id).filter(Boolean)
    : [];
  const barcodes = writeContext.hasBarcode ? upsertRows.map((row) => row.barcode).filter(Boolean) : [];
  const upsertIds = !writeContext.hasSourceProductId ? upsertRows.map((row) => row.id).filter(Boolean) : [];

  const [sourceExistingResponse, barcodeExistingResponse] = await Promise.all([
    writeContext.hasSourceProductId && sourceProductIds.length
      ? client
          .from('food_items')
          .select('id, source_provider, source_product_id')
          .eq('source_provider', SOURCE_PROVIDER)
          .in('source_product_id', sourceProductIds)
      : !writeContext.hasSourceProductId && upsertIds.length
        ? client.from('food_items').select('id').in('id', upsertIds)
        : Promise.resolve({ data: [], error: null }),
    writeContext.hasBarcode && barcodes.length
      ? client
          .from('food_items')
          .select(
            writeContext.hasSourceProductId
              ? 'id, source_provider, source_product_id, barcode'
              : 'id, barcode',
          )
          .eq('source_provider', SOURCE_PROVIDER)
          .in('barcode', barcodes)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sourceExistingResponse.error) {
    return {
      inserted: 0,
      updated: 0,
      dedupedByBarcode: 0,
      errors: [sourceExistingResponse.error.message],
    };
  }

  if (barcodeExistingResponse.error) {
    return {
      inserted: 0,
      updated: 0,
      dedupedByBarcode: 0,
      errors: [barcodeExistingResponse.error.message],
    };
  }

  const existingBySource = new Map();
  for (const row of sourceExistingResponse.data ?? []) {
    const key = writeContext.hasSourceProductId ? `${row.source_provider}:${row.source_product_id}` : row.id;
    existingBySource.set(key, row);
  }

  const existingByBarcode = new Map();
  for (const row of barcodeExistingResponse.data ?? []) {
    if (row.barcode) {
      existingByBarcode.set(row.barcode, row);
    }
  }

  const finalUpserts = [];
  const barcodeMerges = [];

  for (const row of upsertRows) {
    const sourceKey = writeContext.hasSourceProductId ? `${SOURCE_PROVIDER}:${row.source_product_id}` : row.id;
    if (existingBySource.has(sourceKey)) {
      finalUpserts.push(row);
      continue;
    }

    if (writeContext.hasBarcode && row.barcode && existingByBarcode.has(row.barcode)) {
      barcodeMerges.push({
        existingId: existingByBarcode.get(row.barcode).id,
        row,
      });
      continue;
    }

    finalUpserts.push(row);
  }

  const errors = [];
  let updated = 0;
  let inserted = 0;
  let dedupedByBarcode = 0;

  for (const merge of barcodeMerges) {
    const updatePayload = pickWritableColumns(merge.row, writeContext.writableColumns);
    delete updatePayload.id;
    updatePayload.updated_at = nowIso();

    const { error } = await client.from('food_items').update(updatePayload).eq('id', merge.existingId);
    if (error) {
      errors.push(`barcode merge ${merge.row.source_product_id ?? merge.row.id}: ${error.message}`);
      continue;
    }

    dedupedByBarcode += 1;
    updated += 1;
  }

  const existingSourceKeys = new Set(Array.from(existingBySource.keys()));
  for (const row of finalUpserts) {
    const key = writeContext.hasSourceProductId ? `${SOURCE_PROVIDER}:${row.source_product_id}` : row.id;
    if (existingSourceKeys.has(key)) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  if (finalUpserts.length) {
    const writableRows = finalUpserts.map((row) => pickWritableColumns(row, writeContext.writableColumns));
    const { error } = await client
      .from('food_items')
      .upsert(writableRows, { onConflict: writeContext.conflictTarget });

    if (error) {
      errors.push(error.message);
      inserted = 0;
      updated = 0;
      dedupedByBarcode = 0;
    }
  }

  return {
    inserted,
    updated,
    dedupedByBarcode,
    errors,
  };
}

async function runImporter(options) {
  loadImporterEnvironment();
  await ensureCacheDirectory();

  const stats = createImportStats();
  const httpErrorCounters = {
    status429: 0,
    status403: 0,
    status401: 0,
    status5xx: 0,
  };
  let consecutiveRequestErrors = 0;

  const progress = options.resume
    ? await readJsonFile(PROGRESS_FILE, {
        startedAt: nowIso(),
        updatedAt: nowIso(),
        processed: {},
      })
    : {
        startedAt: nowIso(),
        updatedAt: nowIso(),
        processed: {},
      };

  if (!options.resume && fs.existsSync(FAILED_IMPORTS_FILE)) {
    await fsp.unlink(FAILED_IMPORTS_FILE);
  }

  let products;
  if (options.onlyProductId) {
    products = [
      {
        productId: options.onlyProductId,
        productUrl: `https://oda.com/no/products/${options.onlyProductId}/`,
      },
    ];
  } else {
    const discovery = await discoverProductUrls({
      sitemapUrl: options.sitemapUrl,
      delayMs: options.delayMs,
      useCache: options.resume,
    });
    products = discovery.products;
  }

  stats.discoveredProductUrls = products.length;

  if (!products.length) {
    throw new Error('No product URLs discovered from sitemap.');
  }

  if (options.limit) {
    products = products.slice(0, options.limit);
  }

  const inspected = await inspectSampleResponses(products, options.inspectCount, options.delayMs);
  const inspectedSuccessCount = inspected.filter((item) => item.ok).length;
  console.log(`Inspected ${inspected.length} sample product responses (${inspectedSuccessCount} successful).`);
  console.log(`Sample structure written to ${path.relative(process.cwd(), SAMPLE_STRUCTURE_FILE)}.`);

  const writeMode = !options.dryRun;
  let supabaseClient = null;
  let writeContext = null;
  if (writeMode) {
    const supabaseConfig = resolveSupabaseConfig(options);
    supabaseClient = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    writeContext = await resolveFoodItemsWriteContext(supabaseClient);
    console.log(
      `Detected food_items schema mode: ${writeContext.mode} (conflict target: ${writeContext.conflictTarget}, writable columns: ${writeContext.writableColumns.size}).`,
    );
  }

  const normalizedBatch = [];

  const flushBatch = async () => {
    if (!normalizedBatch.length) return;

    const payload = buildUpsertPayload(normalizedBatch.splice(0, normalizedBatch.length));
    if (!payload.length) return;

    if (options.dryRun) {
      console.log(`Dry run batch prepared (${payload.length} rows).`);
      return;
    }

    const result = await upsertFoodBatch(supabaseClient, payload, writeContext);
    stats.inserted += result.inserted;
    stats.updated += result.updated;
    stats.dedupedByBarcode += result.dedupedByBarcode;

    if (result.errors.length) {
      stats.failedDatabaseInserts += payload.length;
      for (const errorMessage of result.errors) {
        console.error(`Supabase batch upsert error: ${errorMessage}`);
      }
    }
  };

  for (let index = 0; index < products.length; index += 1) {
    const item = products[index];
    const productId = item.productId;

    const previous = progress.processed[productId];
    if (options.resume && previous && ['inserted', 'updated', 'skipped', 'dry-run'].includes(previous.status)) {
      continue;
    }

    stats.attemptedProducts += 1;

    const fetchResult = await fetchProductJson(productId);
    if (!fetchResult.ok) {
      stats.failedApiRequests += 1;
      classifyHttpError(fetchResult.status, httpErrorCounters);
      consecutiveRequestErrors += 1;

      await appendJsonLine(FAILED_IMPORTS_FILE, {
        at: nowIso(),
        productId,
        productUrl: item.productUrl,
        apiUrl: fetchResult.apiUrl,
        status: fetchResult.status,
        error: fetchResult.error,
      });

      progress.processed[productId] = {
        status: 'failed',
        at: nowIso(),
        statusCode: fetchResult.status,
        error: fetchResult.error,
      };

      if (shouldStopForErrors(httpErrorCounters, consecutiveRequestErrors)) {
        console.error('Stopping importer because error threshold was reached.');
        break;
      }

      await writeJsonFile(PROGRESS_FILE, {
        ...progress,
        updatedAt: nowIso(),
      });

      await sleep(options.delayMs);
      continue;
    }

    consecutiveRequestErrors = 0;

    const parsed = normalizeOdaProduct(fetchResult.data);
    if (!parsed.normalized) {
      stats.skippedMissingData += 1;
      incrementMissingFieldCounters(stats, parsed.missingNutritionFields);

      progress.processed[productId] = {
        status: 'skipped',
        at: nowIso(),
        reason: parsed.skipReason,
        missingNutritionFields: parsed.missingNutritionFields,
      };

      await writeJsonFile(PROGRESS_FILE, {
        ...progress,
        updatedAt: nowIso(),
      });

      await sleep(options.delayMs);
      continue;
    }

    stats.successfullyParsed += 1;
    incrementMissingFieldCounters(stats, parsed.missingNutritionFields);

    if (options.dryRun) {
      const preview = {
        productId,
        name: parsed.normalized.name,
        brand: parsed.normalized.brand,
        package_size: parsed.normalized.package_size,
        calories_per_100: parsed.normalized.calories_per_100,
        protein_per_100: parsed.normalized.protein_per_100,
        carbs_per_100: parsed.normalized.carbs_per_100,
        fat_per_100: parsed.normalized.fat_per_100,
        sugar_per_100: parsed.normalized.sugar_per_100,
        fiber_per_100: parsed.normalized.fiber_per_100,
        salt_per_100: parsed.normalized.salt_per_100,
        missingNutritionFields: parsed.missingNutritionFields,
      };

      console.log(`Dry run normalized product ${productId}:`);
      console.log(JSON.stringify(preview, null, 2));

      progress.processed[productId] = {
        status: 'dry-run',
        at: nowIso(),
      };
    } else {
      normalizedBatch.push(parsed.normalized);
      progress.processed[productId] = {
        status: 'parsed',
        at: nowIso(),
      };

      if (normalizedBatch.length >= options.batchSize) {
        await flushBatch();
      }
    }

    if ((index + 1) % 20 === 0 || index === products.length - 1) {
      await writeJsonFile(PROGRESS_FILE, {
        ...progress,
        updatedAt: nowIso(),
      });

      console.log(
        `Progress ${index + 1}/${products.length} | parsed=${stats.successfullyParsed} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skippedMissingData} failed_api=${stats.failedApiRequests} failed_db=${stats.failedDatabaseInserts}`,
      );
    }

    await sleep(options.delayMs);
  }

  await flushBatch();

  progress.updatedAt = nowIso();
  await writeJsonFile(PROGRESS_FILE, progress);

  return {
    stats,
    httpErrorCounters,
    progressFile: PROGRESS_FILE,
    failedImportsFile: FAILED_IMPORTS_FILE,
    sampleStructureFile: SAMPLE_STRUCTURE_FILE,
  };
}

function printFinalReport(result) {
  const { stats, httpErrorCounters, progressFile, failedImportsFile, sampleStructureFile } = result;

  console.log('');
  console.log('=== Oda import summary ===');
  console.log(`discovered product URLs: ${stats.discoveredProductUrls}`);
  console.log(`attempted products: ${stats.attemptedProducts}`);
  console.log(`successfully parsed: ${stats.successfullyParsed}`);
  console.log(`inserted: ${stats.inserted}`);
  console.log(`updated: ${stats.updated}`);
  console.log(`deduped by barcode: ${stats.dedupedByBarcode}`);
  console.log(`skipped because of missing data: ${stats.skippedMissingData}`);
  console.log(`failed API requests: ${stats.failedApiRequests}`);
  console.log(`failed database inserts: ${stats.failedDatabaseInserts}`);
  console.log(`429 count: ${httpErrorCounters.status429}`);
  console.log(`403 count: ${httpErrorCounters.status403}`);
  console.log(`401 count: ${httpErrorCounters.status401}`);
  console.log(`5xx count: ${httpErrorCounters.status5xx}`);
  console.log(`sample structure log: ${path.relative(process.cwd(), sampleStructureFile)}`);
  console.log(`progress file: ${path.relative(process.cwd(), progressFile)}`);
  console.log(`failed imports file: ${path.relative(process.cwd(), failedImportsFile)}`);
  console.log('==========================');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log('Starting FuelForm private Oda importer...');
  console.log(
    JSON.stringify(
      {
        dryRun: options.dryRun,
        resume: options.resume,
        all: options.all,
        sample: options.sample,
        limit: options.limit,
        onlyProductId: options.onlyProductId,
        delayMs: options.delayMs,
        batchSize: options.batchSize,
      },
      null,
      2,
    ),
  );

  const result = await runImporter(options);
  printFinalReport(result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Oda importer failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  ROOT_SITEMAP_URL,
  SOURCE_PROVIDER,
  ODA_PRODUCT_URL_REGEX,
  parseArgs,
  parseSitemapXml,
  extractProductIdFromOdaUrl,
  discoverProductUrls,
  parseDecimalNumber,
  parseEnergyValue,
  normalizeNutritionRows,
  normalizeOdaProduct,
  normalizedToUpsertRow,
  dedupeNormalizedProducts,
  buildUpsertPayload,
  parseRetryAfterMs,
};
