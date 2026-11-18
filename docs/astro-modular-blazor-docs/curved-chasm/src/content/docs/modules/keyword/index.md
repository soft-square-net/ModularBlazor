---
title: Keyword
description: Draft strategy for a multilingual, tenant-aware Keyword module that manages concepts, aliases, relationships, tags, and text analysis.
---

> **Draft strategy:** this page proposes the future module boundaries and behavior. It is not a claim that a Keyword service is implemented.

The **Keyword** module manages canonical terms for things and ideas described across the platform: companies and establishments, people, products, places, events, animals, and topics. A keyword is a stable concept with language-specific names, synonyms, relationships, and optional typed facts. Contents, Shifts, and other optional modules can use its concepts as tags.

For example, **Sports** can be a topic with child concepts **Football** and **Tennis**. “Soccer” may be an English alias for Football where that usage is appropriate. Arabic and English names can refer to one concept ID without duplicating the concept.

## Recommendation

Model each keyword as a **canonical concept**, not just a string tag. Keep these meanings distinct:

- **Preferred label:** the main display name of a concept in one language.
- **Synonym/alias:** another name or spelling for the same concept.
- **Related concept:** a semantic association between two different concepts.
- **Broader/narrower:** taxonomy relationships such as Sports → Tennis.
- **Tag assignment:** a source module associates its own record with a concept.

This resembles SKOS's distinction between preferred/alternate labels and broader/narrower/related concepts. Keep the platform API simpler than a general knowledge graph. [W3C SKOS Reference](https://www.w3.org/TR/skos-reference/)

**Tags and categories are not child classes of Keyword.** A Keyword is a concept; a tag is an association between a source record and that concept. A category is a domain record/classification with its own owner and behavior. Keyword can organize concepts into reusable taxonomy schemes, but it does not take ownership of every module's categories.

## Ownership and module boundaries

| Concern | Owner |
| --- | --- |
| Canonical concept IDs, labels, aliases, taxonomy, typed relationships, merge/retire history | Keyword |
| Presses, editorial categories, Posts, and each Post's authoritative tag assignments | Contents |
| Shift schedule, section, rota, grants, and shift lifecycle | Shifts |
| Reverse lookup/search projection of records linked to a concept | Keyword, rebuilt from source events or APIs |
| Source text and editorial/publishing state | Contents or the module that owns the text |
| SEO score, recommendations, crawl/render checks, report lifecycle | Planned SEO Analysis module |
| HTML keyword pages, URLs as rendered pages, UI and presentation | A frontend/site module |

Contents owns press categories because they drive editorial organization, category-scoped grants, shift coverage, and workflow rules. A category may optionally map to a Keyword concept when both represent the same subject, but the mapping does not replace the Contents category ID or its behavior. Contents owns tag assignments in the same transaction as its Post. Shifts owns any tags assigned to shifts or sections. Keyword owns the concept catalog and a read-optimized backlink index. That index is a projection and can be rebuilt; Keyword never writes into another module's database.

~~~mermaid
flowchart LR
    K["Keyword catalog<br/>concepts, labels, aliases"] -->|stable concept IDs| C["Contents<br/>Posts and authoritative tags"]
    K -->|stable concept IDs| S["Shifts<br/>optional coverage tags"]
    C -->|tag/link events and canonical URLs| I["Keyword backlink index"]
    S -. "optional link events" .-> I
    C -->|text and publication facts| SEO["Planned SEO Analysis"]
    K -->|canonical labels and text matches| SEO
    SEO -->|reviewable recommendations| C
    I -->|related links grouped by press| P["Keyword detail API / frontend page"]
~~~

## Concept model

The core record is a tenant-scoped KeywordConcept with a stable opaque ID.

| Property | Rule |
| --- | --- |
| Type | Controlled kind such as Organization, Person, Product, Place, Event, Animal, or Topic. |
| Status | Draft, Active, Retired, or Merged. Retire or merge referenced concepts; do not hard-delete them. |
| Preferred labels | At most one preferred label per language/locale for a concept. Preserve the display form. |
| Aliases | Alternate names, abbreviations, spelling variants, transliterations, and former names; record language and alias kind. |
| Relations | Typed edges to other concept IDs, with tenant and cycle checks. |
| Facts | Optional type-specific values, explicitly typed and validated. Do not make this arbitrary, unvalidated JSON. |
| Slug | URL-safe identifier separate from translated labels; slug changes need redirects. |

