import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Ads Manager — Digital Marketing Dashboard",
  description: "Monitor ads, content plan, WA leads, blast, Google review & influencer dalam satu dashboard dengan insight otomatis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${font.variable} antialiased`}>{children}</body>
    </html>
  );
}
