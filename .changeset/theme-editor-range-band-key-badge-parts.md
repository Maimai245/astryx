---
'@astryxdesign/cli': patch
---

[experimental] The theme editor knows Core's calendar range band and keyboard key badge parts. "The calendar range band" is `calendar-range`, and "range" is no longer corrected to "orange". "Keyboard keys", "key chips", "the keyboard shortcut" and "the kbd" are `kbd-key`, the badges that paint every key; "the gap in the keyboard shortcut" and "space between the keyboard keys" are `kbd`, which lays the keys out. A fill set on `kbd` or on `calendar` was refused, because the key badges and the range band painted over it from a token; they are parts of their own now, so that fill is taken and paints the group's own box.

@josephfarina