A phrase may identify more than one concept. Keep ambiguity instead of silently merging homonyms: “Jordan” could refer to a person or a place. Alias and concept identity are separate so label edits do not break tags.

### Topics, facets, and parent/child

Sports is a topic concept; Tennis and Football can be narrower topics. Keyword owns reusable taxonomy schemes that organize concepts, such as a shared topic taxonomy. Football and Tennis can be tagged directly, while a query for Sports may optionally include descendants. A press's editorial category named “Sports” is still a separate Contents category, even if it maps to the Sports Keyword concept.

## Rules for tags, taxonomies, and categories

1. Every tag reference points to a stable Keyword concept ID, never to a copied label string.
2. The source module owns the tag-assignment record and its lifecycle. Keyword may index backlinks, but that index is rebuildable and is not the source of truth.
3. A Keyword taxonomy scheme organizes concepts for reuse across modules. Scheme membership and broader/narrower relations do not make a business category.
4. Contents owns press categories and validates that a category belongs to the selected press and tenant. Category IDs remain the authorization and shift-coverage scopes.
5. A Contents category may optionally reference a Keyword concept for semantic/search/SEO reuse. Renaming or retiring the Keyword must not silently delete or change the category.
6. A category-to-concept mapping does not automatically tag every Post in that category. Post tags remain explicit assignments unless a consumer deliberately offers a separate inherited-tag view.
7. Keyword tags and taxonomy relations are descriptive only. They never grant permissions, define shift roles, or alter workflow transitions.

See [Contents structure rules](/modules/contents/posts/) for the press/category ownership boundary.

Allow a concept to have multiple broader concepts when cross-cutting taxonomies require it, with an optional primary path for navigation. Reject hierarchy cycles and cross-tenant edges. Keep the initial relation vocabulary small:

| Relation | Meaning | Example |
| --- | --- | --- |
| Broader/narrower | Taxonomy; inverse direction is derivable. | Tennis is narrower than Sports. |
| Related | Symmetric semantic association; concepts remain distinct. | An event and its host city. |
| Merge redirect | Explicit identity merge, with an audited redirect from the old ID. | Duplicate person entries merged by an editor. |

Add richer relations such as located-in or part-of only when a real product workflow needs their semantics.

## Multilingual labels and text normalization

Store original display text and a separate normalized search key. Each label has a language tag (for example English or Arabic) and a kind: preferred, exact synonym, variant/transliteration, former name, or hidden search label. Synonyms are language- and context-sensitive; related words are not synonyms.

