export const SCORE_COLORS: Record<string, string> = {
  // Overall Rating & Error Coding
  "Just Ok":
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Unnecessary Restating":
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Sycophancy: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Not good": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Good: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Multiple Questions":
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Gears Wrong":
    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "Inquiry Needed":
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Discussion:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Leading: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",

  // Gears & Good Conversation Indicator Coding
  "Autonomy Support":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  "Explaining the Method":
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Competence: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  "First Gear": "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "Experiential Exploration":
    "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "Reliability/Consistency":
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

export function getScoreColor(scoreValue: string): string {
  return SCORE_COLORS[scoreValue] || "bg-secondary text-secondary-foreground";
}
