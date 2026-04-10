import type { GetServerSideProps } from "next";
import SpielwieseRoutePage from "@/src/features/spielwiese/pages/SpielwieseRoutePage";

type DevSpielwiesePageProps = {
  slug?: string[];
};

export function getDevSpielwieseRouteProps(
  rawSlug: string | string[] | undefined,
): DevSpielwiesePageProps {
  if (Array.isArray(rawSlug)) {
    return { slug: rawSlug };
  }

  if (typeof rawSlug === "string") {
    return { slug: [rawSlug] };
  }

  return {};
}

export const getServerSideProps: GetServerSideProps<
  DevSpielwiesePageProps
> = async ({ params }) => {
  const rawSlug = params?.slug;

  return {
    props: getDevSpielwieseRouteProps(rawSlug),
  };
};

export default function DevSpielwiesePage({ slug }: DevSpielwiesePageProps) {
  return <SpielwieseRoutePage slug={slug} />;
}
