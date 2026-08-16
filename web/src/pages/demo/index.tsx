import { type GetServerSideProps } from "next";

import { getDemoRedirectServerSideProps } from "@/src/features/auth/lib/demoRedirect";

const DemoRedirectPage = () => null;

export default DemoRedirectPage;

export const getServerSideProps: GetServerSideProps = async (ctx) =>
  getDemoRedirectServerSideProps(ctx);
