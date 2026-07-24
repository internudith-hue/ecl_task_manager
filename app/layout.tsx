import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import { AuthProvider } from "@/hooks/useAuth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Capacity — Task tracker",
    template: "%s | Capacity",
  },
  description:
    "A private, real-time task queue that turns estimates into realistic delivery dates.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8f5fa",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <FirebaseAnalytics />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
