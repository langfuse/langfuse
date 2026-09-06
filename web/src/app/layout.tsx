import { DEFAULT_LOCALE } from "@/src/features/i18n/config";

export const metadata = {
  title: "Langfuse",
  description: "Langfuse",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>{children}</body>
    </html>
  );
}
