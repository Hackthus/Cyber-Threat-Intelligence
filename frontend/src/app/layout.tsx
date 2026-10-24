
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNavigation from "../components/AppNavigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cyber Threat Intelligence",
    template: "%s | Cyber Threat Intelligence",
  },
  description:
    "Plateforme communautaire de Cyber Threat Intelligence pour rechercher, documenter et signaler des indicateurs de compromission.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
