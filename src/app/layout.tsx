import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glimpsapp Admin",
  description: "Glimpsapp Admin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
