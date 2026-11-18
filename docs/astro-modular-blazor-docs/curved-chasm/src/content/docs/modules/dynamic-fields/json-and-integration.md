---
title: JSON package, APIs, and integration
description: Import/export contract, proposed endpoints, authorization, lifecycle, and integration guidance for consuming modules.
---

## Import/export contract

Use a versioned JSON envelope such as `platform.dynamic-fields/v1`. It contains the form key/title/version, JSON Schema dialect, validation schema, presentation hints, and exact component dependencies. Export should be deterministic: canonical property ordering, stable IDs, normalized line endings, and no environment-specific database IDs or secrets.

### Import rules

1. Parse with strict size/depth limits and validate the envelope version.
2. Validate the schema against the supported JSON Schema dialect and the module's narrower field/type allowlist.
3. Resolve component dependencies from the package or the target tenant's existing component catalog. Require explicit conflict behavior (`fail`, create a new key, or authorized replace as a new draft revision); never silently overwrite a published version.
4. Reject remote references, unknown custom keywords that affect validation, duplicate field keys, circular component references, and invalid tenant ownership.
5. Import as a draft first. Require an authorized publish action after review; an import must not immediately change live consumers.
6. Return a report listing new/updated drafts, dependency resolution, warnings, and path-specific errors. Apply the whole import atomically or apply none of it.

### Export rules

- Export a selected published form version and include its resolved component graph so the package is portable and self-contained.
- Allow authorized export of drafts separately, clearly marked as drafts.
- Keep stable form/component keys; target environment assigns its own storage IDs.
- Include schema dialect, package format version, dependency versions, and optional checksum/signature metadata.
- Never export tenant member data or consumer values as part of a definition package.

## Proposed API surface

These routes are a prototype contract to refine before implementation; they are not guaranteed to exist yet.

| Route | Purpose | Permission idea |
| --- | --- | --- |
| `GET /api/dynamic-fields/forms` | List forms visible in the current tenant. | `dynamic-fields.read` |
| `POST /api/dynamic-fields/forms` | Create a draft form. | `dynamic-fields.manage` |
| `GET /api/dynamic-fields/forms/{key}/versions/{version}` | Fetch the published schema and display metadata. | `dynamic-fields.read` or consumer-scoped access |
| `PUT /api/dynamic-fields/forms/{key}/draft` | Replace/update a draft with optimistic version check. | `dynamic-fields.manage` |
| `POST /api/dynamic-fields/forms/{key}/validate-definition` | Check schema and dependency graph without publishing. | `dynamic-fields.manage` |
| `POST /api/dynamic-fields/forms/{key}/publish` | Freeze a validated immutable version. | `dynamic-fields.publish` |
| `POST /api/dynamic-fields/forms/{key}/versions/{version}/validate` | Validate a JSON instance; return errors by JSON Pointer. | `dynamic-fields.validate` or authorized service grant |
| `POST /api/dynamic-fields/import` | Validate and stage a versioned JSON package as drafts. | `dynamic-fields.import` |
| `GET /api/dynamic-fields/forms/{key}/versions/{version}/export` | Export one immutable version plus dependencies. | `dynamic-fields.export` |

Tenant resolution and grant checks happen in the host and at the module boundary. A public frontend client may fetch a published schema only if the owning consumer permits it; do not make every tenant's draft definitions publicly enumerable.

## Consuming module pattern

Contents remains responsible for Posts, editorial transitions, and persistence. Contents maintains the server-side mapping from tenant and allowed Post kind to a published form version. On write, it checks caller scope and current state, validates the `content` of the document and of each node against the exact `schemaId`/`schemaVersion` it names, validates Keyword IDs and any Media asset IDs, then persists the Post, payload, version reference, tag assignments, revision, and outbox event in its own transaction. On read, it returns the Post envelope, payload, and pinned form reference; the frontend fetches the published schema to render it.

```text
Frontend ──GET form schema/version──► Dynamic Fields
Contents ──return allowed PostKind/form mapping──► Frontend
Frontend ──save Post + JSON payload + concept/asset IDs─► Contents
Contents ──validate payload against exact form version─► Dynamic Fields
Contents ──verify concept IDs─────────────────────────► Keyword
Contents ──verify asset IDs (optional module)─────────► Media
Contents ──persist Post + payload + references────────► Contents database
Contents ──publish backlink/search event after commit─► Keyword / consumers
```

For a mixed Post, a form may describe a bounded ordered array of discriminated blocks: an allowlisted `kind` identifies a declared paragraph, image, video, document, or album schema. Dynamic Fields checks structure and value constraints. Contents checks that the selected form is permitted, and verifies editorial rules and referenced IDs. Media binaries never belong in the JSON payload; use stable asset IDs.

Because calls across modules are not one database transaction, published schemas must be immutable and retrievable by exact version. If validation is unavailable, Contents should fail the write clearly or use a verified local schema snapshot; it must not accept unvalidated values and claim they were validated. A later schema version is an explicit migration decision, not a background mutation to existing Posts.

When Dynamic Fields is disabled, consumers retain their data and pinned version reference. They can continue to display or export stored JSON using a locally retained schema snapshot. Dynamic Fields must never cascade-delete consumer data. If a consumer requires live validation or editing, declare that as an optional module capability/dependency and make the degraded behavior explicit when the service is absent.

## Authorization and audit

Suggested permissions are module-defined, tenant-scoped grants: `dynamic-fields.read`, `dynamic-fields.manage`, `dynamic-fields.publish`, `dynamic-fields.validate`, `dynamic-fields.import`, and `dynamic-fields.export`. Split them further only when the product needs distinct operators. Every write records tenant, actor, form/component key, version, action, and timestamp. Do not treat schema authorship as permission to read or change values stored by a consumer module.

## Deployment and modularity

- **Single process:** activate Dynamic Fields with consumers in one WebApi pool. Use module contracts and the same APIs; deployment mode must not change validation rules.
- **Dedicated pool:** run only `dynamic-fields` in its own API pool when schema validation or authoring needs independent scaling. Consumers call it through the gateway/service route.
- **Optional ERP profile:** leave the module uninstalled/deactivated. ERP modules without dynamic-schema capabilities remain independent.
- **Storage:** Dynamic Fields owns its definition/version store, with tenant isolation and migrations for every supported provider selected by the platform. Consumer modules own submitted values.
- **Unloading:** host authorization types remain host-owned; no module-defined policy/handler types are retained by the host. Stop module services and clear schema/validator caches on deactivation/unload. Published schema snapshots are versioned data, not CLR object graphs.

## Suggested implementation slices

1. Define the versioned JSON package and supported schema subset; add examples and compatibility rules.
2. Build definition/component storage, tenant scoping, draft/publish lifecycle, and schema validation.
3. Add safe component composition and deterministic import/export, including cycle and size checks.
4. Add value validation with stable JSON Pointer errors and performance limits.
5. Integrate Contents Post payloads with exact form-version pinning, allowlisted PostKind mappings, and explicit service authorization.
6. Add frontend rendering in a separate client module only when requested; Dynamic Fields stays backend-only.

JSON Schema 2020-12 specifies the validation dialect; pin the exact dialect in every package rather than relying on a validator's implicit default. [Dialect declaration](https://json-schema.org/understanding-json-schema/reference/schema)
