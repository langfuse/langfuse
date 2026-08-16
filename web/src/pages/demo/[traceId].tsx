import { type GetServerSideProps } from "next";

import { getDemoRedirectServerSideProps } from "@/src/features/auth/lib/demoRedirect";

const DemoTraceRedirectPage = () => null;

export default DemoTraceRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (typeof ctx.params?.traceId !== "string") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return getDemoRedirectServerSideProps(ctx, {
    traceId: ctx.params.traceId,
  });
};
