import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { GlimmProvider } from "glimm/next";
import { AppChrome } from "@/components/AppChrome";
import { Providers } from "@/components/Providers";
import { BASE_APP_ID, SITE_DESCRIPTION } from "@/lib/brand-copy";
import { BRAND_GLIMM_SWEEP } from "@/lib/glimmBrand";
import "./globals.css";

/** Self-hosted by Next — preloaded, swap so first paint never waits on the font. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Wisp — Gift test stocks on Base",
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
    <html lang="en" className={spaceGrotesk.variable}>
      <head>
        <meta name="base:app_id" content={BASE_APP_ID} />
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className={`${spaceGrotesk.className} antialiased`}>
        <GlimmProvider {...BRAND_GLIMM_SWEEP}>
          <Providers>
            <AppChrome>{children}</AppChrome>
          </Providers>
        </GlimmProvider>
      </body>
    </html>
  );
}
