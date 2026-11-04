import { AiGatewayPage } from "@/src/features/ai-gateway/components/AiGatewayPage/AiGatewayPage";
import { getAiGatewayServerSideProps } from "@/src/features/ai-gateway/server/getAiGatewayServerSideProps";

export default function AiGatewayModelsRoute() {
  return <AiGatewayPage slug="models" />;
}

export const getServerSideProps = getAiGatewayServerSideProps("models");
