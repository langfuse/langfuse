import { getLandingServerSideProps } from "@/src/features/projects/server/getLandingServerSideProps";

export const getServerSideProps = getLandingServerSideProps;

/** Signed-in users are redirected server-side; signed-out users are sent to sign-in by the app layout. */
export default function Home() {
  return null;
}
