# Cursor IDE config (reference)

Team-shared Cursor rules, skills, and slash commands live here. The `.cursor/` directory is **not** tracked in git (local IDE state; avoids file locks during `git pull`).

## Setup

From the repo root, copy or symlink into `.cursor/`:

```powershell
# PowerShell (repo root)
Copy-Item -Path docs\cursor\* -Destination .cursor\ -Recurse -Force
```

Or symlink individual folders if you already have local Cursor settings:

```powershell
New-Item -ItemType Directory -Force -Path .cursor
Copy-Item docs\cursor\rules .cursor\rules -Recurse -Force
Copy-Item docs\cursor\skills .cursor\skills -Recurse -Force
Copy-Item docs\cursor\commands .cursor\commands -Recurse -Force
Copy-Item docs\cursor\mcp.json .cursor\mcp.json -Force
```

After pulling changes under `docs/cursor/`, re-copy the folders you use (or merge manually).

## Contents

| Path | Purpose |
|------|---------|
| `rules/` | Agent rules (workbench, OpenSpec, QA) |
| `skills/` | OpenSpec workflow skills |
| `commands/` | Slash commands (`opsx-apply`, `opsx-propose`, …) |
| `mcp.json` | Example MCP config (Playwright); customize locally |
