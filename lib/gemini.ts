import {
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
  type Content,
  type Part,
} from "@google/genai";
import { diagnoseSymptoms } from "@/lib/diagnose";
import { confirmSpecies, getCareData } from "@/lib/perenual";
import { calculateWatering } from "@/lib/watering";

export type AssistantPayload = {
  response_text: string;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

// Check https://ai.google.dev/gemini-api/docs/models before deploying —
// model availability and quotas here have changed multiple times during
// this project (1.5-flash, 2.5-flash, and 2.0-line models all retired;
// 3.8-flash's free tier was only 20 req/day and frequently 503'd from
// high demand). gemini-3.5-flash-lite is confirmed Stable (not preview)
// on Google's current model list and positioned as their cost-effective,
// high-throughput option - re-verify this is still true before deploying.
const TEXT_MODEL = "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `You are a hands-free plant voice assistant. The user speaks plant traits, symptoms, and care questions.

Once you have called all the tools you need and received their results, your
VERY NEXT text response is spoken directly to the user with no further
processing. That response must be the final answer, not a description of
what you found.

Rules for your FINAL spoken reply to the user:
- Exactly 2 to 3 plain sentences. No markdown, no asterisks, no bullet points, no lists, no code formatting.
- Clearly say when care numbers are estimates versus looked-up data. If is_estimate is true, phrase like "based on typical care for this type of plant".
- If diagnosis confidence is none, say you cannot identify a specific issue from the description. Do not invent a disease.
- If diagnosis confidence is low, hedge with "this could suggest" rather than stating it flatly.
- Use the structured facts provided after tools run. Do not invent watering intervals that contradict tool results.

Tools:
- identify_plant: guess common and scientific names from spoken physical traits (your reasoning only).
- diagnose_symptoms: match spoken symptoms to a local rule table.
- get_care_data: look up real watering, light, and soil via Perenual after you have a species name.
- calculate_watering: adjust watering interval for soil type and temperature.

When the user describes traits and asks about watering, call identify_plant, then get_care_data, then calculate_watering if soil or climate is mentioned. Call diagnose_symptoms when symptoms are present.`;

const tools: FunctionDeclaration[] = [
  {
    name: "identify_plant",
    description:
      "Identify a plant from spoken physical traits. Returns best-guess common and scientific names from model reasoning; no external lookup.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        traits: {
          type: Type.STRING,
          description: "Physical traits described by the user",
        },
        common_name: {
          type: Type.STRING,
          description: "Best-guess common name",
        },
        scientific_name: {
          type: Type.STRING,
          description: "Best-guess scientific name",
        },
      },
      required: ["traits", "common_name", "scientific_name"],
    },
  },
  {
    name: "diagnose_symptoms",
    description:
      "Match spoken plant symptoms against a local disease rule table.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symptoms: {
          type: Type.STRING,
          description: "Symptom description from the user",
        },
      },
      required: ["symptoms"],
    },
  },
  {
    name: "get_care_data",
    description:
      "Confirm a species via Perenual and return real watering, sunlight, and soil data. Sets is_estimate when no match.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        species_common_name: { type: Type.STRING },
        species_scientific_name: { type: Type.STRING },
      },
      required: ["species_common_name", "species_scientific_name"],
    },
  },
  {
    name: "calculate_watering",
    description:
      "Calculate a watering interval in days from base days, soil type, and temperature Celsius.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        base_days: { type: Type.NUMBER },
        soil_type: {
          type: Type.STRING,
          description: "sandy, loamy, or clay",
        },
        temp_c: { type: Type.NUMBER },
      },
      required: ["base_days", "soil_type", "temp_c"],
    },
  },
];

function stripMarkdown(text: string): string {
  return text
    .replace(/[`*_#]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return key;
}

function getClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getApiKey() });
}

function isTransientOverload(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('"code":503') || msg.includes("UNAVAILABLE");
}

function isQuotaExceeded(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('"code":429') || msg.includes("RESOURCE_EXHAUSTED");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries ONLY on transient 503 overload (a couple hundred ms to a few
// seconds of real recovery time). Never retries on 429 quota-exceeded -
// that wastes another request against an already-exhausted daily cap
// for zero chance of success.
async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  label: string,
): ReturnType<GoogleGenAI["models"]["generateContent"]> {
  const delaysMs = [800, 2000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      lastError = error;
      if (isQuotaExceeded(error)) {
        console.error(`${label}: quota exceeded, not retrying`, error);
        throw error;
      }
      if (isTransientOverload(error) && attempt < delaysMs.length) {
        console.error(
          `${label}: transient 503, retrying in ${delaysMs[attempt]}ms`,
          error,
        );
        await sleep(delaysMs[attempt]);
        continue;
      }
      console.error(`${label}: failed`, error);
      throw error;
    }
  }
  throw lastError;
}

type Aggregated = {
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
  diagnosis_cause: string | null;
  care_summary: string | null;
  watering_factors: string | null;
};

