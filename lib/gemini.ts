import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
  type Content,
  type Part,
} from "@google/generative-ai";
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

const SYSTEM_PROMPT = `You are a hands-free plant voice assistant. The user speaks plant traits, symptoms, and care questions.

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
      type: SchemaType.OBJECT,
      properties: {
        traits: {
          type: SchemaType.STRING,
          description: "Physical traits described by the user",
        },
        common_name: {
          type: SchemaType.STRING,
          description: "Best-guess common name",
        },
        scientific_name: {
          type: SchemaType.STRING,
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
      type: SchemaType.OBJECT,
      properties: {
        symptoms: {
          type: SchemaType.STRING,
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
      type: SchemaType.OBJECT,
      properties: {
        species_common_name: { type: SchemaType.STRING },
        species_scientific_name: { type: SchemaType.STRING },
      },
      required: ["species_common_name", "species_scientific_name"],
    },
  },
  {
    name: "calculate_watering",
    description:
      "Calculate a watering interval in days from base days, soil type, and temperature Celsius.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        base_days: { type: SchemaType.NUMBER },
        soil_type: {
          type: SchemaType.STRING,
          description: "sandy, loamy, or clay",
        },
        temp_c: { type: SchemaType.NUMBER },
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

function getModel() {
  const genAI = new GoogleGenerativeAI(getApiKey());
  return genAI.getGenerativeModel({
    model: "gemini-3.8-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: tools }],
  });
}

function getSpeechModel() {
  const genAI = new GoogleGenerativeAI(getApiKey());
  return genAI.getGenerativeModel({
    model: "gemini-3.8-flash",
    systemInstruction:
      "You write short spoken replies for a plant assistant. Exactly 2-3 plain sentences. No markdown, asterisks, bullets, or lists.",
  });
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
  agg: Aggregated
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
          confirmed.commonName || confirmed.scientificName || agg.species_candidate;
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
        Number.isFinite(tempC) ? tempC : 20
      );
      agg.watering_days = result.intervalDays;
      agg.watering_factors = `soil=${result.soilType} (x${result.soilMultiplier}), temp=${result.tempC}C (x${result.climateMultiplier})`;
      return result;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function runAssistant(transcript: string): Promise<AssistantPayload> {
  const model = getModel();
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

  let result = await model.generateContent({ contents });
  let response = result.response;
  let usedTools = false;

  // Function-calling loop (cap rounds to avoid runaway)
  for (let round = 0; round < 6; round++) {
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) break;

    usedTools = true;
    contents.push({ role: "model", parts });

    const functionResponses: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const args = (fc.args ?? {}) as Record<string, unknown>;
      const toolResult = await runTool(fc.name, args, agg);
      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: toolResult as object,
        },
      });
    }

    contents.push({ role: "user", parts: functionResponses });
    result = await model.generateContent({ contents });
    response = result.response;
  }

  // Produce final spoken reply from structured facts (keeps phrasing natural)
  if (usedTools) {
    const facts = [
      `species_candidate: ${agg.species_candidate ?? "unknown"}`,
      `diagnosis_cause: ${agg.diagnosis_cause ?? "none"}`,
      `diagnosis_confidence: ${agg.diagnosis_confidence}`,
      `care_summary: ${agg.care_summary ?? "none"}`,
      `watering_days: ${agg.watering_days ?? "unknown"}`,
      `watering_factors: ${agg.watering_factors ?? "none"}`,
      `is_estimate: ${agg.is_estimate}`,
    ].join("\n");

    const spokenModel = getSpeechModel();
    const spoken = await spokenModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Using ONLY these structured facts, write the final spoken reply (2-3 plain sentences, no markdown, no lists):\n${facts}`,
            },
          ],
        },
      ],
    });
    response = spoken.response;
  }

  let text = "";
  try {
    text = response.text() ?? "";
  } catch {
    text = "";
  }

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
    bits.push("I could not identify a specific plant issue from that description.");
  }
  if (agg.watering_days != null) {
    if (agg.is_estimate) {
      bits.push(
        `Based on typical care for this type of plant, water about every ${agg.watering_days} days.`
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
