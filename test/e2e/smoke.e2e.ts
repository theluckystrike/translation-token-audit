import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId, reloadPlugin } from './load';
interface AuditPlugin {
 settings: {source:string;target:string;folder:string;declarations:string};
 modals: Set<{close():void}>;
 pro: { opts:{http:unknown}; refreshNow():Promise<void>; signOut():void };
 showAudit(folder?:boolean):void;
 saveSettings():Promise<void>;
}
async function closeModals():Promise<void> {
 await browser.executeObsidian(({app},id) => {
  const p=(app as unknown as {plugins:{plugins:Record<string,AuditPlugin>}}).plugins.plugins[id]!;
  for(const modal of [...p.modals]) modal.close();
 },pluginId);
}
async function setPro(on:boolean):Promise<void> {
 await browser.executeObsidian(async ({app},id,on) => {
  const p=(app as unknown as {plugins:{plugins:Record<string,AuditPlugin>}}).plugins.plugins[id]!;
  if(!on){p.pro.signOut();return;}
  p.pro.opts.http=async () => ({status:200,json:{data:{viewer:{login:'demo-reader'},user:{sponsorshipForViewerAsSponsor:{isActive:true,isOneTimePayment:false,tier:{name:'$5 a month',monthlyPriceInCents:500}}}}}});
  app.secretStorage.setSecret(`${id}-github-token`,'gho_'+'0'.repeat(36));
  await p.pro.refreshNow();
 },pluginId,on);
}
async function pair(source:string,target:string):Promise<void> {
 await closeModals();
 await obsidianPage.write('Source.md',source); await obsidianPage.write('Target.md',target);
 await browser.executeObsidian(({app},id) => {
  const p=(app as unknown as {plugins:{plugins:Record<string,AuditPlugin>}}).plugins.plugins[id]!;
  p.settings.source='Source.md';p.settings.target='Target.md';p.showAudit();
 },pluginId);
 await browser.$('.tta-input').waitForExist();
}
async function clickText(text:string):Promise<void> {
 await browser.waitUntil(async () => browser.execute(t => [...document.querySelectorAll<HTMLButtonElement>('.modal button')].some(b=>b.textContent===t),text),{timeout:10000,timeoutMsg:`No ${text} button`});
 await browser.execute(t => [...document.querySelectorAll<HTMLButtonElement>('.modal button')].find(b=>b.textContent===t)!.click(),text);
}
async function check():Promise<string> {
 await clickText('Check tokens');
 await browser.$('.tta-results').waitForExist({timeout:10000});
 return browser.$('.tta-results').getText();
}
describe('Translation token audit in Obsidian',function(){
 beforeEach(async()=>{await closeModals();await setPro(false);});
 afterEach(closeModals);
 it('reloads without console errors',async()=>{
  expect(await reloadPlugin(pluginId)).toEqual({enabled:true,reloaded:true,errors:[]});
 });
 it('chooses notes through the command and fuzzy picker',async()=>{
  await obsidianPage.write('Pick source.md','{name}');await obsidianPage.write('Pick target.md','{name}');
  await browser.executeObsidianCommand(`${pluginId}:check-pair`);
  await clickText('Choose source');
  const input=await browser.$('.prompt-input');await input.waitForExist();await input.setValue('Pick source');
  await browser.waitUntil(async()=>browser.execute(()=>[...document.querySelectorAll('.suggestion-item')].some(x=>x.textContent?.includes('Pick source.md'))),{timeout:10000});
  await browser.execute(()=>[...document.querySelectorAll<HTMLElement>('.suggestion-item')].find(x=>x.textContent?.includes('Pick source.md'))!.click());
  await clickText('Choose target');
  await browser.$('.prompt-input').setValue('Pick target');
  await browser.waitUntil(async()=>browser.execute(()=>[...document.querySelectorAll('.suggestion-item')].some(x=>x.textContent?.includes('Pick target.md'))),{timeout:10000});
  await browser.execute(()=>[...document.querySelectorAll<HTMLElement>('.suggestion-item')].find(x=>x.textContent?.includes('Pick target.md'))!.click());
  expect(await check()).toContain('1 passed');
 });
 it('shows name, count and order differences without changing text',async()=>{
  const s='{name}\n{n} {n}\n%s %d',t='{names}\n{n}\n%d %s';
  await pair(s,t); const text=await check();
  expect(text).toContain('Missing {name} × 1');expect(text).toContain('Added {names} × 1');expect(text).toContain('Missing {n} × 1');expect(text).toContain('Unnumbered type-order mismatch.');
  expect(await obsidianPage.read('Source.md')).toBe(s);expect(await obsidianPage.read('Target.md')).toBe(t);
 });
 it('opens the exact target line in the editor',async()=>{
  await pair('{a}\n{b}\n{c}','{a}\n{x}\n{c}');await check();await clickText('Open target line 2');
  await browser.waitUntil(async()=>browser.executeObsidian(({app})=>app.workspace.getActiveFile()?.path==='Target.md' && app.workspace.activeEditor?.editor?.getCursor().line===1),{timeout:10000,timeoutMsg:'Target cursor did not reach line 2'});
 });
 it('passes numbered movement and reads double braces once',async()=>{
  await pair('%1$s %2$d\n{{name}}\n100%%','%2$d %1$s\n{{name}}\n100%%');expect(await check()).toContain('3 passed, 0 need review');
  expect(await browser.execute(()=>document.querySelectorAll('[data-status="pass"]').length)).toBe(3);
 });
 it('stops for unequal line counts',async()=>{
  await pair('{a}\n{b}','{a}');expect(await check()).toContain('No units compared.');
  expect(await browser.execute(()=>document.querySelectorAll('.tta-line').length)).toBe(0);
 });
 it('marks ICU and Apple tokens unsupported',async()=>{
  await pair('{n, plural, one {item}}\n%@','{n, plural, one {item}}\n%@');await check();
  expect(await browser.execute(()=>document.querySelectorAll('[data-status="unsupported"]').length)).toBe(2);
 });
 it('gates the dollar grammar then checks it with simulated Pro',async()=>{
  await pair('${name}','${user}');
  await browser.$('.tta-input select').selectByAttribute('value','dollar');
  expect(await browser.$('.tta-input select').getValue()).toBe('core');
  await setPro(true);await browser.$('.tta-input select').selectByAttribute('value','dollar');
  const text=await check();expect(text).toContain('Missing ${name} × 1');expect(text).toContain('Added ${user} × 1');
 });
 it('checks declared folder pairs with simulated Pro',async()=>{
  await obsidianPage.write('Pairs/source.md','{name}');await obsidianPage.write('Pairs/target.md','{user}');
  await setPro(true);
  await browser.executeObsidian(({app},id)=>{
   const p=(app as unknown as {plugins:{plugins:Record<string,AuditPlugin>}}).plugins.plugins[id]!;
   p.settings.folder='Pairs';p.settings.declarations='Pairs/source.md | Pairs/target.md';
  },pluginId);
  await browser.executeObsidianCommand(`${pluginId}:check-folder`);
  expect(await check()).toContain('Pairs/source.md → Pairs/target.md');
 });
 it('persists selected paths through a reload',async()=>{
  await pair('{a}','{a}');await check();await closeModals();
  expect((await reloadPlugin(pluginId)).errors).toEqual([]);
  const paths=await browser.executeObsidian(({app},id)=>{
   const p=(app as unknown as {plugins:{plugins:Record<string,AuditPlugin>}}).plugins.plugins[id]!;
   return [p.settings.source,p.settings.target];
  },pluginId);
  expect(paths).toEqual(['Source.md','Target.md']);
 });
});
