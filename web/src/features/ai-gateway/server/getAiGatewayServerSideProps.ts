import { type GetServerSideProps } from "next";
import { prisma } from "@langfuse/shared/src/db";

import { getGatewaySetupRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";
import { type AiGatewayPageSlug } from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";
import { getServerAuthSession } from "@/src/server/auth";

export const getAiGatewayServerSideProps =
  (slug: AiGatewayPageSlug): GetServerSideProps =>
  async (ctx) => {
    const organizationId = ctx.params?.organizationId;
    if (typeof organizationId !== "string") return { props: {} };

    const session = await getServerAuthSession({ req: ctx.req, res: ctx.res });
    const destination = await getGatewaySetupRedirect({
      prisma,
      session,
      organizationId,
      slug,
    });
    return destination
      ? { redirect: { destination, permanent: false } }
      : { props: {} };
  };
