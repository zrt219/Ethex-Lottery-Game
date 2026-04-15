import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono"
});

export const metadata: Metadata = {
  title: "Ethex Lottery Assessment UI",
  description:
    "Reviewer-focused XRPL EVM Testnet dashboard for the modernized Ethex lottery technical assessment."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-transparent font-[var(--font-manrope)] text-mist antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
