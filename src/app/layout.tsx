import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Digi Biashara", description: "Business management for Kenyan businesses", icons: { icon: "https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_96/v1794349210/1793911899888.jpg", apple: "https://res.cloudinary.com/azrvy9ub/image/upload/f_auto,q_auto,w_180/v1794349210/1793911899888.jpg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
