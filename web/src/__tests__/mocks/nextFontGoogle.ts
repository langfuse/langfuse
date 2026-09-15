/** vitest stand-in for `next/font/google`: the real module only works
    inside the Next build. Returns an inert font handle. */
export const IBM_Plex_Mono = () => ({
  className: "",
  variable: "",
  style: { fontFamily: "monospace" },
});
