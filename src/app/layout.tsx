import type { Metadata, Viewport } from "next";
import { Geist_Mono, Montserrat } from "next/font/google";
import { ThemeProvider } from "@/components/workspace/theme-provider";
import "./globals.css";

// The BeamX brand font, for all text (spec 0003, AC-16). The variable font covers every
// weight the design uses (400, 500, 600) in one file.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeamX Workspace",
  description:
    "Chat with an AI assistant that runs the right BeamX tool for you",
};

// Android Chrome shrinks the page above the on screen keyboard; the notch area is usable.
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      suppressHydrationWarning
      className={`${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
