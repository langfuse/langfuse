import { env } from "@/src/env.mjs";
import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps<{
  passwordResetAvailable: boolean;
}> = async () => {
  return {
    props: {
      passwordResetAvailable:
        env.SMTP_CONNECTION_URL !== undefined &&
        env.EMAIL_FROM_ADDRESS !== undefined,
    },
  };
};
