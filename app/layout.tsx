import type { Metadata } from "next";
import { Fraunces, Manrope, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import "./theme.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ThemeSync } from "./components/ThemeSettings";
import { WorkspaceProvider } from "./components/workspace/WorkspaceProvider";
import WorkspaceShell from "./components/workspace/WorkspaceShell";

const brand = Fraunces({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const display = Source_Sans_3({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// Manrope stays scoped to the preserved navigation and home care card.
const preservedFont = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anthea — Plant Voice Assistant",
  description:
    "Hands-free plant identification, symptom diagnosis, and watering guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${brand.variable} ${display.variable} ${preservedFont.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body className="min-h-full flex flex-col"><ThemeSync /><WorkspaceProvider><WorkspaceShell>{children}</WorkspaceShell></WorkspaceProvider></body>
    </html>
  );
}
