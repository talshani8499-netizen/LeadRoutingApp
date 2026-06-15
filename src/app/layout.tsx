import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteDesk — Lead Routing",
  description: "Route inbound leads to the right agent and connect the call instantly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
