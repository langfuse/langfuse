/** vitest stand-in for `next/font/google`: the real module only works
    inside the Next build. Every export returns an inert font object. */
type FontHandle = {
  className: string;
  variable: string;
  style: { fontFamily: string };
};

function fontStub(): FontHandle {
  return { className: "", variable: "", style: { fontFamily: "monospace" } };
}

export const IBM_Plex_Mono = fontStub;
export const JetBrains_Mono = fontStub;
export const Geist_Mono = fontStub;
