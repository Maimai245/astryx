---
'@astryxdesign/cli': patch
---

[feat] `astryx init --to <places>` puts the Astryx skill where your agents read it: `agents-md` (the AGENTS.md block, still the default), `skills` (`.agents/skills/astryx` and `.claude/skills/astryx` in the project), `user` (this computer, the same as `--user`), or a folder written as a path. The choice is saved, in astryx.config `skills.to` for the project and in the settings file for a folder outside it, so a later `astryx init` writes the same places. Moving a project to another place removes the skill from the old one. `astryx init` with no `--to` and nothing saved writes exactly what it wrote before.

@josephfarina
