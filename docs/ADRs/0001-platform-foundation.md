# ADR 0001: Platform foundation

Status: Accepted  
Date: 2026-08-26

## Context

Vardhnam needs a mobile-first field application covering attendance, visits, CRM, collections, targets and management reporting. The OpenHRApp baseline already contains React, TypeScript, Supabase Auth, organization-scoped RLS, evidence storage and PWA infrastructure.

## Decision

Fork OpenHRApp at the SHA recorded in `docs/UPSTREAM.md`. Use React 19 and TypeScript for the PWA and Supabase Postgres, Auth, Storage, Realtime and Edge Functions for the backend. Keep one identity model and operational database for field and BI clients.

Use client CRUD only where RLS fully enforces access. Use database functions for atomic event workflows, geospatial verification and aggregates. Use Edge Functions only for privileged or secret-bearing operations.

## Consequences

The team can ship incrementally without rebuilding attendance or authentication. Existing upstream concerns must be removed carefully, and all reused RLS policies require direct authorization tests before production.
