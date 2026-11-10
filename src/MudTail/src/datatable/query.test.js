import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuery, createQuery, toPaginationFilterParams, toPaginationFilter, fromPagedResponse, matchesFilter } from './query.js';

// The same rows and expectations as the .NET FilterBy check, so client and server mode agree.
const COLUMNS = [
  { key: 'id', type: 'number' },
  { key: 'title' },
  { key: 'section', type: 'enum' },
  { key: 'author' },
  { key: 'views', type: 'number' },
  { key: 'featured', type: 'boolean' },
  { key: 'publishedOnUtc', type: 'date' },
  { key: 'rating', type: 'number' },
];
const ROWS = [
  { id: 1, title: 'Coastal rail line reopens', section: 'News', author: 'Lina Haddad', views: 1200, featured: true, publishedOnUtc: '2026-03-01T00:00:00Z', rating: null },
  { id: 2, title: 'Northbridge striker signs', section: 'Sport', author: 'Omar Saleh', views: 5400, featured: false, publishedOnUtc: '2026-05-09T00:00:00Z', rating: 4.5 },
  { id: 3, title: 'Gallery opens east wing', section: 'Culture', author: 'Mira Chen', views: 800, featured: false, publishedOnUtc: '2025-12-20T00:00:00Z', rating: 3.1 },
  { id: 4, title: 'Derby day: City v United', section: 'Sport', author: null, views: 9100, featured: true, publishedOnUtc: '2026-06-02T00:00:00Z', rating: 4.9 },
];

const f = (field, op, value = '') => ({ field, op, value });
const ids = (query) => applyQuery(ROWS, COLUMNS, { pageSize: 50, ...query }).items.map((r) => r.id);

const CASES = [
  ['contains, ignores case', [f('title', 'contains', 'GALLERY')], [3]],
  ['startswith / endswith', [f('title', 'startswith', 'derby'), f('title', 'endswith', 'united')], [4]],
  ['eq text ignores case', [f('author', 'eq', 'mira chen')], [3]],
  ['eq enum', [f('section', 'eq', 'sport')], [2, 4]],
  ['neq enum', [f('section', 'neq', 'Sport')], [1, 3]],
  ['in list', [f('section', 'in', 'News, Culture')], [1, 3]],
  ['gte number', [f('views', 'gte', '5400')], [2, 4]],
  ['range gt + lt', [f('views', 'gt', '1000'), f('views', 'lt', '9000')], [1, 2]],
  ['bool eq 1', [f('featured', 'eq', '1')], [1, 4]],
  ['date lt (UTC)', [f('publishedOnUtc', 'lt', '2026-01-01')], [3]],
  ['nullable number gte', [f('rating', 'gte', '4.5')], [2, 4]],
  ['isnull', [f('rating', 'isnull')], [1]],
  ['notnull text', [f('author', 'notnull')], [1, 2, 3]],
  ['unknown field ignored', [f('nope', 'eq', '1')], [1, 2, 3, 4]],
  ['bad value ignored', [f('views', 'gt', 'lots')], [1, 2, 3, 4]],
];

for (const [name, filters, expected] of CASES) {
  test(`filter: ${name}`, () => assert.deepEqual(ids({ filters }), expected));
}

test('keyword searches text columns only, ignoring case, and combines with filters', () => {
  assert.deepEqual(ids({ keyword: 'STRIKER' }), [2]);
  assert.deepEqual(ids({ keyword: '5400' }), [], 'numbers are not text columns');
  assert.deepEqual(ids({ keyword: 'i', filters: [f('section', 'eq', 'Sport')] }), [2, 4]);
  assert.deepEqual(ids({ keyword: 'chen', searchFields: ['title'] }), [], 'searchFields restricts the keyword');
});

test('orderBy: multiple fields, desc, empty values last, stable', () => {
  assert.deepEqual(ids({ orderBy: ['views desc'] }), [4, 2, 1, 3]);
  assert.deepEqual(ids({ orderBy: ['section', 'views desc'] }), [3, 1, 4, 2]);
  assert.deepEqual(ids({ orderBy: ['rating'] }), [3, 2, 4, 1]);
  assert.deepEqual(ids({ orderBy: ['unknown desc'] }), [1, 2, 3, 4]);
});

test('paging returns the page and the total', () => {
  const r = applyQuery(ROWS, COLUMNS, { pageNumber: 2, pageSize: 3, orderBy: ['id'] });
  assert.deepEqual(r.items.map((x) => x.id), [4]);
  assert.equal(r.totalCount, 4);
  assert.equal(createQuery({ pageSize: 1000 }).pageSize, 100, 'capped like the server');
});

test('query string matches [AsParameters] PaginationFilter', () => {
  const p = toPaginationFilterParams({
    keyword: ' rail ', pageNumber: 2, pageSize: 25, orderBy: ['Views desc', 'Title'],
    filters: [f('Views', 'gte', '1000'), f('Section', 'in', 'Sport,Culture')], searchFields: ['Title'],
  });
  assert.equal(p.toString(),
    'Keyword=rail&SearchFields=Title&PageNumber=2&PageSize=25&OrderBy=Views+desc&OrderBy=Title&Filters=Views%7Cgte%7C1000&Filters=Section%7Cin%7CSport%2CCulture');
});

test('JSON body and PagedResponse mapping', () => {
  assert.deepEqual(toPaginationFilter({ filters: [f('Views', 'gt', '5')] }),
    { keyword: null, searchFields: null, pageNumber: 1, pageSize: 10, orderBy: null, filters: ['Views|gt|5'] });
  assert.deepEqual(fromPagedResponse({ items: [1, 2], totalCount: 9, pageNumber: 1 }), { items: [1, 2], totalCount: 9 });
  assert.deepEqual(fromPagedResponse({ Items: [1], TotalCount: 3 }), { items: [1], totalCount: 3 });
});

test('matchesFilter: neq keeps empty values, like SQL NOT (x = v) on the server', () => {
  assert.equal(matchesFilter(null, f('a', 'neq', 'x')), true);
});
