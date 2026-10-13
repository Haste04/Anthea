import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./workspace.css";
import "./theme.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ThemeSync } from "./components/ThemeSettings";
import { WorkspaceProvider } from "./components/workspace/WorkspaceProvider";
import WorkspaceShell from "./components/workspace/WorkspaceShell";

// Keep fonts in the repo so builds do not depend on Google Fonts responses.
const brand = localFont({
  src: "./fonts/Fraunces.woff2",
  variable: "--font-brand",
  weight: "600 700",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const display = localFont({
  src: "./fonts/SourceSans3.woff2",
  variable: "--font-display",
  weight: "400 700",
  display: "swap",
});

// Manrope stays scoped to the preserved navigation and home care card.
const preservedFont = localFont({
  src: "./fonts/Manrope.woff2",
  variable: "--font-manrope",
  weight: "400 600",
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
