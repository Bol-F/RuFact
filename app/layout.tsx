import type { Metadata, Viewport } from "next";
import { Caveat, Lora, Manrope } from "next/font/google";
import { FeedbackProvider } from "@/components/FeedbackProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import "./globals.css";
import "./shared-ui.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "RuFact",
  title: "RuFact — matn va manbalarni tekshirish",
  description:
    "O‘zbek, rus va ingliz tilidagi matnlarni internet manbalari bilan tekshirish uchun ta’limiy xizmat.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RuFact",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0b2b4b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz-Latn-UZ" data-locale="uz" data-theme="uz" data-scroll-behavior="smooth">
      <body
        className={`${lora.variable} ${manrope.variable} ${caveat.variable}`}
      >
        <LanguageProvider>
          <PreferencesProvider><FeedbackProvider>{children}</FeedbackProvider></PreferencesProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
