# Database migration

## Change

- Schema/data goal:
- Database Agent / Security reviewer:
- Migration file and base schema:
- Application compatibility window:

## Safety

- Locks/runtime estimate:
- Backfill/batching:
- Constraints/indexes/grants:
- RLS policy and tenant context:
- Rollback safety vs forward-fix plan:

## Validation

- [ ] Clean and upgrade migrations pass
- [ ] Migration workflow is repeatable
- [ ] Tenant A/B read and write isolation passes under runtime role
- [ ] Formatting, lint, typecheck, unit/integration tests, and build pass
- [ ] No staging migration run without explicit human approval

## Handoff

- Staging command/owner/window (plan only):
- Monitoring and stop conditions:
- Backup/restore assumptions:
- Draft PR:
