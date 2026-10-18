# Security testing skills (Strix)

The repo vendors five Strix security-testing skills under `.agents/skills/` (tracked in `skills-lock.json`, sourced from the `usestrix/strix` GitHub repo). Each is a `SKILL.md` describing how to run Strix, an autonomous AI penetration-testing tool that exploits and proves vulnerabilities with a working proof-of-concept.

- `penetration-testing-with-strix`: the base skill — install, LLM setup, the open-source CLI vs. managed cloud choice, all flags, reading results. Start here.
- `web-app-penetration-testing`: black-box testing of a running web app or URL.
- `owasp-top-10-testing`: assessing an app against the OWASP Top 10:2025 category by category.
- `managed-pentesting-with-strix`: running scans on the managed `app.strix.ai` cloud (`strix cloud ...`), no local Docker or LLM key.
- `ci-security-scanning-with-strix`: wiring a diff-scoped scan into CI/CD to gate pull requests.

Use these only when the user asks for a pentest, security scan, vulnerability check or OWASP assessment. Non-obvious points from the skills:

- **Authorization first.** Only scan targets the user owns or is explicitly authorized to test. Prefer staging over production: the agents send real exploit payloads and will create or modify data. Confirm scope and out-of-scope paths before running anything.
- **Never hardcode, log or commit** an LLM key or a `strix cloud` API token. Keep them in env vars or the CI secret store.
- **A `0` exit code is not proof of full coverage.** If `--max-budget`/`--max-turns` is hit the scan wraps up early and can still exit `0`; check `strix_runs/<run>/run.json` status and cost before calling a target clean.
- **Verify each proof-of-concept yourself** before reporting a finding to the user.
- **Payments and external handoffs** (buying credits, installing an SCM app, DNS verification) end with the user — prepare the command or link and get approval; don't claim they're done.
