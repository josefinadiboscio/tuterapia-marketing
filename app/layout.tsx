import type { Metadata } from "next";
import { SCRIPT_TEMA } from "@/components/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tu Terapia · Marketing",
  description: "Dashboard de marketing",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
