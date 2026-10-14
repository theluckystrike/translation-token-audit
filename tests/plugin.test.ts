import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import TranslationTokenAuditPlugin from '../src/main';
import { SPONSORS, bindPro, isPro, resetPro, onProChange } from '../src/pro';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import { AuditModal } from '../src/ui';
import manifest from '../manifest.json';
afterEach(resetPro);
function plugin() {
 const app = App.createConfigured__({ files: { 'Trans/source.md':'Hello {name}.', 'Trans/target.md':'Bonjour {name}.' } });
 return new TranslationTokenAuditPlugin(app as never,manifest as never);
}
function manager(on=true) { return { isPro: () => on, onChange: () => () => undefined }; }
describe('plugin local checks and Pro gates', () => {
 it('checks notes without Pro or writes', async () => {
  const p=plugin();
  const read=vi.spyOn(p.app.vault,'cachedRead');
  const save=vi.spyOn(p,'saveData');
  const r=await p.checkPair({source:'Trans/source.md',target:'Trans/target.md'});
  expect(r.result?.lines[0]?.status).toBe('pass'); expect(read).toHaveBeenCalledTimes(2); expect(save).not.toHaveBeenCalled();
 });
 it('reports a missing note', async () => {
  const r=await plugin().checkPair({source:'missing.md',target:'Trans/target.md'});
  expect(r.result).toBeNull();expect(r.error).toContain('missing');
 });
 it('blocks the dollar grammar before reading a note', async () => {
  const p=plugin(),read=vi.spyOn(p.app.vault,'cachedRead');
  expect((await p.checkPair({source:'Trans/source.md',target:'Trans/target.md'},'dollar')).result).toBeNull();
  expect(read).not.toHaveBeenCalled();
 });
 it('blocks folder checks without Pro', async () => {
  const p=plugin(),read=vi.spyOn(p.app.vault,'cachedRead');
  expect(await p.checkFolder('Trans','Trans/source.md | Trans/target.md')).toEqual([]);expect(read).not.toHaveBeenCalled();
 });
 it('checks declared folder pairs with Pro', async () => {
  bindPro(manager() as never);
  const r=await plugin().checkFolder('Trans','Trans/source.md | Trans/target.md');
  expect(r).toHaveLength(1);expect(r[0]?.result?.lines[0]?.status).toBe('pass');
 });
 it('rejects outside-folder paths before reads', async () => {
  bindPro(manager() as never); const p=plugin(),read=vi.spyOn(p.app.vault,'cachedRead');
  await expect(p.checkFolder('Trans','Other/source.md | Trans/target.md')).rejects.toThrow('outside');expect(read).not.toHaveBeenCalled();
 });
 it('rejects a blank folder declaration', async () => {
  bindPro(manager() as never); await expect(plugin().checkFolder('','')).rejects.toThrow('at least one');
 });
 it('keeps dialog edits out of saved settings until a check completes', () => {
  const p=plugin(); p.settings.folder='Trans';
  const m=new AuditModal(p,true); m.draft.folder='Other'; m.draft.source='x.md'; m.close();
  expect(p.settings).toEqual({...DEFAULT_SETTINGS,folder:'Trans'});
 });
 it('repairs saved input types', () => {
  expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  expect(normalizeSettings({source:5,target:'t.md',folder:false,declarations:[]})).toEqual({...DEFAULT_SETTINGS,target:'t.md'});
 });
 it('uses the required sponsor prices and client id', () => {
  expect(SPONSORS).toMatchObject({clientId:'Ov23lic5UPGPZqhBlBGg',minMonthlyUsd:5,oneTimeUsd:15,oneTimeMonths:0,sponsorLogin:'theluckystrike'});
 });
 it('unbinds Pro and its listeners', () => {
  const cb=vi.fn(),off=onProChange(cb); bindPro(manager() as never);expect(isPro()).toBe(true);off();resetPro();expect(isPro()).toBe(false);
 });
});
