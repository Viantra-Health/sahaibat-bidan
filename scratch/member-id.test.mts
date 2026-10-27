/** lib/memberId.ts — the id, from a path or a query. Pure logic, hook aside. */
const resolve = (params: any, search: Map<string, string>) => {
  const fromPath = String(params?.memberId ?? '').trim()
  if (fromPath) { try { return decodeURIComponent(fromPath) } catch { return fromPath } }
  return String(search.get('m') ?? '').trim()
}
let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${l}`) } else { fail++; console.log(`  FAIL  ${l} ${d}`) } }
const S = (o: Record<string,string>) => new Map(Object.entries(o))

ok('the path form resolves', resolve({ memberId: 'abc-123' }, S({})) === 'abc-123')
ok('the query form resolves', resolve({}, S({ m: 'abc-123' })) === 'abc-123')
/* The path is the more specific statement; a stale ?m= must not redirect a
   visit to another mother. */
ok('THE PATH WINS WHEN BOTH ARE PRESENT',
  resolve({ memberId: 'from-path' }, S({ m: 'from-query' })) === 'from-path')
ok('a percent-encoded id is decoded', resolve({ memberId: 'a%20b' }, S({})) === 'a b')
ok('a malformed escape does not throw', resolve({ memberId: 'a%' }, S({})) === 'a%')
ok('neither gives an empty string, not a crash', resolve({}, S({})) === '')
ok('whitespace is not an id', resolve({ memberId: '   ' }, S({ m: 'real' })) === 'real')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
