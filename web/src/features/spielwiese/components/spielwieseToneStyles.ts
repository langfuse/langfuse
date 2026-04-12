function wrapHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function getOklchColorString({
  chroma,
  hue,
  lightness,
}: {
  chroma: number;
  hue: number;
  lightness: number;
}) {
  return `oklch(${(lightness * 100).toFixed(3)}% ${chroma.toFixed(6)} ${wrapHue(
    hue,
  ).toFixed(3)})`;
}

const baseSpielwieseFillOklch = {
  chroma: 0.024493,
  hue: 265.591,
  lightness: 0.948129,
};

const baseSpielwieseSurfaceOklch = {
  chroma: 0.0155,
  hue: 265.591,
  lightness: 0.969,
};

const baseSpielwieseShellOklch = {
  chroma: 0.0085,
  hue: 265.591,
  lightness: 0.982,
};

const baseSpielwieseAccentOklch = {
  chroma: 0.175166,
  hue: 261.143,
  lightness: 0.497467,
};

const spielwieseHueStep = 47;

export function getSpielwieseToneStyles(index: number) {
  const hueShift = index * spielwieseHueStep;

  return {
    accent: getOklchColorString({
      ...baseSpielwieseAccentOklch,
      hue: baseSpielwieseAccentOklch.hue + hueShift,
    }),
    fill: getOklchColorString({
      ...baseSpielwieseFillOklch,
      hue: baseSpielwieseFillOklch.hue + hueShift,
    }),
    shellFill: getOklchColorString({
      ...baseSpielwieseShellOklch,
      hue: baseSpielwieseShellOklch.hue + hueShift,
    }),
    surfaceFill: getOklchColorString({
      ...baseSpielwieseSurfaceOklch,
      hue: baseSpielwieseSurfaceOklch.hue + hueShift,
    }),
  };
}
