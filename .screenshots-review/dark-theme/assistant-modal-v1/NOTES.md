# Assistant window → modal tier (design-tuning)

The assistant is a floating panel (agent layer, above `panel` in
LAYER_ORDER) but sat on bg-background — same 6% as the canvas it floats
over, lifted only by border+shadow. Retune, keeping the ladder legal:

- container: bg-background (6%) → bg-modal (9%)
- header bar, chat bubbles, tool cards, suggestion chips, collapsed
  footer: bg-card (7.5%, would invert inside 9%) → bg-muted (11.6%)
- suggestion chip hover: bg-muted/60 → bg-accent (18%)
- input: stays bg-background — recessed field on the modal surface

Pair: 1-assistant-before / 2-assistant-after (dark, natural viewport,
empty-conversation state; bubbles/tool cards follow the same tokens).
