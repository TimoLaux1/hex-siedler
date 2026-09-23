import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "New Katan – Strategiespiel",
  description: "Ein eigenständiger Prototyp für ein webbasiertes Hex-Strategiespiel.",
  manifest: "/manifest.webmanifest?v=4",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "New Katan",
  },
  icons: {
    icon: [
      { url: "/new-katan-icon-192-v3.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/new-katan-icon-512-v3.png?v=4", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/new-katan-apple-v3.png?v=4", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f2e7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
