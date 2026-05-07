const fs = require('node:fs');
const path = require('node:path');

const fixture = require('./fixtures/oda-product-36715.json');

const importer = require('../scripts/import-oda-foods');

const {
  buildUpsertPayload,
  dedupeNormalizedProducts,
  discoverProductUrls,
  extractCaffeineMgPer100Ml,
  extractProductIdFromOdaUrl,
  normalizeNutritionRows,
  normalizeOdaProduct,
  parseArgs,
  parseDecimalNumber,
  parseEnergyValue,
  parseVolumeMl,
  parseSitemapXml,
} = importer;

function createTextResponse(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'application/xml',
    },
  });
}

describe('oda importer helpers', () => {
  const originalFetch = global.fetch;

  function buildMinimalProduct({
    id,
    name,
    brand,
    nutritionTitle,
  }: {
    id: number;
    name: string;
    brand?: string;
    nutritionTitle?: string;
  }) {
    return {
      id,
      name,
      full_name: name,
      brand: brand ?? null,
      detailed_info: {
        local: [
          {
            language: 'nb',
            nutrition_info_table: {
              title: nutritionTitle ?? 'Næringsinnhold per 100 g',
              rows: [
                { key: 'Energi', value: '2200 kJ / 530 kcal' },
                { key: 'Fett', value: '34 g' },
                { key: 'Karbohydrater', value: '50 g' },
                { key: 'Protein', value: '6 g' },
                { key: 'Salt', value: '1.3 g' },
              ],
            },
            contents_table: {
              rows: [],
            },
          },
        ],
      },
    };
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extracts product ID from Oda product URLs', () => {
    expect(extractProductIdFromOdaUrl('https://oda.com/no/products/36715-tine-yt-proteinyoghurt-vanilje/')).toBe('36715');
    expect(extractProductIdFromOdaUrl('https://oda.com/no/products/69351-kylling-rub/')).toBe('69351');
    expect(extractProductIdFromOdaUrl('https://oda.com/no/categories/1283-meieri/')).toBeNull();
  });

  it('parses sitemap XML loc entries', () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://oda.com/no/products/36715-a/</loc></url><url><loc>https://oda.com/no/products/36716-b/</loc></url></urlset>`;
    expect(parseSitemapXml(xml)).toEqual([
      'https://oda.com/no/products/36715-a/',
      'https://oda.com/no/products/36716-b/',
    ]);
  });

  it('follows nested sitemap files and discovers products', async () => {
    const rootXml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://oda.com/sitemap/nb/products/1.xml</loc></sitemap><sitemap><loc>https://oda.com/sitemap/nb/products/2.xml</loc></sitemap></sitemapindex>`;
    const nested1 = `<?xml version="1.0"?><urlset><url><loc>https://oda.com/no/products/36715-a/</loc></url></urlset>`;
    const nested2 = `<?xml version="1.0"?><urlset><url><loc>https://oda.com/no/products/36716-b/</loc></url><url><loc>https://oda.com/no/products/36715-a/</loc></url></urlset>`;

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://oda.com/sitemap.xml') return createTextResponse(200, rootXml);
      if (url === 'https://oda.com/sitemap/nb/products/1.xml') return createTextResponse(200, nested1);
      if (url === 'https://oda.com/sitemap/nb/products/2.xml') return createTextResponse(200, nested2);
      return createTextResponse(404, '');
    }) as typeof fetch;

    const tempCachePath = path.join(__dirname, 'fixtures', 'tmp-discovery-cache.json');
    if (fs.existsSync(tempCachePath)) {
      fs.unlinkSync(tempCachePath);
    }

    const result = await discoverProductUrls({
      sitemapUrl: 'https://oda.com/sitemap.xml',
      delayMs: 1,
      cacheFilePath: tempCachePath,
      useCache: false,
      logger: {
        log: () => undefined,
        warn: () => undefined,
      },
    });

    expect(result.products).toHaveLength(2);
    expect(result.products.map((p: { productId: string }) => p.productId)).toEqual(['36715', '36716']);

    if (fs.existsSync(tempCachePath)) {
      fs.unlinkSync(tempCachePath);
    }
  });

  it('normalizes decimal numbers and energy values', () => {
    expect(parseDecimalNumber('0,33 liter')).toBe(0.33);
    expect(parseDecimalNumber('95.20 g')).toBe(95.2);

    expect(parseEnergyValue('284 kJ / 67 kcal')).toEqual({ kj: 284, kcal: 67 });
    expect(parseEnergyValue('67 kcal')).toEqual({ kj: null, kcal: 67 });
  });

  it('parses explicit product ID lists and inspect-count=0', () => {
    const parsed = parseArgs(['--product-ids=23300,6718,67231', '--inspect-count=0']);
    expect(parsed.productIds).toEqual(['23300', '6718', '67231']);
    expect(parsed.limit).toBe(3);
    expect(parsed.inspectCount).toBe(0);
  });

  it('parses package volume text to milliliters', () => {
    expect(parseVolumeMl('0,50 liter')).toBe(500);
    expect(parseVolumeMl('473 ml')).toBe(473);
    expect(parseVolumeMl('2 liter')).toBe(2000);
    expect(parseVolumeMl('n/a')).toBeNull();
  });

  it('extracts caffeine mg per 100 ml from common labels', () => {
    expect(
      extractCaffeineMgPer100Ml(
        'Høyt koffeininnhold. Anbefales ikke for barn, gravide og personer som ammer (32mg/100ml).',
      ),
    ).toBe(32);

    expect(extractCaffeineMgPer100Ml('Ingredienser: koffein (0,03%)', { brand: 'Monster' })).toBe(32);
    expect(extractCaffeineMgPer100Ml('Ingredienser: koffein (32 mg/l)', { brand: 'Battery' })).toBe(32);
  });

  it('normalizes nutrition rows with norwegian labels', () => {
    const rows = [
      { key: 'Energi', value: '284 kJ / 67 kcal' },
      { key: 'Fett', value: '1.80 g' },
      { key: 'hvorav mettede fettsyrer', value: '1.20 g' },
      { key: 'Karbohydrater', value: '3.20 g' },
      { key: 'hvorav sukkerarter', value: '3.10 g' },
      { key: 'Protein', value: '9.20 g' },
      { key: 'Salt', value: '0.10 g' },
      { key: 'Kostfiber', value: '2,40 g' },
    ];

    const normalized = normalizeNutritionRows(rows);
    expect(normalized.calories_per_100).toBe(67);
    expect(normalized.kj_per_100).toBe(284);
    expect(normalized.fat_per_100).toBe(1.8);
    expect(normalized.saturated_fat_per_100).toBe(1.2);
    expect(normalized.carbs_per_100).toBe(3.2);
    expect(normalized.sugar_per_100).toBe(3.1);
    expect(normalized.protein_per_100).toBe(9.2);
    expect(normalized.salt_per_100).toBe(0.1);
    expect(normalized.fiber_per_100).toBe(2.4);
  });

  it('deduplicates by source key and barcode', () => {
    const a = {
      source_provider: 'oda_private_snapshot',
      source_product_id: '100',
      barcode: '12345678',
      calories_per_100: 10,
      protein_per_100: null,
      carbs_per_100: null,
      sugar_per_100: null,
      fat_per_100: null,
      saturated_fat_per_100: null,
      fiber_per_100: null,
      salt_per_100: null,
      kj_per_100: null,
    };

    const b = {
      ...a,
      source_product_id: '101',
      calories_per_100: 20,
      protein_per_100: 5,
    };

    const deduped = dedupeNormalizedProducts([a, b]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source_product_id).toBe('101');
  });

  it('builds upsert payload for food_items', () => {
    const normalized = {
      id: 'oda_36715',
      name: 'TINE YT proteinyoghurt Vanilje',
      brand: 'TINE',
      variant: 'Vanilje',
      package_size: '430 gram',
      barcode: null,
      source_provider: 'oda_private_snapshot',
      source_product_id: '36715',
      source_url: 'https://oda.com/no/products/36715-tine-yt-proteinyoghurt-vanilje/',
      api_url: 'https://oda.com/api/v1/products/36715/',
      imported_at: '2026-04-25T12:00:00.000Z',
      private_snapshot: true,
      verified: false,
      calories_per_100: 67,
      kj_per_100: 284,
      protein_per_100: 9.2,
      carbs_per_100: 3.2,
      sugar_per_100: 3.1,
      fat_per_100: 1.8,
      saturated_fat_per_100: 1.2,
      fiber_per_100: null,
      salt_per_100: 0.1,
      caffeine_mg_per_100ml: 32,
      caffeine_mg_per_can: 160,
      ingredients: 'milk',
      allergens: 'milk',
      raw_source_data: { id: 36715 },
    };

    const payload = buildUpsertPayload([normalized]);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      id: 'oda_36715',
      source_provider: 'oda_private_snapshot',
      source_product_id: '36715',
      calories: 67,
      protein_g: 9.2,
      carbs_g: 3.2,
      fat_g: 1.8,
      salt_per_100: 0.1,
      sodium_mg: 40,
      caffeine_mg_per_100ml: 32,
      caffeine_mg_per_can: 160,
      serving_unit: 'g',
    });
  });

  it('does not classify food names with "te" substring as drink', () => {
    const chips = normalizeOdaProduct(
      buildMinimalProduct({
        id: 70001,
        name: 'Mårud Salt og Pepper Potetgull',
        brand: 'Mårud',
      }),
    );
    expect(chips.skipReason).toBeNull();
    expect(chips.normalized).toBeTruthy();
    expect(chips.normalized.item_type).toBe('food');

    const pate = normalizeOdaProduct(
      buildMinimalProduct({
        id: 70002,
        name: 'Leverpostei Original',
        brand: 'Stabburet',
      }),
    );
    expect(pate.skipReason).toBeNull();
    expect(pate.normalized).toBeTruthy();
    expect(pate.normalized.item_type).toBe('food');
  });

  it('still classifies obvious drinks as drink', () => {
    const drink = normalizeOdaProduct(
      buildMinimalProduct({
        id: 70003,
        name: 'Battery Energidrikk',
        brand: 'Battery',
        nutritionTitle: 'Næringsinnhold per 100 ml',
      }),
    );
    expect(drink.skipReason).toBeNull();
    expect(drink.normalized).toBeTruthy();
    expect(drink.normalized.item_type).toBe('drink');
  });

  it('parses and normalizes a real sample fixture', () => {
    const parsed = normalizeOdaProduct(fixture);
    expect(parsed.skipReason).toBeNull();
    expect(parsed.normalized).toBeTruthy();
    expect(parsed.normalized.name).toContain('proteinyoghurt');
    expect(parsed.normalized.brand).toBe('TINE');
    expect(parsed.normalized.calories_per_100).toBe(67);
    expect(parsed.normalized.protein_per_100).toBe(9.2);
    expect(parsed.normalized.ingredients).toContain('lettmelk');
    expect(parsed.normalized.source_product_id).toBe('36715');
  });
});