Use Unicode NFC for canonical-equivalent text comparison while preserving source/display text. If looser compatibility matching is needed, keep it in a separate matching key because compatibility normalization can discard distinctions. [Unicode normalization guidance](https://www.unicode.org/faq/normalization.html)

For Arabic, offer configurable matching transforms for diacritics, tatweel, and selected alef/ya variants, but preserve original labels and evidence. Do not globally collapse forms that may merge different names or dialect terms. For English, use Unicode-aware case folding and tokenization; stemming or lemmatization may suggest matches but must not change canonical labels or merge concepts automatically. Transliteration is one matching path, not proof that two concepts are identical.

## Tag links and press content URLs

The Keyword detail API can return published related content grouped by press. Each backlink should carry:

- Stable source reference: tenant, module, content type, and source record ID.
- Press ID and link kind: explicitly tagged, exact mention, or reviewed association.
- Current canonical URL and optionally a cached title, supplied by the source module.
- Publication/visibility state and source version for projection refresh.

Contents emits events when a Post's tags, publication state, or canonical URL changes. Keyword updates its backlink projection idempotently. Unpublish events remove or mark a link unavailable; projections can be replayed from source APIs/events.

Store stable references as identity and treat URLs as refreshable projection data. Do not store only a URL, which can go stale or fail to identify the source record. Do not let editors attach arbitrary external URLs and present them as press-owned content; external references need a distinct type, moderation, and safe-link rules.

The backend provides concept and backlink data; a frontend renders a keyword landing page. It does not add a representation layer to the Keyword module.

## Contents and Shifts integration

- **Contents:** editors search/resolve labels to concept IDs and assign tags to Posts. Contents validates that the concept is active and tenant-visible, then persists tag changes with the Post. Dynamic Fields may define payload fields that help editors describe a Post, but it does not own Keyword assignment or concept identity. SEO analysis suggestions remain unreviewed until an authorized editor accepts them.
- **Shifts:** a section or shift may optionally carry coverage topics for planning and filtering. Keyword tags do not change rota, shift grants, access windows, workflow assignment, or authorization.
- **Other modules:** use stable concept IDs via contracts/API and emit source-owned link events. No module references another module's DbContext.

If Keyword is unavailable, existing records keep their concept IDs and display snapshots; consumers can continue reading saved tags but should not accept new IDs they cannot validate. Deactivating Keyword never deletes Contents or Shifts data.

## Arabic/English text analysis

Keyword should expose reusable multilingual **candidate mention analysis**. The future SEO Analysis module consumes it to produce SEO recommendations; it owns SEO reports and scoring, not the concept catalog.

Recommended pipeline:

1. Receive text fields, source module/type/record ID, tenant, and declared or detected language. Prefer text supplied by the owning module; do not scrape arbitrary URLs from Keyword.
2. Preserve original text and offsets; normalize only a derived search representation.
3. Detect language/script at document or segment level for mixed Arabic/English content.
4. Match exact preferred labels and aliases first using token boundaries and longest match.
5. Optionally return fuzzy or morphological candidates at lower confidence, with an explanation of the match method.
6. Return concept ID, surface text, field and span, language, method, confidence, and ambiguity candidates.
7. Keep matches as suggestions. An editor reviews them before they become authoritative Contents tags.

Analysis result example:

~~~json
{
  "source": { "module": "content", "type": "post", "id": "post_173" },
  "analyzerVersion": "keyword-text-v1",
  "mentions": [
    {
      "conceptId": "kw_tennis",
      "field": "body",
      "start": 122,
      "length": 6,
      "surface": "Tennis",
      "language": "en",
      "method": "exact-alias",
      "confidence": 0.99,
      "reviewState": "suggested"
    }
  ],
  "ambiguous": []
}
~~~

Define offsets explicitly; Unicode scalar-value offsets over the submitted field string are a sound API convention. Frontends using UTF-16 offsets should receive or calculate that representation explicitly. Track analyzer/ruleset version so updated language resources can be rerun without silently rewriting accepted tags.

### Planned SEO Analysis module

SEO Analysis can compare a Post's reviewed tags and target keywords with actual mentions, flag ambiguous references, and check title/summary coverage. It owns SEO scores/reports and proposes changes for editorial review. It must not treat keyword density as a ranking guarantee, stuff text automatically, or rewrite/publish content without the existing editorial approvals.

Prefer content outbox events for re-analysis after edits or publish. Store reports in SEO Analysis against stable source references and content/analyzer versions. Keep SEO optional: Contents remains usable without it.

## Suggested APIs and permissions

Prototype routes for later design review:

| Route | Purpose |
| --- | --- |
| GET /api/keywords?query=…&language=… | Search concepts and aliases for the current tenant. |
| GET /api/keywords/{id} | Read localized labels, relations, and visible backlink links. |
| POST /api/keywords | Create a draft concept. |
| POST /api/keywords/resolve | Resolve entered labels to candidates; return ambiguity instead of guessing. |
| POST /api/keywords/analyze-text | Return candidate mentions with offsets, language, evidence, and confidence. |
| POST /api/keywords/{id}/relations | Add an allowed relation after tenant/cycle validation. |

Suggested permissions: keywords.read, keywords.manage, keywords.merge, keywords.analyze. Backlink results must respect source-module visibility; draft or embargoed Content must not leak through Keyword search. Tags never grant access or create role/permission grants.

## Optional deployment and implementation order

Keyword is an optional runtime module: load it beside consumers in a single pool, place it in a dedicated pool when it needs independent scaling, or omit it for an ERP profile. Keep its database/provider and tenant scoping aligned with platform module conventions. Its backlink projection is rebuildable; concept IDs and assignments in consumers are not.

1. Settle the concept types, label policy, tenant/global catalog policy, and relation vocabulary.
2. Implement concept/label search, draft/active/retired lifecycle, merges, and audit.
3. Add versioned tag contracts and Contents assignments; then consume source events into the backlink index and test rebuild behavior.
4. Add bilingual exact matching and reviewed suggestions, measuring quality separately for Arabic and English.
5. Integrate the planned SEO Analysis module only after concept resolution and privacy rules are stable.

If this section grows, split it into **Concept model**, **Tag links and integrations**, and **Text analysis and SEO** pages under Modules/Keyword.
