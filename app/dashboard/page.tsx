import type { Metadata } from "next";
import ChatDashboard from "./SavedChatDashboard";

export const metadata: Metadata = {
  title: "Plant-care Dashboard | Anthea",
  description: "Ask Anthea about your plant using text or voice.",
};

export default function DashboardPage() {
  return <ChatDashboard />;
}
