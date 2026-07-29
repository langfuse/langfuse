# Preview PR banner strip — round 3 (color exploration)

Trang wasn't sold on violet; compared blue vs orange in both modes.

1. `1-blue-light.png` — blue-100 strip, blue-950 text. **Chosen.**
2. `2-blue-dark.png` — dark: blue-500/10 wash, neutral foreground text. **Chosen.**
3. `3-orange-light.png` — orange-100/orange-950; blue links pop but neighbors the amber warning color.
4. `4-orange-dark.png` — dark orange-500/10 wash.

Final classes: border-blue-200 bg-blue-100 text-blue-950,
dark:border-blue-300/15 dark:bg-blue-500/10 dark:text-foreground.

Round 3b: links switched from the indigo `text-link` token (hue 246) to explicit
blue (blue-700/hover-800 light, blue-400/hover-300 dark) per Trang.
5. `5-blue-light-blue-links.png` — final light.
6. `6-blue-dark-blue-links.png` — final dark.

Round 3c: dark bg lifted from blue-500/10 (too dark) to blue-500/25 after
comparing with solid blue-900 (too bright). 7-blue-dark-25pct.png chosen.
