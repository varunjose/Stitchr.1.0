import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Stitchr — Build your business stack",
  description:
    "Describe your business. Explore the right tools, understand the costs, and choose your stack.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
