import { AiGatewayPage } from "@/src/features/ai-gateway/components/AiGatewayPage/AiGatewayPage";
import { getAiGatewayServerSideProps } from "@/src/features/ai-gateway/server/getAiGatewayServerSideProps";

export default function AiGatewayAnalyticsRoute() {
  return <AiGatewayPage slug="analytics" />;
}

export const getServerSideProps = getAiGatewayServerSideProps("analytics");
