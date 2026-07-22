import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Docket",
    default: "Docket - Controlled Document Approval System",
  },
  description:
    "A correctness-first document approval workflow — every status change is atomic, every action is audited, and the state machine is enforced on the server.",
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
