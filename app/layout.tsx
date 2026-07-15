import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { UserSync } from "@/components/auth/UserSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseBuild — Command Center",
  description: "Reactive construction operations agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full flex flex-col">
          <UserSync />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
