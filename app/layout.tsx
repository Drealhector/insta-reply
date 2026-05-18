import "./globals.css";
import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { SideNav } from "@/components/SideNav";
import { ThemeProvider, themeBootScript } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "InstaReply",
  description: "Auto-DM Instagram commenters with post-aware, personalised replies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before hydration to avoid light-mode flash on dark-preferring users */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ConvexClientProvider>
            <div className="min-h-screen flex bg-bg">
              <SideNav />
              <main className="flex-1 min-w-0">
                <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
              </main>
            </div>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
