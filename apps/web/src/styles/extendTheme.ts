import { defineStyleConfig, extendTheme } from "@chakra-ui/react";

const Button = defineStyleConfig({
  // The styles all button have in common
  baseStyle: {},
  // Two sizes: sm and md
  sizes: {
    sm: {
      fontSize: "sm",
      px: 4, // <-- px is short for paddingLeft and paddingRight
      py: 3, // <-- py is short for paddingTop and paddingBottom
    },
    md: {
      fontSize: "md",
      px: 6, // <-- these values are tokens from the design system
      py: 4, // <-- these values are tokens from the design system
    },
  },
  // Two variants: outline and solid
  variants: {
    solid: {
      bg: "#4b4b4b",
      color: "white",
    },
    outline: {
      border: "1px solid",
      borderColor: "#4b4b4b",
      color: "white",
    },
  },
  // The default size and variant values
  defaultProps: {
    size: "md",
    variant: "outline",
  },
});

const themeOverrides = {
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  components: {
    Button,
  },
  styles: {
    global: {
      body: {
        backgroundColor: "#000000",
        textColor: "white",
      },
    },
  },
};

export const extendedTheme = extendTheme(themeOverrides);