async function runTool(
  name: string,
  args: Record<string, unknown>,
  agg: Aggregated,
): Promise<unknown> {
  switch (name) {
    case "identify_plant": {
      const common = String(args.common_name ?? "");
      const scientific = String(args.scientific_name ?? "");
      agg.species_candidate = common || scientific || null;
      return {
        common_name: common,
        scientific_name: scientific,
        traits: String(args.traits ?? ""),
        note: "Species guess from model reasoning; confirm with get_care_data for real care data.",
      };
    }
    case "diagnose_symptoms": {
      const result = diagnoseSymptoms(String(args.symptoms ?? ""));
      agg.diagnosis_confidence = result.confidence;
      agg.diagnosis_cause = result.cause;
      return result;
    }
    case "get_care_data": {
      const common = String(args.species_common_name ?? "");
      const scientific = String(args.species_scientific_name ?? "");
      try {
        const confirmed = await confirmSpecies(common, scientific);
        if (!confirmed.matched) {
          agg.is_estimate = true;
          agg.care_summary =
            "No Perenual match; use typical care estimates for this plant type.";
          return {
            matched: false,
            is_estimate: true,
            estimated_base_days: 7,
            estimated_sunlight: "partial sun to full sun",
            estimated_soil: "well-draining loamy soil",
          };
        }
        const care = await getCareData(confirmed.id);
        const baseDays = care.baseDays ?? 7;
        if (care.baseDays == null) {
          agg.is_estimate = true;
        }
        agg.species_candidate =
          confirmed.commonName ||
          confirmed.scientificName ||
          agg.species_candidate;
        agg.care_summary = `watering=${care.wateringCategory ?? "unknown"}, baseDays=${baseDays}, sunlight=${care.sunlight.join(", ") || "unknown"}, soil=${care.soil.join(", ") || "unknown"}`;
        return {
          matched: true,
          is_estimate: care.baseDays == null,
          id: confirmed.id,
          common_name: confirmed.commonName,
          scientific_name: confirmed.scientificName,
          watering_category: care.wateringCategory,
          base_days: baseDays,
          sunlight: care.sunlight,
          soil: care.soil,
        };
      } catch (err) {
        agg.is_estimate = true;
        return {
          matched: false,
          is_estimate: true,
          error: err instanceof Error ? err.message : "Perenual lookup failed",
          estimated_base_days: 7,
        };
      }
    }
    case "calculate_watering": {
      const baseDays = Number(args.base_days);
      const soilType = String(args.soil_type ?? "loamy");
      const tempC = Number(args.temp_c ?? 20);
      const result = calculateWatering(
        Number.isFinite(baseDays) ? baseDays : 7,
        soilType,
        Number.isFinite(tempC) ? tempC : 20,
      );
      agg.watering_days = result.intervalDays;
      agg.watering_factors = `soil=${result.soilType} (x${result.soilMultiplier}), temp=${result.tempC}C (x${result.climateMultiplier})`;
      return result;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function runAssistant(
  transcript: string,
): Promise<AssistantPayload> {
  const ai = getClient();
  const agg: Aggregated = {
    species_candidate: null,
    watering_days: null,
    is_estimate: false,
    diagnosis_confidence: "none",
    diagnosis_cause: null,
    care_summary: null,
    watering_factors: null,
  };

  const contents: Content[] = [
    {
      role: "user",
      parts: [{ text: transcript }],
    },
  ];

  const requestConfig = {
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: tools }],
  };

  let response;
  try {
    response = await generateWithRetry(
      ai,
      { model: TEXT_MODEL, contents, config: requestConfig },
      "initial call",
    );
  } catch (error) {
    throw error; // Re-thrown so the route handler returns a clean fallback
  }

  // Function-calling loop (cap rounds to avoid runaway)
  for (let round = 0; round < 6; round++) {
    const calls = response.functionCalls ?? [];
    if (calls.length === 0) break;

    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    contents.push({ role: "model", parts: candidateParts });

    const functionResponses: Part[] = [];
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      try {
        const toolResult = await runTool(call.name ?? "", args, agg);
        functionResponses.push({
          functionResponse: {
            name: call.name ?? "",
            response: toolResult as Record<string, unknown>,
          },
        });
      } catch (toolError) {
        console.error(`Error running tool '${call.name}':`, toolError);
        functionResponses.push({
          functionResponse: {
            name: call.name ?? "",
            response: {
              error: `Tool execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
            },
          },
        });
      }
    }

    contents.push({ role: "user", parts: functionResponses });
    try {
      response = await generateWithRetry(
        ai,
        { model: TEXT_MODEL, contents, config: requestConfig },
        `tool round ${round + 1} followup`,
      );
    } catch (error) {
      throw error;
    }
  }

  // The system prompt already instructs the model to produce the final
  // 2-3 sentence plain-text spoken reply once it has no more tool calls
  // to make, so the last response's own text IS the final answer - no
  // separate phrasing call needed. This halves the Gemini requests used
  // per interaction versus making an extra dedicated "write the reply"
  // call, which matters a lot on a 20-requests/day free tier.
  let text = response.text ?? "";

  if (!text.trim()) {
    text = buildFallbackSpeech(agg);
  }

  return {
    response_text: stripMarkdown(text),
    species_candidate: agg.species_candidate,
    watering_days: agg.watering_days,
    is_estimate: agg.is_estimate,
    diagnosis_confidence: agg.diagnosis_confidence,
  };
}

function buildFallbackSpeech(agg: Aggregated): string {
  const bits: string[] = [];
  if (agg.species_candidate) {
    bits.push(`This sounds like ${agg.species_candidate}.`);
  }
  if (agg.diagnosis_cause && agg.diagnosis_confidence !== "none") {
    if (agg.diagnosis_confidence === "low") {
      bits.push(`This could suggest ${agg.diagnosis_cause}.`);
    } else {
      bits.push(`The symptoms point to ${agg.diagnosis_cause}.`);
    }
  } else if (agg.diagnosis_confidence === "none" && !agg.species_candidate) {
    bits.push(
      "I could not identify a specific plant issue from that description.",
    );
  }
  if (agg.watering_days != null) {
    if (agg.is_estimate) {
      bits.push(
        `Based on typical care for this type of plant, water about every ${agg.watering_days} days.`,
      );
    } else {
      bits.push(`Water about every ${agg.watering_days} days.`);
    }
  }
  if (bits.length === 0) {
    return "I could not process that clearly. Please try describing the plant again.";
  }
  return bits.slice(0, 3).join(" ");
}
