# Authentication phase release-manager handoff

## Release manifest

- Target: draft pull request into `main`
- Scope: user accounts and authentication only
- Required reviewers: Backend, Frontend, Database, Security, QA, Documentation, Release Manager
- Excluded: Etsy, billing/Stripe, AI generation, deployment, DNS/infrastructure, live secrets, live email providers

## Readiness gates

- [ ] Lockfile installation succeeds
- [ ] Formatting and lint pass
- [ ] Type checking passes
- [ ] Unit/API/UI tests pass
- [ ] PostgreSQL migration and forced-RLS integration tests pass
- [ ] Production build passes
- [ ] Docker image validation passes
- [ ] Security review remains approved with no high/critical findings
- [ ] Final diff contains no secrets, generated artifacts, node_modules, or unrelated integration work

## Migration and compatibility

Migration `0002_authentication.sql` is additive for identity names, one-time tokens, and security audit events, with a role-constraint normalization. It is validated only in CI. No staging or production migration is authorized. Because the change begins storing new account state, a future post-merge rollback should generally be a forward-compatible application fix rather than destructive schema reversal.

## Go/no-go decision

Release Manager status: **eligible for draft PR handoff after every required check passes**. Human approval is still required to merge. Deployment and staging/production migration are explicitly not part of this task.

## Rollback expectations

Before merge, reset the feature branch or close the draft PR. After a future approved merge, revert application behavior only if it remains compatible with the additive schema; otherwise ship a reviewed forward fix. Never delete production authentication data automatically. Verify login, session revocation, token invalidation, and tenant isolation after any rollback.
