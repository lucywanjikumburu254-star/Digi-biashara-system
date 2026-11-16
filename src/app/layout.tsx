import type { Metadata, Viewport } from "next";
import PwaRuntime from "@/components/pwa-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digi Biashara",
  description: "Business management for Kenyan businesses",
  applicationName: "Digi Biashara",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Digi Biashara",
    statusBarStyle: "default",
  },
  icons: {
    icon: "https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_96/v1794349210/1793911899888.jpg",
    apple: "https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_180/v1794349210/1793911899888.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#870b35",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
