# Atomic CRM reference

- Source: `https://github.com/marmelab/atomic-crm.git`
- Local reference checkout: `../references/atomic-crm`
- Pinned reference commit: `167a4cdb652b1ab2b4b030831cfa7adcf2099321`
- License: MIT (`LICENSE.md` in the reference checkout)
- Reference date: 2026-08-26

## Adopted concepts

- A small task record with owner, due date, type, note and completion state.
- Explicit pipeline stages rendered as grouped columns/tabs.
- Activity events assembled around customer, lead and deal records.
- Ordered SQL source organization for tables, functions, views, triggers, policies and grants.

## Deliberately not copied

- React Admin application shell and data-provider assumptions.
- Numeric sales/contact identifiers; Vardhnam uses existing Supabase Auth UUIDs.
- Atomic CRM's broad policies that allow every authenticated user to read and mutate CRM tables.
- Company/contact duplication; Vardhnam uses the `customers` master created in migration 0025.
- Five-query client-side activity aggregation. Vardhnam records server-side activity events and will expose a paginated view/RPC.

Code should be ported only when its license attribution and architectural fit are clear. Prefer reimplementing the small business pattern in the existing component system over copying framework-bound components.
