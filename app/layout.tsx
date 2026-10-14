import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import BottomNav from "@/components/BottomNav";
import MetaPixel from "@/components/MetaPixel";
import MetaPixelPageViews from "@/components/MetaPixelPageViews";
import { AuthProvider } from "@/lib/auth";
import { PricingProvider } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = "CBT-Practice";
const APP_TITLE = "CBT-Practice — JAMB, WAEC & POST UTME Practice";
const APP_DESCRIPTION =
  "Offline-first past questions practice for Nigerian students preparing for JAMB, WAEC and POST UTME exams.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: {
    default: APP_TITLE,
    template: `%s — ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1e48",
  // Required for `env(safe-area-inset-*)` to resolve on iOS: without
  // `viewport-fit=cover` the safe-area values are always 0 and the fixed tab
  // bar would sit under the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {/* Meta Pixel: the base code goes into the document <head> and reports
            the first PageView; the tracker island reports the client-side
            navigations the head script cannot see. Both render nothing when the
            pixel is switched off. */}
        <MetaPixel />
        <MetaPixelPageViews />
        <RegisterSW />
        <AuthProvider>
          <PricingProvider>
            {/* `pb-nav` reserves room for the fixed tab bar on phones; the
                wrapper keeps the pages' own `flex-1` layout intact. */}
            <div className="flex flex-1 flex-col pb-nav md:pb-0">{children}</div>
            <BottomNav />
          </PricingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

