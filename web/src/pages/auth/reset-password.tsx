import { env } from "@/src/env.mjs";
import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";
import { type GetServerSideProps } from "next";

type PageProps = {
  passwordResetAvailable: boolean;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  return {
    props: {
      passwordResetAvailable:
        env.SMTP_CONNECTION_URL !== undefined &&
        env.EMAIL_FROM_ADDRESS !== undefined,
    },
  };
};

const Page = ({ passwordResetAvailable }: PageProps) => {
  return <ResetPasswordPage passwordResetAvailable={passwordResetAvailable} />;
};

export default Page;
