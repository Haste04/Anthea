export type SpeciesMatch = {
  matched: true;
  id: number;
  commonName: string;
  scientificName: string;
};

export type SpeciesMiss = {
  matched: false;
};

export type ConfirmSpeciesResult = SpeciesMatch | SpeciesMiss;

export type CareData = {
  wateringCategory: string | null;
  baseDays: number | null;
  sunlight: string[];
  soil: string[];
};

function getApiKey(): string {
  const key = process.env.PERENUAL_API_KEY;
  if (!key || key === "your_perenual_api_key_here") {
    throw new Error("PERENUAL_API_KEY is not configured");
  }
  return key;
}

type SpeciesListItem = {
  id: number;
  common_name?: string | null;
  scientific_name?: string[] | string | null;
};

type SpeciesListResponse = {
  data?: SpeciesListItem[];
};

type SpeciesDetailsResponse = {
  watering?: string | null;
  watering_general_benchmark?: {
    value?: string | number | null;
    unit?: string | null;
  } | null;
  sunlight?: string[] | string | null;
  soil?: string[] | string | null;
};

async function searchSpecies(query: string): Promise<SpeciesListItem | null> {
  const key = getApiKey();
  const url = `https://perenual.com/api/v2/species-list?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    // Fallback to v1 path used by free tier docs
    const fallback = `https://perenual.com/api/species-list?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`;
    const res2 = await fetch(fallback, { next: { revalidate: 0 } });
    if (!res2.ok) return null;
    const json2 = (await res2.json()) as SpeciesListResponse;
    return json2.data?.[0] ?? null;
  }
  const json = (await res.json()) as SpeciesListResponse;
  return json.data?.[0] ?? null;
}

function scientificLabel(item: SpeciesListItem): string {
  if (Array.isArray(item.scientific_name)) {
    return item.scientific_name[0] ?? "";
  }
  return item.scientific_name ?? "";
}

export async function confirmSpecies(
  commonName: string,
  scientificName: string
): Promise<ConfirmSpeciesResult> {
  const common = (commonName || "").trim();
  const scientific = (scientificName || "").trim();

  let hit: SpeciesListItem | null = null;
  if (common) {
    hit = await searchSpecies(common);
  }
  if (!hit && scientific) {
    hit = await searchSpecies(scientific);
  }
  if (!hit) {
    return { matched: false };
  }

  return {
    matched: true,
    id: hit.id,
    commonName: hit.common_name ?? common,
    scientificName: scientificLabel(hit) || scientific,
  };
}

function asStringArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function parseBaseDays(
  benchmark: SpeciesDetailsResponse["watering_general_benchmark"]
): number | null {
  if (!benchmark?.value) return null;
  const raw = String(benchmark.value);
  // Often "7-10" or "5" — take the midpoint / first number
  const nums = raw.match(/\d+/g)?.map(Number);
  if (!nums || nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

export async function getCareData(id: number): Promise<CareData> {
  const key = getApiKey();
  let url = `https://perenual.com/api/v2/species/details/${id}?key=${encodeURIComponent(key)}`;
  let res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    url = `https://perenual.com/api/species/details/${id}?key=${encodeURIComponent(key)}`;
    res = await fetch(url, { next: { revalidate: 0 } });
  }
  if (!res.ok) {
    return {
      wateringCategory: null,
      baseDays: null,
      sunlight: [],
      soil: [],
    };
  }

  const json = (await res.json()) as SpeciesDetailsResponse;
  return {
    wateringCategory: json.watering ?? null,
    baseDays: parseBaseDays(json.watering_general_benchmark),
    sunlight: asStringArray(json.sunlight),
    soil: asStringArray(json.soil),
  };
}
