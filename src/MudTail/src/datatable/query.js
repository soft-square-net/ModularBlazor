// DataTable query: one shape for client-side and server-side data.
//
//   { keyword, searchFields, filters: [{ field, op, value }], orderBy: ['views desc', 'title'], pageNumber, pageSize }
//
// applyQuery() runs it in the browser; toPaginationFilterParams() turns it into the query string that the .NET
// API binds with [AsParameters] PaginationFilter and evaluates with Ardalis specifications
// (Query.SearchBy(filter) + Query.PaginateBy(filter)). The rules match on both sides:
//   - keyword: case-insensitive "contains" over the searchable (text) columns
//   - filters: all must match; text comparisons ignore case
//   - orderBy: "field" or "field desc", in order
//   - paging: 1-based pageNumber, pageSize capped at 100 on the server

export const OPERATORS = Object.freeze({
  eq: { label: 'equals', symbol: '=' },
  neq: { label: 'is not', symbol: '≠' },
  contains: { label: 'contains', symbol: '∋' },
  startswith: { label: 'starts with', symbol: 'starts' },
  endswith: { label: 'ends with', symbol: 'ends' },
  gt: { label: 'greater than', symbol: '>' },
  gte: { label: 'at least', symbol: '≥' },
  lt: { label: 'less than', symbol: '<' },
  lte: { label: 'at most', symbol: '≤' },
  in: { label: 'is one of', symbol: 'in' },
  isnull: { label: 'is empty', symbol: '∅' },
  notnull: { label: 'is not empty', symbol: '≠ ∅' },
});

/** Operators that make sense for each column type (the first is the default). */
export const OPERATORS_BY_TYPE = Object.freeze({
  string: ['contains', 'eq', 'neq', 'startswith', 'endswith', 'isnull', 'notnull'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isnull', 'notnull'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'isnull', 'notnull'],
  boolean: ['eq'],
  enum: ['eq', 'neq', 'in'],
});

export const MAX_PAGE_SIZE = 100;

/** A complete query with defaults. */
export function createQuery(partial = {}) {
  return {
    keyword: partial.keyword ?? '',
    searchFields: partial.searchFields ?? null,
    filters: [...(partial.filters ?? [])],
    orderBy: [...(partial.orderBy ?? [])],
    pageNumber: Math.max(1, partial.pageNumber ?? 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, partial.pageSize ?? 10)),
  };
}

/** Reads a value by key, allowing "a.b" paths. */
export function getValue(row, key) {
  if (row == null || !key) return undefined;
  if (!key.includes('.')) return row[key];
  return key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), row);
}

const isEmpty = (v) => v === null || v === undefined || v === '';
const lower = (v) => String(v).toLowerCase();

