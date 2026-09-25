import rules from "@/data/disease-rules.json";

export type DiseaseRule = {
  id: number;
  category: string;
  symptom: string;
  cause: string;
  confidence: string;
};

export type DiagnosisMatch = {
  cause: string;
  confidence: string;
  score: number;
  category: string;
  symptom: string;
};

export type DiagnosisResult = {
  cause: string | null;
  confidence: "none" | string;
  matches: DiagnosisMatch[];
};

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "with",
  "from",
  "is",
  "are",
  "it",
  "its",
  "my",
  "has",
  "have",
  "been",
  "leaf",
  "leaves",
  "plant",
  "plants",
  "soil",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

export function diagnoseSymptoms(symptoms: string): DiagnosisResult {
  const inputTokens = tokenize(symptoms);
  if (inputTokens.size === 0) {
    return { cause: null, confidence: "none", matches: [] };
  }

  const matches: DiagnosisMatch[] = [];

  for (const rule of rules as DiseaseRule[]) {
    const ruleTokens = tokenize(rule.symptom);
    let score = 0;
    for (const token of ruleTokens) {
      if (inputTokens.has(token)) score += 1;
    }
    if (score > 0) {
      matches.push({
        cause: rule.cause,
        confidence: rule.confidence,
        score,
        category: rule.category,
        symptom: rule.symptom,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return { cause: null, confidence: "none", matches: [] };
  }

  const top = matches[0];
  // Single weak keyword match -> treat as low for hedging
  const confidence =
    top.score === 1 ? "low" : top.confidence;

  return {
    cause: top.cause,
    confidence,
    matches,
  };
}
