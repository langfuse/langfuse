import { FC, PropsWithChildren, useEffect } from "react";
import type { AppType } from "next/app";
import { ChakraProvider, useColorMode } from "@chakra-ui/react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { api } from "~/utils/api";
import { Layout } from "~/components/layout";
import { extendedTheme } from "~/styles/extendTheme";

const App: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const { colorMode, toggleColorMode } = useColorMode();

  //toggle color mode to dark if light mode is still stored in local storage
  useEffect(() => {
    if (colorMode === "light") {
      toggleColorMode();
    }
  }, [colorMode, toggleColorMode]);

  return (
    <ChakraProvider theme={extendedTheme}>
      <SessionProvider session={session}>
        <TrackLogin>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </TrackLogin>
      </SessionProvider>
    </ChakraProvider>
  );
};

export default api.withTRPC(App);

const TrackLogin: FC<PropsWithChildren> = (props) => {
  return <>{props.children}</>;
};