function toComparable(value, type) {
  if (isEmpty(value)) return null;
  if (type === 'number') { const n = Number(value); return Number.isFinite(n) ? n : null; }
  if (type === 'date') {
    // Plain dates ("2026-01-01") are UTC midnight, as on the server.
    const t = value instanceof Date ? value.getTime() : Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00Z` : value);
    return Number.isFinite(t) ? t : null;
  }
  if (type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return null;
  }
  return lower(value);
}

/** Does one row value pass one filter? Same semantics as the .NET FilterBy. */
export function matchesFilter(raw, filter, type = 'string') {
  const { op } = filter;
  if (op === 'isnull') return isEmpty(raw);
  if (op === 'notnull') return !isEmpty(raw);

  if (op === 'in') {
    return String(filter.value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      .some((v) => matchesFilter(raw, { op: 'eq', value: v }, type));
  }

  const value = toComparable(raw, type);
  const target = toComparable(filter.value, type);
  if (target === null) return true; // an unusable filter value is ignored, like on the server

  switch (op) {
    case 'contains': return type === 'string' ? value !== null && value.includes(target) : true;
    case 'startswith': return type === 'string' ? value !== null && value.startsWith(target) : true;
    case 'endswith': return type === 'string' ? value !== null && value.endsWith(target) : true;
    case 'eq': return value !== null && value === target;
    case 'neq': return value === null || value !== target;
    case 'gt': return value !== null && value > target;
    case 'gte': return value !== null && value >= target;
    case 'lt': return value !== null && value < target;
    case 'lte': return value !== null && value <= target;
    default: return true;
  }
}

function compareValues(a, b, type) {
  const x = toComparable(a, type);
  const y = toComparable(b, type);
  if (x === y) return 0;
  if (x === null) return 1; // empty values last
  if (y === null) return -1;
  if (typeof x === 'string') return x.localeCompare(y);
  return x < y ? -1 : 1;
}

/** Parses "field desc" → { field, desc }. */
export function parseOrder(clause) {
  const [field, dir] = String(clause).trim().split(/\s+/);
  return { field, desc: /^desc$/i.test(dir ?? '') };
}

/**
 * Runs a query over rows in the browser. `columns` tell types and which columns the keyword searches.
 * Returns { items, totalCount }.
 */
export function applyQuery(rows, columns, query) {
  const q = createQuery(query);
  const byField = new Map(columns.map((c) => [c.field ?? c.key, c]));
  const typeOf = (field) => byField.get(field)?.type ?? 'string';
  const keyOf = (field) => byField.get(field)?.key ?? field;

  let result = rows;

  const keyword = q.keyword.trim().toLowerCase();
  if (keyword) {
    const searchable = columns.filter((c) => (c.searchable ?? (c.type ?? 'string') === 'string')
      && (!q.searchFields?.length || q.searchFields.some((f) => lower(f) === lower(c.field ?? c.key))));
    result = result.filter((row) => searchable.some((c) => {
      const v = getValue(row, c.key);
      return !isEmpty(v) && lower(v).includes(keyword);
    }));
  }

  for (const f of q.filters) {
    if (!byField.has(f.field)) continue; // unknown fields are ignored, like on the server
    result = result.filter((row) => matchesFilter(getValue(row, keyOf(f.field)), f, typeOf(f.field)));
  }

  const orders = q.orderBy.map(parseOrder).filter((o) => byField.has(o.field));
  if (orders.length) {
    result = result.map((row, i) => ({ row, i })).sort((a, b) => {
      for (const o of orders) {
        const c = compareValues(getValue(a.row, keyOf(o.field)), getValue(b.row, keyOf(o.field)), typeOf(o.field));
        if (c) return o.desc ? -c : c;
      }
      return a.i - b.i; // stable
    }).map((x) => x.row);
  }

  const totalCount = result.length;
  const start = (q.pageNumber - 1) * q.pageSize;
  return { items: result.slice(start, start + q.pageSize), totalCount };
}

/** The filters as the .NET API expects them: "Field|op|value". */
export function toFilterStrings(filters) {
  return (filters ?? []).map((f) => `${f.field}|${f.op}|${f.value ?? ''}`);
}

/**
 * The query string for an endpoint that takes [AsParameters] PaginationFilter:
 *   ?Keyword=…&SearchFields=…&PageNumber=1&PageSize=10&OrderBy=Views%20desc&Filters=Views%7Cgte%7C1000
 */
export function toPaginationFilterParams(query) {
  const q = createQuery(query);
  const p = new URLSearchParams();
  if (q.keyword.trim()) p.set('Keyword', q.keyword.trim());
  (q.searchFields ?? []).forEach((f) => p.append('SearchFields', f));
  p.set('PageNumber', String(q.pageNumber));
  p.set('PageSize', String(q.pageSize));
  q.orderBy.forEach((o) => p.append('OrderBy', o));
  toFilterStrings(q.filters).forEach((f) => p.append('Filters', f));
  return p;
}

/** The same query as the JSON body of a PaginationFilter (for POST endpoints or a Blazor HttpClient). */
export function toPaginationFilter(query) {
  const q = createQuery(query);
  return {
    keyword: q.keyword.trim() || null,
    searchFields: q.searchFields?.length ? q.searchFields : null,
    pageNumber: q.pageNumber,
    pageSize: q.pageSize,
    orderBy: q.orderBy.length ? q.orderBy : null,
    filters: q.filters.length ? toFilterStrings(q.filters) : null,
  };
}

/** Reads a PagedResponse<T> (camel or Pascal case) into { items, totalCount }. */
export function fromPagedResponse(json) {
  return {
    items: json?.items ?? json?.Items ?? [],
    totalCount: json?.totalCount ?? json?.TotalCount ?? (json?.items ?? json?.Items ?? []).length,
  };
}
