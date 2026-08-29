# ADR 0003: Explicit offline queue and idempotency

Status: Accepted  
Date: 2026-08-26

## Decision

Offline-capable business mutations use an IndexedDB outbox. Every queued action has a client-generated UUID idempotency key, immutable payload, attempt count and explicit pending, syncing, failed or completed state. Backend constraints or RPCs deduplicate by idempotency key.

Media upload and transactional row creation are separate resumable steps. Failed uploads remain queued; failed row creation records orphan-cleanup metadata.

## Consequences

The application does not pretend the Supabase browser client supplies offline writes. Sync status and retry controls must be visible to users, and chaos testing is required before any module flag is enabled.
