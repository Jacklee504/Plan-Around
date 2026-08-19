import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://planaround.vercel.app/"),
  title: "PlanAround",
  description: "Fit assignments around your actual week.",
  openGraph: {
    title: "PlanAround",
    description: "Fit assignments around your actual week.",
    url: "https://planaround.vercel.app/",
    siteName: "PlanAround",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
