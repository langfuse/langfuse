// https://github.com/t3-oss/t3-env/blob/e7e21095e00a477e37608783defda5a6a99586d0/packages/core/src/index.ts#L228
// unfortunately, we are not able to install t3-env in all our packaging as some rely on commonjs.
export const removeEmptyEnvVariables = (runtimeEnv: any) => {
  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (value === "") {
      delete runtimeEnv[key];
    }
  }
  return runtimeEnv;
};
