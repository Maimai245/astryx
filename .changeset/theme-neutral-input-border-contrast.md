---
'@astryxdesign/theme-neutral': patch
---

[fix] Input and selector frames read at 3:1 (WCAG AA for a control's boundary) on the field, the page and a card: `--color-border-emphasized` moves to the nearest stop of the theme's own palette that meets it. The progress track keeps its pale gray, so a value drawn on it still reads whatever the accent; the switch track takes the darker frame.

@josephfarina
