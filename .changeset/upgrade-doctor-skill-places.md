---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade --apply` refreshes the Astryx skill in every place `astryx init --to` saved (astryx.config `skills.to`), with the two copies of the project skills folders kept byte for byte the same and an edited file kept; the dry run names each file it would write. A project that keeps its Astryx guidance only as a skill is no longer told to add the AGENTS.md block. `astryx doctor` adds a `skill-places` check: it passes when each saved skill file matches this release, and warns when one is missing or stale, when the block and the skill are both there, or when a project skill is named `astryx`. The CLI installed for the computer also refreshes the folders outside a project that `init --to` saved, and doctor's `computer-agent-text` check names them.

@josephfarina
