---
'@astryxdesign/cli': patch
---

[feat] `astryx init --to <places> --once` writes a copy that is saved nowhere, so no later `init`, `upgrade`, or background refresh touches it (a bundle, or a skill to upload elsewhere). `astryx init --remove` removes the Astryx skill from every place the project saved, and with `--to` from the places it names, in the project, a folder outside it, or the computer (`--remove --to user`), and drops each from what is saved; an edited skill file is kept and named. `--remove-agents` is now the same option as `--remove`; in a project that saves nothing it removes the block as before, adding one note when a folder is saved for this computer (kept, with the command that removes it), and its `init.remove` result gains `from`, `skills`, and `user`. `--once` is refused for the AGENTS.md block and for a place already saved, and nothing is removed through a linked skill folder, such as the link the computer-level skill makes into `~/.claude/skills`.

@josephfarina
