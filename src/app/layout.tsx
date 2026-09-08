import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppChrome } from "@/components/AppChrome";
import { BASE_APP_ID, SITE_DESCRIPTION } from "@/lib/brand-copy";
import "./globals.css";

const onest = localFont({
  src: [
    {
      path: "../../public/fonts/Onest-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Onest-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/Onest-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/Onest-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-onest",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Wisp — Gift Coinbase stocks on Base",
  description: SITE_DESCRIPTION,
  referrer: "no-referrer",
  other: {
    "base:app_id": BASE_APP_ID,
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png" },
      { url: "/favicon-16x16.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={onest.variable}>
      <head>
        {/* Base.dev domain verification (App Router equivalent of next/head meta) */}
        <meta name="base:app_id" content={BASE_APP_ID} />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="font-sans antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
