export type Grammar = 'core' | 'dollar';
export interface TokenRead { tokens: string[]; order: string[]; unsupported: string[] }
export interface Difference { token: string; count: number }
export interface LineResult {
 line: number;
 status: 'pass' | 'mismatch' | 'unsupported';
 missing: Difference[];
 added: Difference[];
 orderMismatch: boolean;
 unsupported: string[];
 sourceTokens: string[];
 targetTokens: string[];
}
export interface AuditResult { sourceLines: number; targetLines: number; error: string; lines: LineResult[] }
const NAME = '[A-Za-z_][A-Za-z0-9_.-]*';
const brace = new RegExp('^\\{' + NAME + '\\}');
const doubleBrace = new RegExp('^\\{\\{' + NAME + '\\}\\}');
const dollarBrace = new RegExp('^\\$\\{' + NAME + '\\}');
const printf = new RegExp('^%(?:[1-9][0-9]*\\$[sd]|\\(' + NAME + '\\)s|[sd])');

/** Read only the declared grammar. Reject other brace and printf forms. */
export function readTokens(text: string, grammar: Grammar = 'core'): TokenRead {
 const out: TokenRead = { tokens: [], order: [], unsupported: [] };
 let i = 0;
 while (i < text.length) {
  const tail = text.slice(i);
  if (tail.startsWith('%%')) { i += 2; continue; }
  if (tail.startsWith('${') || tail.startsWith('{')) {
   const dollar = tail.startsWith('${');
   const match = (dollar ? dollarBrace : tail.startsWith('{{') ? doubleBrace : brace).exec(tail);
   if (match && (!dollar || grammar === 'dollar')) {
    out.tokens.push(match[0]); i += match[0].length; continue;
   }
   let depth = 0;
   let end = i + (dollar ? 1 : 0);
   for (; end < text.length; end++) {
    if (text[end] === '{') depth++;
    if (text[end] === '}' && --depth === 0) { end++; break; }
   }
   out.unsupported.push(text.slice(i, end)); i = end; continue;
  }
  if (text[i] === '}') { out.unsupported.push('}'); i++; continue; }
  if (text[i] === '%') {
   const match = printf.exec(tail);
   if (match) {
    out.tokens.push(match[0]);
    if (/^%[sd]$/.test(match[0])) out.order.push(match[0]);
    i += match[0].length; continue;
   }
   // A percent at the end or before a space is ordinary text.
   if (/^%[^\s]/.test(tail)) {
    const bad = /^%[^\s]*/.exec(tail)?.[0] ?? '%';
    out.unsupported.push(bad); i += bad.length; continue;
   }
  }
  i++;
 }
 return out;
}
function counts(tokens: string[]): Map<string, number> {
 const map = new Map<string, number>();
 for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
 return map;
}
function difference(a: string[], b: string[]): Difference[] {
 const left = counts(a), right = counts(b);
 return [...left].flatMap(([token, n]) => n > (right.get(token) ?? 0) ? [{ token, count: n - (right.get(token) ?? 0) }] : []);
}
/** One terminal newline is a file terminator. Interior blank lines are units. */
export function units(text: string): string[] {
 const normalized = text.replace(/\r\n?/g, '\n');
 if (!normalized) return [];
 return (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
}
export function audit(source: string, target: string, grammar: Grammar = 'core'): AuditResult {
 const s = units(source), t = units(target);
 const result: AuditResult = { sourceLines: s.length, targetLines: t.length, error: '', lines: [] };
 if (s.length !== t.length) {
  result.error = `Line count differs: source ${s.length}, target ${t.length}. No units compared.`;
  return result;
 }
 result.lines = s.map((line, i) => {
  const a = readTokens(line, grammar), b = readTokens(t[i] ?? '', grammar);
  const missing = difference(a.tokens, b.tokens), added = difference(b.tokens, a.tokens);
  const orderMismatch = a.order.join('|') !== b.order.join('|');
  const unsupported = [...a.unsupported.map(x => `Source: ${x}`), ...b.unsupported.map(x => `Target: ${x}`)];
  return { line: i + 1, status: unsupported.length ? 'unsupported' : missing.length || added.length || orderMismatch ? 'mismatch' : 'pass', missing, added, orderMismatch, unsupported, sourceTokens: a.tokens, targetTokens: b.tokens };
 });
 return result;
}
export interface Pair { source: string; target: string }
/** Declarations use vault paths, with one source | target pair per line. */
export function parsePairs(text: string): Pair[] {
 return text.split(/\r?\n/).filter(x => x.trim()).map((line, i) => {
  const parts = line.split('|').map(x => x.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts.some(x => !x.endsWith('.md') || /(^|[\\/])\.\.([\\/]|$)/.test(x))) throw new Error(`Declaration ${i + 1}: use source.md | target.md.`);
  return { source: parts[0], target: parts[1] };
 });
}
/** An empty folder or '/' (normalizePath of an empty field) selects the vault root. */
export function inFolder(path: string, folder: string): boolean {
 return !folder || folder === '/' || path.startsWith(folder + '/');
}
