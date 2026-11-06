import { AiGatewayPage } from "@/src/features/ai-gateway/components/AiGatewayPage/AiGatewayPage";
import { getAiGatewayServerSideProps } from "@/src/features/ai-gateway/server/getAiGatewayServerSideProps";

export default function AiGatewaySetupRoute() {
  return <AiGatewayPage slug="setup" />;
}

export const getServerSideProps = getAiGatewayServerSideProps("setup");
