# Shared permission policy

## Always allowed

Repository reading, code search, creation and editing of dedicated feature branches, dependency installation from the committed lockfile, formatting, linting, type checking, tests, builds, local Docker validation, commits, feature-branch pushes, draft pull requests, and documentation updates. These actions must remain task-scoped and must not access live systems or secrets.

## Approval required

Human approval is required immediately before merging, staging deployment, staging migration, accessing/creating/rotating secrets, DNS changes, infrastructure changes, or enabling any third-party integration. Approval must name the environment, exact action, change/ref, approver, and time. Approval for one gate does not imply another.

## Never automatic

Agents never automatically perform production deployment, production migration, production data deletion, force-push to `main`, direct commit to `main`, secret exposure, Etsy listing publication, customer charging, or security weakening. A human request must still use the repository's controlled production procedure; it does not convert these actions into routine agent steps.

## Escalation

Stop on ambiguous environment targeting, unknown data-loss risk, missing rollback, failing required checks, unreviewed security-sensitive changes, or a conflict between policies. Record the blocker in the handoff without bypassing it.
