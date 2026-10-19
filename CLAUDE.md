# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Project guidance is split by topic into `.claude/rules/`, which Claude Code loads automatically:

- `overview.md`: the product, commands and stack (always loaded)
- `simulation.md`: the engine and data model (`lib/sim/`, `lib/model/`)
- `editor.md`: the editor store, layout, displays and canvas UI (`lib/editor/`, `components/editor/`, `app/dls/`)
- `sss.md`: the signals & systems simulator (`lib/sss/`, `components/sss/`, `app/sss/`)
- `calc.md`: Bits & Logic, the number and logic calculators (`lib/calc/`, `components/calc/`, `app/calc/`)
- `storage.md`: IndexedDB blocks and the `localStorage` draft and list layout
- `styling.md`: theme tokens, site styles and the stale-CSS problem (`app/`, `components/`)
- `testing.md`: test helpers

Files with `paths:` frontmatter load only when Claude works on matching files.

Safety rules for the vendored Strix security-testing skills are in `.claude/rules/security-skills.md`.
