import type { Metadata } from "next";
import { NavigationProvider } from "@/components/navigation/NavigationProvider";
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
      <body>
        <NavigationProvider>{children}</NavigationProvider>
      </body>
    </html>
  );
}
