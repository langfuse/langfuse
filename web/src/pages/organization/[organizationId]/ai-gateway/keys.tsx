import { AiGatewayPage } from "@/src/features/ai-gateway/components/AiGatewayPage/AiGatewayPage";
import { getAiGatewayServerSideProps } from "@/src/features/ai-gateway/server/getAiGatewayServerSideProps";

export default function AiGatewayKeysRoute() {
  return <AiGatewayPage slug="keys" />;
}

export const getServerSideProps = getAiGatewayServerSideProps("keys");
