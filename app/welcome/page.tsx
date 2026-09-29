import type { Metadata } from "next";
import WelcomeFlow from "./WelcomeFlow";

export const metadata: Metadata = {
  title: "Meet Cactea | Anthea",
  description: "Meet your AI plant-care voice assistant and personalize your guidance in three quick questions.",
};

export default function WelcomePage() {
  return <WelcomeFlow />;
}
