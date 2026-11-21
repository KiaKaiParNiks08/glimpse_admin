import type { Metadata } from "next";
import { NavigationProvider } from "@/components/navigation/NavigationProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glimpsapp Admin",
  description: "Enterprise SaaS Event Administration",
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('glimpse_admin_theme');
      var prefDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = (saved === 'dark' || saved === 'light') ? saved : (prefDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
