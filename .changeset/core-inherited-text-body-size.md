---
'@astryxdesign/core': patch
---

[fix] Plain inherited text now uses the theme's body size, 14px by default instead of the browser's 16px. Text that sets no size of its own, such as plain text in a Card or Stack, a Blockquote's quote, or `Text type="inherit"`, now follows the theme's `--text-body-size`, as Core's own body text does, and moves when a theme changes its text size. `reset.css` sets it on `body` (not `html`, so `rem` is unchanged), and each `Theme` sets it for the text inside. To keep 16px, set `--text-body-size` in your theme, or set your own `body` font-size, which wins over the reset.

@josephfarina
