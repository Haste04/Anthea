export const profileQuestions = [
  {
    key: "experience",
    title: "How familiar are you with caring for plants?",
    hint: "There’s no wrong answer. We’ll grow from here.",
    options: [
      { value: "beginner", label: "Just starting", detail: "A little guidance would be lovely.", icon: "01" },
      { value: "some", label: "Some experience", detail: "I know a few things, but still have questions.", icon: "02" },
      { value: "confident", label: "Very comfortable", detail: "Let’s get into the details.", icon: "03" },
    ],
  },
  {
    key: "space",
    title: "Where do your plants usually grow?",
    hint: "This gives me a starting point for your care questions.",
    options: [
      { value: "indoors", label: "Indoors", detail: "Windowsills, shelves, and cozy corners.", icon: "01" },
      { value: "outdoors", label: "Outdoors", detail: "A garden, patio, or balcony.", icon: "02" },
      { value: "both", label: "A little of both", detail: "Green spaces inside and out.", icon: "03" },
      { value: "first", label: "Getting my first plant", detail: "My plant journey starts here.", icon: "04" },
    ],
  },
  {
    key: "goal",
    title: "What would you like help with first?",
    hint: "Pick one to start. You can ask about anything later.",
    options: [
      { value: "identify", label: "Identifying a plant", detail: "Let’s figure out what’s growing.", icon: "01" },
      { value: "symptoms", label: "Understanding symptoms", detail: "Something looks different or not quite right.", icon: "02" },
      { value: "care", label: "Watering and care", detail: "Help me find a good routine.", icon: "03" },
      { value: "explore", label: "Just exploring", detail: "I’m here to learn something new.", icon: "04" },
    ],
  },
] as const;

export type PlantProfile = {
  experience: "beginner" | "some" | "confident";
  space: "indoors" | "outdoors" | "both" | "first";
  goal: "identify" | "symptoms" | "care" | "explore";
};

export function parsePlantProfile(value: unknown): PlantProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const question of profileQuestions) {
    if (!question.options.some((option) => option.value === record[question.key])) return null;
  }
  return {
    experience: record.experience as PlantProfile["experience"],
    space: record.space as PlantProfile["space"],
    goal: record.goal as PlantProfile["goal"],
  };
}

export const starterQuestions: Record<PlantProfile["goal"], string> = {
  identify: "I’d like to identify my plant. What details should I describe?",
  symptoms: "My plant doesn’t look healthy. What should I check first?",
  care: "Can you help me work out a watering routine for my plant?",
  explore: "I’d like to learn about plant care. Where should I start?",
};

export function profileContext(profile: PlantProfile): string {
  const preferences = profileQuestions.map((question) =>
    `${question.key}: ${question.options.find((option) => option.value === profile[question.key])?.label}`,
  ).join("; ");
  return `\nUser preferences: ${preferences}. Adapt your explanation to their experience. These are general preferences, not facts about the plant currently being discussed. The current question takes priority over the initial goal. Ask for missing plant-specific details rather than assuming light, soil, species, or watering needs.`;
}
