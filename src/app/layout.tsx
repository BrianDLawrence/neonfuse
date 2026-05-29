import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Fuse",
  description: "A neon arcade bomber arena prototype."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
