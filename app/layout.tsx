import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// the display face for big headlines: wide, geometric, a little futuristic
const unbounded = Unbounded({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Akash · Full-stack developer building AI products",
  description: "Meet Akash, a full-stack developer building AI products, introduced by D.I.K.S.H.A, the voice AI he built.",
  openGraph: {
    title: "Akash · Full-stack developer building AI products",
    description: "A portfolio guided by D.I.K.S.H.A, the voice AI Akash built.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
