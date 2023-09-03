import type { Metadata } from "next/types";

export async function generateMetadata({
  params: { lang },
}: {
  params: { lang: Locale };
}): Promise<Metadata> {
  return {
    // description: framework.description,
    title: "News Prisma",
    authors: { name: "General Intelligence Group" },
  };
}

export default async function Root({
  children,
  params,
  searchParams,
}: {
  children: React.ReactNode;
  params: { lang: Locale; gisId: string; chatId: string };
  searchParams?: Record<string, string>;
}) {
  const { lang } = params;
  console.log("searchParams: ", searchParams);
  return (
    <div className="h-screen flex flex-col pb-24">
      Search Layout
      <div className="w-full flex-1">{children}</div>;
    </div>
  );
}
