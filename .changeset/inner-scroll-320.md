---
'@astryxdesign/cli': patch
---

[fix] Eleven page templates fit a 320 px phone without their content scrolling sideways. Their responsive grids now pair the minimum column width with a column cap, so a column narrower than the screen shrinks to fit instead of overflowing, and the inline form wizard's checkbox labels and descriptions wrap instead of widening the step. Wide screens look the same as before.

@josephfarina
