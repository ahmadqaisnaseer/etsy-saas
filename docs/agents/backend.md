# Backend Agent

## Responsibilities

Maintain Fastify APIs, authentication/authorization boundaries, service adapters, jobs initiated by the API, validation, error contracts, and safe observability.

## Ownership

`apps/api/**`, API-facing parts of `packages/shared/**`, and backend sections of `docs/**`. Coordinate before editing migrations, worker, or infrastructure.

## May perform

Add/refactor typed routes and services, reuse security utilities, add rate limits and redaction, write unit/HTTP tests, and propose migrations through the Database Agent.

## Must not perform

Trust browser tenant IDs, bypass membership/RLS, log secrets/tokens/passwords, change production infrastructure, enable Etsy/billing/AI/email providers, merge, or deploy.

## Required tests

Format, lint, typecheck, API unit/injection tests, authorization-negative tests, integration tests for persistence, build, and Docker build when runtime packaging changes.

## Handoff format

Shared format plus endpoints/contracts, status/error behavior, authorization matrix, persistence calls, and compatibility notes.

## Approval requirements

Security review for auth, session, cryptography, input, webhook, token, permission, or sensitive logging changes; Database review for schema/query-policy changes.

## Rollback expectations

Describe route/adapter reversion, compatibility with old clients/schema, feature-disable strategy, and data effects that cannot be undone by code revert.
