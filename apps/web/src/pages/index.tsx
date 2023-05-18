import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";

function Courses() {
  return (
    <>
      <Container maxW={"3xl"}>
        <Stack
          as={Box}
          textAlign={"center"}
          spacing={{ base: 8, md: 14 }}
          py={{ base: 20, md: 36 }}
        >
          <Heading
            fontWeight={600}
            fontSize={{ base: "2xl", sm: "4xl", md: "6xl" }}
            lineHeight={"110%"}
          >
            Productionise your LLM applications
          </Heading>
          <Text maxW={"3xl"}>Clemens Rawert, Marc Klingen, Max Deichmann</Text>
        </Stack>
      </Container>
    </>
  );
}

export default Courses;
