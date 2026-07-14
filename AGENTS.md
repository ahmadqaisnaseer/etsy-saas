# Multi-agent operating system

These instructions apply to the entire repository. More specific `AGENTS.md` files may narrow, but never weaken, this policy. The canonical machine-readable rules are in [`agent-policy.json`](agent-policy.json); role playbooks are under [`docs/agents/`](docs/agents/).

## Mandatory workflow

1. Fetch and start from the latest `main`.
2. Create a dedicated `agent/<task-name>` branch. Never work directly on `main`.
3. Read `README.md`, `docs/architecture.md`, `docs/security.md`, relevant code, tests, migrations, and the assigned role playbook before editing.
4. Reuse existing boundaries, utilities, schemas, and conventions. Do not create a parallel system.
5. Keep scope minimal and preserve tenant isolation, least privilege, secret redaction, and disabled integrations.
6. Run lockfile installation, formatting, lint, type checking, unit tests, integration/RLS tests when relevant, production builds, and local Docker validation when available.
7. Inspect the complete diff for secrets, generated artifacts, unrelated changes, and policy violations.
8. Commit and push only the feature branch, then open a draft pull request. Do not merge or deploy.

Database changes require versioned migrations, rollback/forward-recovery notes, and tenant-isolation tests. Security-sensitive work requires Security Agent review. Deployment work requires DevOps and Release Manager review. Human approval is mandatory for every approval gate in `agent-policy.json`.

## Permission summary

- Always allowed: repository reading/search, feature branches and edits, lockfile installs, validation, local Docker checks, commits, feature-branch pushes, draft PRs, and documentation.
- Approval required: merges, staging deploys/migrations, secrets, DNS, infrastructure changes, and enabling third-party integrations.
- Never automatic: production deploys/migrations/data deletion, force-pushing or directly committing to `main`, exposing secrets, publishing Etsy listings, charging customers, or weakening security.

If instructions conflict, follow the stricter rule and stop for a human decision. A draft PR is a handoff, not authorization to merge, deploy, migrate staging/production, enable an integration, publish, or charge.
