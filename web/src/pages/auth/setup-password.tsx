import { env } from "@/src/env.mjs";
import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";
import { type GetServerSideProps } from "next";

type PageProps = {
  passwordResetAvailable: boolean;
  initialEmail: string;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  query,
}) => {
  return {
    props: {
      passwordResetAvailable:
        env.SMTP_CONNECTION_URL !== undefined &&
        env.EMAIL_FROM_ADDRESS !== undefined,
      initialEmail: typeof query.email === "string" ? query.email : "",
    },
  };
};

const Page = ({ passwordResetAvailable, initialEmail }: PageProps) => {
  return (
    <ResetPasswordPage
      passwordResetAvailable={passwordResetAvailable}
      initialEmail={initialEmail}
      intent="setup"
    />
  );
};

export default Page;
