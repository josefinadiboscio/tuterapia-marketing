import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tu Terapia · Marketing",
  description: "Dashboard de marketing",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
