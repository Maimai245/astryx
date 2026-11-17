---
'@astryxdesign/theme-butter': patch
---

[fix] Input and selector frames read at 3:1 (WCAG AA for a control's boundary) on the field, the page and a card: `--color-border-emphasized` moves to the nearest stop of the theme's own palette that meets it, and the inputs draw it instead of the fainter general border. Accent text, the secondary and ghost buttons' text and nav item text take accent stop 35 in light, so they read at 4.5:1 on a pressed fill and on the accent tint of a current page.

@josephfarina
