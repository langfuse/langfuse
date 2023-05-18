// Main layout file with chakra ui, top navbar and side menu

import { PropsWithChildren } from "react";
import { useRouter } from "next/router";
import { Grid, GridItem } from "@chakra-ui/react";

import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";

const noLayoutPaths: string[] = [];

export const Layout = ({ children }: PropsWithChildren) => {
  const router = useRouter();

  if (noLayoutPaths.includes(router.pathname)) return <>{children}</>;
  else
    return (
      <Grid
        templateAreas={`"nav header"
                  "nav main"
                  "nav footer"`}
        gridTemplateRows={"50px 1fr 30px"}
        gridTemplateColumns={"300px 1fr"}
        minH="100vh"
      >
        <GridItem area={"header"} borderBottom="1px" borderColor={"#232323"}>
          <Navbar />
        </GridItem>
        <GridItem area={"nav"} borderRight="1px" borderColor={"#232323"}>
          <Sidebar />
        </GridItem>
        <GridItem area={"main"} p={5}>
          {children}
        </GridItem>
        <GridItem area={"footer"}>Brent 2023</GridItem>
      </Grid>
    );
};
