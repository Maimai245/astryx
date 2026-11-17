---
'@astryxdesign/theme-matcha': patch
---

[fix] Input and selector frames read at 3:1 (WCAG AA for a control's boundary) on the field, the page and a card: `--color-border-emphasized` moves to the nearest stop of the theme's own palette that meets it. Secondary text on a nav item takes the next stop in light, so it reads on the pressed fill.

@josephfarina
