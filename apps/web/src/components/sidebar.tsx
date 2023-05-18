import Link from "next/link";
import { useRouter } from "next/router";
import { Button, HStack, Stack, Text } from "@chakra-ui/react";

const menuItems = [
  { name: "Repositories", path: "/repository" },
  { name: "All Jobs", path: "/repository/all" },
  { name: "Settings", path: "/settings" },
];

export function Sidebar() {
  const router = useRouter();
  return (
    <Stack p={2} pl={3}>
      <HStack>
        <Text fontSize={30}>Langfuse</Text>
      </HStack>
      <Stack pt={4}>
        {menuItems.map((item) => (
          <Button
            key={item.name}
            size="sm"
            as={Link}
            href={item.path}
            variant="outline"
            borderWidth={router.pathname === item.path ? "1" : "0"}
            borderColor={"#4b4b4b"}
          >
            {item.name}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
