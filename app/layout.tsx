import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://planaround.vercel.app/"),
  title: "PlanAround",
  description: "Fit assignments around your actual week.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: "PlanAround",
    description: "Fit assignments around your actual week.",
    url: "https://planaround.vercel.app/",
    siteName: "PlanAround",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a6f44",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
