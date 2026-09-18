import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { SCRIPT_TEMA } from "@/components/tema";
import "./globals.css";

/**
 * The display face, and the only thing it is used for is the title in the
 * header.
 *
 * One weight — 600 — because that is the only one drawn. Fraunces is a
 * variable font and asking for the whole range would ship several times the
 * bytes for a single line of text.
 */
const display = Fraunces({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  variable: "--fuente-display",
});

export const metadata: Metadata = {
  title: "Tu Terapia · Marketing",
  description: "Dashboard de marketing",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
