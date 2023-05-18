import { Box, Container, Flex, Show, Spacer } from "@chakra-ui/react";

export const Navbar = () => {
  return (
    <Box pt={2} pb={2}>
      <Container maxW="100%">
        <Flex alignItems="center">
          <Show below="md"></Show>
          <Spacer />
        </Flex>
      </Container>
    </Box>
  );
};
