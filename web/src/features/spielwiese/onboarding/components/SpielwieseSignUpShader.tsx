import { Blob, GlassTiles, Shader, Swirl } from "shaders/react";

const shaderMaskId = "spielwiese-sign-up-shader-blob";
const baseSwirlShaderId = "spielwieseSignUpBaseSwirl";
const glassTilesShaderId = "spielwieseSignUpGlassTiles";
const glassSwirlShaderId = "spielwieseSignUpGlassSwirl";

type SpielwieseSignUpShaderProps = {
  paused?: boolean;
};

export default function SpielwieseSignUpShader({
  paused = false,
}: SpielwieseSignUpShaderProps) {
  const glassTileIntensity = paused
    ? 0
    : {
        type: "mouse" as const,
        axis: "x" as const,
        outputMin: 0,
        outputMax: 10,
      };

  return (
    <Shader
      aria-hidden="true"
      className="size-full rounded-[2rem]"
      disableTelemetry
    >
      <Swirl
        colorA="#ffffff"
        colorB="#ffffff"
        id={baseSwirlShaderId}
        speed={paused ? 0 : 0.8}
      />
      <GlassTiles
        id={glassTilesShaderId}
        intensity={glassTileIntensity}
        maskSource={shaderMaskId}
        rotation={30}
        roundness={1}
      >
        <Swirl
          blend={8}
          colorA="#ffffffb0"
          colorB="#8300ef"
          colorSpace="oklch"
          detail={3.7}
          id={glassSwirlShaderId}
          speed={paused ? 0 : 0.8}
        />
      </GlassTiles>
      <Blob
        center={{ x: 0.35, y: 0.28 }}
        deformation={1.5}
        highlightIntensity={0}
        highlightX={-1}
        highlightY={-1}
        highlightZ={-1}
        id={shaderMaskId}
        size={0.75}
        softness={1.2}
        speed={paused ? 0 : 0.6}
        visible={false}
      />
    </Shader>
  );
}
