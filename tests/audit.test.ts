import { describe, expect, it } from 'vitest';
import vectors from './vectors/translation-token-audit.json';
import { audit, readTokens, parsePairs, inFolder, type Grammar } from '../src/audit';
describe('golden acceptance vectors', () => {
 it('has at least 20 cases', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(20));
 for (const c of vectors.cases) it(c.name, () => {
  const [a,b,g] = c.args as [string,string,Grammar?];
  expect(audit(a,b,g)).toEqual(c.expected);
 });
});
describe('token and declaration boundaries', () => {
 it('reads a double brace once', () => expect(readTokens('{{name}}').tokens).toEqual(['{{name}}']));
 it('counts dangerous object names with Map', () => {
  expect(audit('{__proto__} {constructor}', '{__proto__}').lines[0]?.missing).toEqual([{token:'{constructor}',count:1}]);
 });
 it('keeps numbered repetition counts', () => {
  expect(audit('%1$s %1$s', '%1$s').lines[0]?.missing).toEqual([{token:'%1$s',count:1}]);
 });
 it('parses declared pairs with spaces in paths', () => {
  expect(parsePairs('Folder/Source note.md | Folder/Target note.md\n')).toEqual([{source:'Folder/Source note.md',target:'Folder/Target note.md'}]);
 });
 it('rejects traversal and broken declarations', () => {
  for (const text of ['a.md', 'a.md | ', '../a.md | b.md','a.md | b.md | c.md','a.txt | b.md']) expect(() => parsePairs(text)).toThrow();
 });
 it('uses a folder boundary and includes subfolders', () => {
  expect(inFolder('Trans/a.md','Trans')).toBe(true);
  expect(inFolder('Trans/Sub/a.md','Trans')).toBe(true);
  expect(inFolder('Translations/a.md','Trans')).toBe(false);
  expect(inFolder('a.md','')).toBe(true);
 });
 it('treats the normalized vault root as the root folder', () => {
  // Obsidian normalizePath('') returns '/'. The empty folder field must select the vault root.
  expect(inFolder('a.md','/')).toBe(true);
  expect(inFolder('Trans/a.md','/')).toBe(true);
 });
});
