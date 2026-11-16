---
title: Contents
description: Domain boundaries and design for tenant-scoped posts whose type-specific payloads are defined by Dynamic Fields forms.
---

# Contents module

The **Contents** module owns the company's editorial posts and the rules that govern them. A post has a stable Contents-owned envelope (tenant, press, category, author, state, revision, scheduling, and publication data) and a type-specific payload validated against an immutable form version from **Dynamic Fields**. Post forms can define articles, video posts, image posts, document posts, albums, or mixed posts containing ordered paragraph/image/video/document blocks.

In this strategy, **Post** is the Contents aggregate for any editorial item, whether it is a video, paragraph-led article, document, image, album, or mixed composition. Dynamic Fields defines payload shape and validation, not the Post identity, editorial lifecycle, authorization, or media storage.

This is a domain module, not a generic file store or workflow engine. It can be omitted from an ERP deployment without changing Identity, Tenancy, or unrelated modules. Shifts and Elsa are optional collaborators; the Content module remains the authority for content state even when neither is deployed.

## Agreed boundaries

| Concern | Owner | Boundary |
| --- | --- | --- |
| Global accounts, authentication, tenant membership | Identity service | Content stores stable actor IDs, never credentials or account copies. |
| Company/tenant directory and tenant resolution | Tenancy and host | Every query and mutation runs inside one resolved tenant. |
| Presses, categories, posts, payload-version references, editorial state, revisions, and history | Contents | The module validates all post-level invariants and transitions. |
| Published form definitions, nested payload schemas, reusable fields, and payload validation | Dynamic Fields | It validates versioned payload JSON; it does not own posts or their submitted values. |
| Rota, shift clock, section coverage, check-in/out, shift grants | Shifts | It produces time-bounded grants; it does not own Post data. |
| Timers, reminders, delayed assignment, scheduled publication, handover orchestration | Elsa | Elsa requests operations from Contents and Shifts APIs; it does not update their databases directly. |

Modules communicate through contracts and HTTP APIs. They do not share a `DbContext`, join each other's tables, or take cross-module database dependencies. In an all-in-one deployment, calls may be routed through a local gateway; in a distributed deployment, they use the service routes. The module boundaries stay the same in both modes.

## Recommended section structure

- [Posts, dynamic forms, and structure rules](./posts/) defines the Post envelope, form-defined payloads, invariants, and authorization checks.
- [Workflow and module integrations](./workflow-and-integrations/) describes the authoring lifecycle, Shifts/Elsa responsibilities, deployment choices, and rollout sequence.

Contents selects the published form version for each post kind and persists that version reference with its payload. The optional [Dynamic Fields module](/modules/dynamic-fields/) owns the definitions and validation; Contents owns the post values and lifecycle.

For canonical topics/entities, multilingual aliases, and tag resolution, see the draft [Keyword module strategy](/modules/keyword/). Contents remains the authority for tags assigned to each Post.

The existing [authentication and authorization design](/backend/auth-design/) records the agreed identity, grant, and shift workflow decisions. This section focuses on the Content module's own domain and its contracts with those modules.

## What exists versus what is planned

The starter code now names its aggregate `Post` and its discriminator `PostKind`; the current payload is still fixed title/body data. The planned Post payload defined by a pinned Dynamic Fields form remains a future design target and will require an intentional payload and database migration.

The complete production model is still a design target: media/asset lifecycle, richer format-specific fields, audit retention, publication channels, moderation and editorial configuration, and the final API versioning strategy need separate analysis before implementation. Do not infer these features from the starter schema.

## Design principles

1. Tenant isolation is mandatory; a press always belongs to exactly one tenant.
2. Every Post belongs to one press and one category in that press. A shift section can cover category scopes from multiple presses.
3. Content state is changed through application use cases and version-checked commands, never by direct table updates from Elsa or Shifts.
4. Authorization is checked at request time against tenant grants and the Post's press/category scopes. A role name alone does not authorize an action.
5. Shift access follows the shift clock and checkout time. A long-lived token does not extend an expired shift grant.
6. Keep editorial identity and lifecycle fields in the Contents Post envelope; place type-specific payload structure in an immutable Dynamic Fields form version.
7. Preserve the published snapshot while a new edit waits for Desk approval. A draft edit must not silently change live output.

These boundaries allow the platform to ship one image and run on one machine, scale selected modules into separate pools, or omit the newsroom modules entirely.
