module.exports = {
  i18n: {
    defaultLocale: "en",
    locales: ["en", "zh"],
    localeDetection: true,
  },
  localePath:
    typeof window === "undefined"
      ? // Use absolute path based on this config file's directory to avoid
        // monorepo working directory issues during SSR.
        require("path").resolve(__dirname, "public/locales")
      : "/locales",
  reloadOnPrerender: process.env.NODE_ENV === "development",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
};
