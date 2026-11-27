// Embeds the WebAssembly module in the Node.js bindings. wasm-bindgen's loader
// reads the module from `${__dirname}`, which bundlers such as Next.js rewrite to
// a build-time path, so the bindings would fail to load once bundled.
import { readFileSync, writeFileSync } from "node:fs";

const [, , out] = process.argv;
const name = "ai_gateway_guardrail_rules";
const loaderPath = `${out}/${name}.js`;
const wasmBytes = readFileSync(`${out}/${name}_bg.wasm`);

const fileLoader = [
  `const wasmPath = \`\${__dirname}/${name}_bg.wasm\`;`,
  `const wasmBytes = require('fs').readFileSync(wasmPath);`,
].join("\n");
const loader = readFileSync(loaderPath, "utf8");
if (!loader.includes(fileLoader)) {
  throw new Error(`${loaderPath} no longer loads the module from a file`);
}

writeFileSync(
  `${out}/${name}_bg.wasm.js`,
  `module.exports = Buffer.from("${wasmBytes.toString("base64")}", "base64");\n`,
);
writeFileSync(
  loaderPath,
  loader.replace(
    fileLoader,
    `const wasmBytes = require('./${name}_bg.wasm.js');`,
  ),
);
