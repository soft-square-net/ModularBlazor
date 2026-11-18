---
title: Conditional visibility
description: Best-practice strategy for showing, requiring, and validating nested fields based on other values or trusted record state.
---

Dynamic Fields should support conditional fields as declarative, versioned rules. A field or group can be visible, required, or constrained based on another field's value or trusted context, such as a consuming record's state or whether the form is being created or edited.

This is **form behavior metadata plus validation semantics**, not a UI implementation. Dynamic Fields defines and evaluates the rules. A frontend renders the result using its own controls. The server recomputes the result for every validation or write.

## Separate visibility, validation, and authorization

- **Visibility** answers whether a field should be shown in the current form context.
- **Validation** answers whether submitted JSON is valid in that context. A conditional field can be required only when its condition is true.
- **Authorization** answers whether the caller may read or change the underlying value. Hiding a field is never a security boundary and must not protect sensitive data.

Do not encode role or permission checks as visibility rules. The consuming module and host authorize data access and state transitions. The form may show a field based on trusted context, but it must not grant access.

## A small declarative rule language

Use a typed, allowlisted rule model, not JavaScript, C#, Liquid, arbitrary expressions, or user-authored code. Rules can read:

1. A JSON Pointer to another field in the current form value, such as /format or /delivery/region.
2. A named context value supplied by the consuming backend, such as record.state or form.operation (create, edit, review). Context values come from authenticated server-side request/domain state, not an untrusted client property.

Start with operators such as equals, notEquals, in, notIn, exists, isEmpty, greaterThan, lessThan, all, any, and not. Type-check operands against the referenced field/context definition when publishing the form. Do not support arbitrary string evaluation, network access, time-dependent behavior, or hidden service calls.

Example package fragment (proposed contract):

~~~json
{
  "conditions": {
    "videoWork": {
      "all": [
        { "path": "/format", "operator": "equals", "value": "Video" },
        { "context": "record.state", "operator": "in", "values": ["Draft", "Returned"] }
      ]
    }
  },
  "presentation": {
    "fields": {
      "videoUrl": { "label": "Video URL", "visibleWhen": "videoWork" }
    }
  },
  "conditionalValidation": [
    {
      "target": "/videoUrl",
      "requiredWhen": "videoWork",
      "constraintsWhen": "videoWork"
    }
  ]
}
~~~

The form package versions this rule language. Unknown operators or rule versions fail definition validation rather than being ignored.

## Evaluation rules

- Evaluate conditions deterministically against one immutable form version, one JSON value, and one trusted context snapshot.
- Use canonical JSON types. Do not coerce the string "1" into the number 1, or compare localized labels instead of stable choice values.
- Rule dependencies form a directed acyclic graph. Reject cycles such as field A visibility depending on B while B depends on A. Nested rules may depend on a parent and earlier/sibling fields, subject to cycle checks.
- Missing values have explicit semantics: exists is false; equals is false; notEquals is true only when the referenced value exists, unless the rule explicitly uses not or isEmpty. This avoids confusing missing with null.
- Evaluate a group condition once and apply it consistently to descendants; a child cannot be visible while its parent group is hidden.
- Conditions cannot depend on current time, another user's permissions, network data, or mutable external state that could change between UI fetch and save. If domain state matters, the consumer supplies a state snapshot and rechecks it when applying the command.
- Limit rule count, nesting depth, fan-out, and evaluation steps to prevent denial-of-service through deeply nested conditions.

## Hidden values and conditional requiredness

Visibility must not silently delete data. Set an explicit policy on each conditional field/group:

| Policy | Recommended behavior |
| --- | --- |
| preserve | Default for drafts. When hidden, retain the value in the draft. It is not required while hidden; if present, it must still satisfy basic type and size constraints. Consumer logic treats it as inactive while the condition is false. |
| rejectWhenHidden | Use for mutually exclusive final branches or data that must not accompany an inactive choice. The server returns a stable field.hiddenValueNotAllowed error until the client removes the value. |
| clearOnTransition | Optional explicit command behavior: when a user changes the controlling value, the consumer clears dependent values and records that change. Never implement as a side effect of reading or validating a form. |

Use preserve for ordinary editing so toggling a choice does not destroy work. Use rejectWhenHidden for submission/publication when keeping a dormant value would create ambiguous or invalid domain data. Sensitive values need authorization and retention rules regardless of visibility.

Requiredness and constraints are conditional independently of display. A hidden field is not required unless a separate explicit rule says otherwise. When visible, a rule may make it required and apply additional constraints. The server may return computed active/visible paths with validation errors so clients can display the same result, but it never trusts a client-submitted visibility map.

## Trusted record state

State-based visibility is useful for cases such as showing an editorial correction reason only while a work is Returned, or enabling a field only during Draft or Returned editing. The consuming module supplies a constrained context, for example:

~~~json
{
  "record": { "state": "Returned", "operation": "edit" },
  "form": { "operation": "edit" }
}
~~~

This context is server-derived. The consumer rechecks domain state at save time and enforces the transition independently. A browser cannot change the context to make a field editable or bypass the underlying business rule.

## Example behavior

For a Post form:

- format = Video shows videoUrl and requires it.
- postKind = article hides videoUrl; a draft value may be preserved, but it is not treated as active video metadata.
- record.state = Published may hide author-editable fields or show a correction-only section, but Contents still enforces its own post-publication edit and Desk reapproval rules.
- A field hidden for a user-interface reason remains protected by the same server-side permissions as any other field.

This model lets Blazor, another web frontend, and future clients render the same versioned form while keeping the API authoritative and each domain module responsible for its business rules.
