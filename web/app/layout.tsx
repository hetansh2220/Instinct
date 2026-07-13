import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/components/solana/solanaProvider";
import { QueryProvider } from "@/components/query-provider";
import { Navbar } from "@/components/navbar";
import { ProfileGate } from "@/components/profile/profile-gate";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Instinct",
  description: "Pick a winner, watch it live, climb the leaderboard.",
  metadataBase: new URL("https://instinct-mu.vercel.app"),
  openGraph: {
    title: "Instinct",
    description: "Pick a winner, watch it live, climb the leaderboard.",
    url: "https://instinct-mu.vercel.app",
    siteName: "Instinct",
    images: [
      {
        url: "/img.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Instinct",
    description: "Pick a winner, watch it live, climb the leaderboard.",
    images: ["/img.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <SolanaProvider>
            <Navbar />
            {children}
            <ProfileGate />
          </SolanaProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
