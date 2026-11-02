import { OrganizationProjectOverview } from "@/src/features/organizations/components/OrganizationProjectOverview";

export { redirectGatewayOnlyLanding as getServerSideProps } from "@/src/features/organizations/server/redirectGatewayOnlyLanding";

export default function Home() {
  return <OrganizationProjectOverview />;
}
