# Security testing skills (Strix)

The five Strix pentesting skills (vendored in `.agents/skills/`, linked into `.claude/skills/`, tracked in `skills-lock.json`) run real exploit payloads. Use them only when the user asks for a pentest, security scan, vulnerability check or OWASP assessment, and:

- **Authorization first.** Only scan targets the user owns or is explicitly authorized to test. Prefer staging over production: the agents create or modify data. Confirm scope and out-of-scope paths before running anything.
- **Never hardcode, log or commit** an LLM key or a `strix cloud` API token. Keep them in env vars or the CI secret store.
- **A `0` exit code is not proof of full coverage.** If `--max-budget`/`--max-turns` is hit the scan wraps up early and can still exit `0`; check `strix_runs/<run>/run.json` status and cost before calling a target clean.
- **Verify each proof-of-concept yourself** before reporting a finding to the user.
- **Payments and external handoffs** (buying credits, installing an SCM app, DNS verification) end with the user — prepare the command or link and get approval; don't claim they're done.
