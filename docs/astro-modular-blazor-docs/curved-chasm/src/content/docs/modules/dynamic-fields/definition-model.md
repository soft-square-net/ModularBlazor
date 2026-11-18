---
title: Definition model and nested field types
description: Proposed versioned form, field component, nesting, and metadata model for Dynamic Fields.
---

## Core records

| Record | Responsibility | Lifecycle |
| --- | --- | --- |
| `FieldComponent` | Reusable definition such as postal address, source citation, or SEO metadata. | Draft edits create a new immutable published revision. |
| `FormDefinition` | Named, tenant-owned composition of fields for a domain use case, e.g. a Contents Post kind such as video or mixed story. | Draft → Published version(s) → Deprecated. |
| `FormVersion` | Frozen schema, metadata, resolved component versions, and compatibility information. | Immutable after publish; consumers pin an exact version. |
| `ValidationResult` | Structured result for a JSON instance: valid flag and errors by JSON Pointer path. | Ephemeral response; it does not persist the consumer's values. |

Every definition is tenant-scoped, with a stable key separate from its display title. The same tenant may maintain several forms for different Post kinds or business processes. A field key is stable inside its object; changing a label must not rename the JSON property or lose stored values.

## Field vocabulary

Start with a small, portable set mapped to JSON Schema primitives:

| Field kind | JSON shape | Common constraints |
| --- | --- | --- |
| Text | `string` | min/max length, pattern, format, allowed values |
| Integer / decimal | `integer` / `number` | minimum/maximum, exclusive bounds, precision policy |
| Boolean | `boolean` | required/optional |
| Date / date-time | `string` with an explicit format | date-time timezone policy; validate format server-side |
| Choice | `string` or integer enum | stable option value, localized label, active/deprecated option status |
| Object / group | `object` with properties | nested required fields, property count, unknown-property policy |
| Repeating group | `array` of object schema | min/max item count and per-item validation |
| Attachment reference | stable asset ID string/object | reference authorization belongs to the consuming domain/media module |

Avoid arbitrary executable validators, user-defined CLR types, SQL snippets, and dynamic code. Add a new field kind only when its data contract and validation semantics are portable and documented. A frontend may map a kind to its own control, but Dynamic Fields does not choose a component class or HTML tag.

## Definition package shape

Keep validation schema and display metadata separate in the exported package. This sample is a proposed contract, not an implemented API:

```json
{
  "format": "platform.dynamic-fields/v1",
  "form": { "key": "post.news", "title": "News item", "version": 3 },
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:platform:tenant:acme:forms:post.news:3",
    "type": "object",
    "properties": {
      "headline": { "type": "string", "minLength": 1, "maxLength": 180 },
      "sources": { "type": "array", "items": { "$ref": "#/$defs/source" }, "maxItems": 12 }
    },
    "required": ["headline"],
    "additionalProperties": false,
    "$defs": {
      "source": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "maxLength": 160 },
          "url": { "type": "string", "format": "uri" }
        },
        "required": ["name"],
        "additionalProperties": false
      }
    }
  },
  "presentation": {
    "fields": {
      "headline": { "label": "Headline", "order": 10 },
      "sources": { "label": "Sources", "order": 20, "helpText": "Add up to 12 sources." }
    }
  },
  "components": [{ "key": "source", "version": 2 }]
}
```

`presentation` carries optional labels, descriptions, help text, ordering, grouping, and references to declarative visibility rules. It must not contain executable expressions, raw HTML, CSS, or a frontend component name. The schema defines the data contract; frontends can render it differently without changing validation. See [Conditional visibility](/modules/dynamic-fields/conditional-visibility/) for the rule model and hidden-value semantics.

## Nested field rules

- A form is a JSON object at its root. Each property has a stable key and exactly one schema type unless an explicit union is needed.
- Nested objects and repeating groups can reuse published components.
- A published form resolves every component reference to an exact version. Publishing stores the resolved dependency graph so a later component update cannot silently alter an existing form.
- Form and component IDs are opaque stable IDs; tenant IDs and display labels are not identity keys.
- Field removal or a key/type change is a breaking schema change. Publish a new form version and let consumers migrate values explicitly.
- Unknown properties are rejected by default (`additionalProperties: false`) to catch stale clients and misspellings. Allow forward-compatible extension points only by explicit design.
- Repeating groups have bounded item counts; nested arrays and objects have bounded depth and total field count.

## Values remain with the consumer

Dynamic Fields stores definitions, not a universal answer/submission table. The consuming module persists submitted values with its own aggregate and domain audit. Contents stores a Post's document and records, at the root and on every node, the `schemaId` and `schemaVersion` (this module's form key and version) that its `content` must match. Contents selects the allowed form for the Post kind and tenant; the frontend asks Contents which form applies, fetches the published schema, renders its own controls, then submits the document back to Contents. Forms define payload data only: they cannot declare authorization, tenant/press/category scope, editorial states, assignments, or publication decisions.

This avoids a generic dynamic-data database that would weaken domain constraints and make every consumer depend on a single catch-all record model.
