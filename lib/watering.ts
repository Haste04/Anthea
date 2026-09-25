export type SoilType = "sandy" | "loamy" | "clay" | string;

const SOIL_MULTIPLIERS: Record<string, number> = {
  sandy: 0.7,
  loamy: 1.0,
  clay: 1.4,
};

function tempMultiplier(tempC: number): number {
  if (tempC < 15) return 1.3;
  if (tempC > 25) return 0.8;
  return 1.0;
}

export type WateringResult = {
  intervalDays: number;
  baseDays: number;
  soilType: string;
  soilMultiplier: number;
  tempC: number;
  climateMultiplier: number;
};

export function calculateWatering(
  baseDays: number,
  soilType: string,
  tempC: number
): WateringResult {
  const normalizedSoil = soilType.trim().toLowerCase();
  const soilMultiplier = SOIL_MULTIPLIERS[normalizedSoil] ?? 1.0;
  const climateMultiplier = tempMultiplier(tempC);
  const intervalDays = Math.max(
    1,
    Math.round(baseDays * soilMultiplier * climateMultiplier)
  );

  return {
    intervalDays,
    baseDays,
    soilType: normalizedSoil,
    soilMultiplier,
    tempC,
    climateMultiplier,
  };
}
