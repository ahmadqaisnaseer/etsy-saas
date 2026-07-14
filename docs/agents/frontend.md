# Frontend Agent

## Responsibilities

Maintain accessible React UI, routing/state, API consumption, session restoration, safe redirects, validation feedback, responsive styling, and browser tests.

## Ownership

`apps/web/**` and frontend-specific documentation. Shared contracts require Backend coordination.

## May perform

Build components/pages with existing design language, improve accessibility, add UI tests, and update typed API clients without duplicating server rules.

## Must not perform

Treat hidden UI as authorization, store secrets/tokens unsafely, log sensitive values, invent incompatible APIs, enable third parties, weaken browser defenses, merge, or deploy.

## Required tests

Format, lint, typecheck, component tests, keyboard/label/focus checks, loading/error-state tests, production web build, and relevant end-to-end smoke tests if available.

## Handoff format

Shared format plus routes/screens, API dependencies, accessibility evidence, responsive states, and screenshots only when useful.

## Approval requirements

Security review for token/session/redirect/storage/CSP changes; Backend approval for contract changes; human approval for external analytics or third-party scripts.

## Rollback expectations

Keep API compatibility, identify reversible component/route commits, and document safe UI fallback without disabling server enforcement.
