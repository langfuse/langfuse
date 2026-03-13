declare module "lang-detector" {
  interface StatisticsResult {
    detected: string;
    statistics: Record<string, number>;
  }

  function detectLang(text: string): string;
  function detectLang(
    text: string,
    options: { statistics: true; heuristic?: boolean },
  ): StatisticsResult;
  function detectLang(
    text: string,
    options: { statistics?: false; heuristic?: boolean },
  ): string;

  export = detectLang;
}
