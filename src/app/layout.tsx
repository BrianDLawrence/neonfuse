import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Overdrive type: Chakra Petch for labels, numbers and headings; IBM Plex Sans for body copy.
// Both are self-hosted (latin subset, SIL OFL; licenses in ./fonts), so the build never
// depends on fetching from Google Fonts.
const displayFont = localFont({
  src: [
    { path: "./fonts/chakra-petch-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/chakra-petch-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/chakra-petch-latin-700-normal.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-chakra",
  display: "swap"
});

const bodyFont = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-plex",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Neon Fuse",
  description:
    "Neon arcade bomber battles on Discord. Drop fuses, chain blasts, and outlast rival bots or your friends in fast arena matches.",
  applicationName: "Neon Fuse"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${displayFont.variable} ${bodyFont.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
