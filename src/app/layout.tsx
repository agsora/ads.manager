import type { Metadata } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Ads Manager — Digital Marketing",
  description: "Monitor iklan, content plan, WA leads, blast, Google review & influencer dalam satu dashboard dengan insight otomatis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${body.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
