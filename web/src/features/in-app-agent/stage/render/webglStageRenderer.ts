import {
  pinFullViewport,
  type StageRendererFactory,
} from "@/src/features/in-app-agent/stage/render/stageRenderer";

const VERTEX_SHADER = `#version 300 es
in vec2 aCorner;
uniform vec2 uViewport;
uniform vec4 uRect;
uniform float uExpand;
uniform float uTilt;
uniform float uPerspective;
out vec2 vLocal;

void main() {
  vec2 local = aCorner * (uRect.zw + 2.0 * uExpand) - uExpand;
  vLocal = local;
  vec2 point = uRect.xy + local;
  float centerY = uRect.y + uRect.w * 0.5;
  float offsetY = point.y - centerY;
  float y = centerY + offsetY * cos(uTilt);
  float depth = offsetY * sin(uTilt);
  vec2 ndc = vec2(point.x / uViewport.x * 2.0 - 1.0, 1.0 - y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0 + depth / uPerspective);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform sampler2D uTexture;
uniform vec4 uRect;
uniform float uRadius;
uniform float uBias;
uniform float uDim;
uniform float uShadow;
uniform float uShadowBlur;
uniform float uShadowOffset;
uniform int uPass;
out vec4 outColor;

float roundedBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 halfSize = uRect.zw * 0.5;
  vec2 point = vLocal - halfSize;
  float radius = min(uRadius, min(halfSize.x, halfSize.y));

  if (uPass == 0) {
    float distance = roundedBox(point - vec2(0.0, uShadowOffset), halfSize, radius);
    float alpha = (1.0 - smoothstep(-uShadowBlur, uShadowBlur, distance)) * uShadow;
    outColor = vec4(0.0, 0.0, 0.0, alpha);
    return;
  }

  float distance = roundedBox(point, halfSize, radius);
  float edge = max(fwidth(distance), 1e-4) * 0.5;
  float coverage = 1.0 - smoothstep(-edge, edge, distance);
  vec3 color = texture(uTexture, vLocal / uRect.zw, uBias).rgb * (1.0 - uDim);
  outColor = vec4(color * coverage, coverage);
}`;

/** Perspective distance in CSS px; larger is flatter. */
const PERSPECTIVE_PX = 1800;
/** Mip bias at the deepest point of the flight; ~1 halves the resolution. */
const MAX_BLUR_BIAS = 0.45;
const SHADOW_ALPHA = 0.22;
const SHADOW_MAX_COVERAGE = 0.85;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Draws the capture as one textured quad on a full-viewport canvas whose
 * backing store matches the capture's pixel ratio, so the first frame is a
 * texel-for-pixel copy of the page. Returns null when WebGL 2 is unavailable
 * or the texture exceeds the GPU's limit, so the caller can fall back.
 */
/** A texture beyond the canvas resolution only costs upload and mipmap time. */
function downscaleToCanvasSize(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
) {
  if (source.width <= target.width) {
    return source;
  }
  const scaled = document.createElement("canvas");
  scaled.width = target.width;
  scaled.height = target.height;
  const context = scaled.getContext("2d");
  if (!context) {
    return source;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled;
}

let cachedIsSoftwareRendered: boolean | undefined;

/**
 * Whether WebGL here runs on the CPU (SwiftShader, llvmpipe). Shading a
 * full-viewport quad at device resolution is slow there, so the renderer
 * draws at CSS resolution instead.
 */
function isSoftwareRendered() {
  if (cachedIsSoftwareRendered === undefined) {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
    });
    cachedIsSoftwareRendered = gl === null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return cachedIsSoftwareRendered;
}

export const createWebGlStageRenderer: StageRendererFactory = ({
  capture,
  onContextLost,
}) => {
  const isSoftware = isSoftwareRendered();
  const canvas = document.createElement("canvas");
  canvas.width = isSoftware ? capture.cssWidth : capture.canvas.width;
  canvas.height = isSoftware ? capture.cssHeight : capture.canvas.height;
  pinFullViewport(canvas);

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (
    capture.canvas.width > maxTextureSize ||
    capture.canvas.height > maxTextureSize
  ) {
    return null;
  }

  const program = link(gl);
  if (!program) {
    return null;
  }

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const cornerLocation = gl.getAttribLocation(program, "aCorner");
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  gl.enableVertexAttribArray(cornerLocation);
  gl.vertexAttribPointer(cornerLocation, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    isSoftware ? downscaleToCanvasSize(capture.canvas, canvas) : capture.canvas,
  );
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const anisotropy = isSoftware
    ? null
    : gl.getExtension("EXT_texture_filter_anisotropic");
  if (anisotropy) {
    gl.texParameterf(
      gl.TEXTURE_2D,
      anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(
        4,
        gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number,
      ),
    );
  }

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    viewport: uniform("uViewport"),
    rect: uniform("uRect"),
    expand: uniform("uExpand"),
    tilt: uniform("uTilt"),
    perspective: uniform("uPerspective"),
    texture: uniform("uTexture"),
    radius: uniform("uRadius"),
    bias: uniform("uBias"),
    dim: uniform("uDim"),
    shadow: uniform("uShadow"),
    shadowBlur: uniform("uShadowBlur"),
    shadowOffset: uniform("uShadowOffset"),
    pass: uniform("uPass"),
  };

  gl.useProgram(program);
  gl.uniform1i(uniforms.texture, 0);
  gl.uniform1f(uniforms.perspective, PERSPECTIVE_PX);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, canvas.width, canvas.height);

  return {
    kind: "webgl",
    element: canvas,
    render(frame) {
      if (gl.isContextLost()) {
        return;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.viewport, capture.cssWidth, capture.cssHeight);
      gl.uniform4f(
        uniforms.rect,
        frame.rect.x,
        frame.rect.y,
        frame.rect.width,
        frame.rect.height,
      );
      gl.uniform1f(uniforms.tilt, frame.tilt);
      gl.uniform1f(uniforms.radius, frame.radius);

      // While the page still covers most of the screen its shadow falls
      // offscreen; skipping the pass saves a full-viewport fill.
      if (
        frame.shadow > 0.001 &&
        frame.rect.width < capture.cssWidth * SHADOW_MAX_COVERAGE
      ) {
        const blur = 8 + 28 * frame.shadow;
        gl.uniform1i(uniforms.pass, 0);
        gl.uniform1f(uniforms.expand, blur * 2);
        gl.uniform1f(uniforms.shadow, SHADOW_ALPHA * frame.shadow);
        gl.uniform1f(uniforms.shadowBlur, blur);
        gl.uniform1f(uniforms.shadowOffset, 12 * frame.shadow);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.uniform1i(uniforms.pass, 1);
      gl.uniform1f(uniforms.expand, 0);
      gl.uniform1f(uniforms.bias, MAX_BLUR_BIAS * frame.blur);
      gl.uniform1f(uniforms.dim, frame.dim);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      if (!gl.isContextLost()) {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vertexArray);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    },
  };
};
