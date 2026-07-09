import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import BadgePopupHost from "../lib/badges/BadgePopupHost";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlow = Barlow_Condensed({
  weight: ["400", "600", "700", "800"],
  variable: "--font-barlow",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Draft Prime",
  description: "Draft Prime fantasy football",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <BadgePopupHost />
      </body>
    </html>
  );
}
