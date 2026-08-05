# Layering v2 — rebalanced ladder steps

Trang's feedback on v1: chrome (2%) vs canvas (4.5%) had too little contrast;
canvas vs sheet/modal (9.5%) had too much.

Fix: widest step at the bottom (the frame/content split carries the layout;
equal pp steps read smaller near black), tighter steps in the middle.

| Tier | v1 | v2 |
|---|---|---|
| chrome | 2% | 2% |
| canvas | 4.5% | **6%** |
| card | 7% | **7.5%** |
| modal | 9.5% | **9%** |
| popover | 12% | 12% |

Gaps: chrome→canvas 2.5→**4pp**; canvas→modal 5→**3pp**.

Shots: numbered before/after pairs — "before" = pre-PR baseline (main),
"after" = this round's result. `1/2-traces` (frame/content split),
`3/4-sheet` (gentler canvas→modal jump), `5/6-dialog`.
All shots at the standard 1600x900 viewport (emulated, downscaled to exact px).
