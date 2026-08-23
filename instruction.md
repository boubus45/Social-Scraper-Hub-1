Repository editing workflow — instruction.md

1) Always check memory.md before starting any task
   - Open /memory.md (repo root). If not present, search session-state files under /home/node/.copilot/session-state and then create one at repo root.
   - Use memory.md's codemap to locate files and avoid rescanning the whole codebase.

2) When to update memory.md
   - Update before committing changes that affect the codemap: new files, moved files, renamed modules, added/removed top-level folders, public API surface changes, or major refactors.
   - Do NOT update for trivial edits (typos, small logic tweaks, formatting) unless they change file locations or module boundaries.

3) How to update memory.md
   - Edit the codemap section to reflect added/removed/renamed files and brief descriptions of major modules changed.
   - Update the "Last Updated" date at the end.
   - Keep entries short and focused (paths + one-line purpose).

4) Commits and verification
   - If asked to commit, include the updated memory.md in the same commit when changes affect the codemap.
   - Run any existing targeted tests/builds for the changed packages before finalizing the commit.

5) If unsure
   - Ask a clarifying question before making changes.

6) Location & persistence
   - memory.md should live in the repo root (/memory.md). instruction.md documents this workflow and should also live at the repo root.

End of instructions.