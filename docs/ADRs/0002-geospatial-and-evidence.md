# ADR 0002: Geospatial events and private evidence

Status: Accepted  
Date: 2026-08-26

## Decision

Capture location only at explicit business events. Store customer and visit coordinates as PostGIS `geography` values with GiST indexes. Keep raw accuracy alongside each capture and compute customer distance and verification status on the server before a visit is finalized.

Store photos in private Supabase Storage buckets. Database rows store object paths, never image binaries or public URLs. Visit evidence paths follow `<organization-id>/<user-id>/<visit-id>/<file>` so Storage RLS can enforce tenant and uploader boundaries.

## Consequences

Distance queries remain scalable and auditable. Web GPS spoofing cannot be eliminated, so accuracy, distance bands, event consistency and exception review are treated as signals rather than proof of identity.
