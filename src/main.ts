import { FuzzySuggestModal, MarkdownView, Modal, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { audit, inFolder, parsePairs, type AuditResult, type Grammar, type Pair } from './audit';
import { SPONSORS, bindPro, isPro, resetPro, proNotice, proText } from './pro';
import { DEFAULT_SETTINGS, TranslationTokenAuditSettingTab, normalizeSettings, type AuditSettings } from './settings';
import { AuditModal, ResultModal } from './ui';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export interface PairReport { pair: Pair; result: AuditResult | null; error: string }
export default class TranslationTokenAuditPlugin extends Plugin {
 settings: AuditSettings = { ...DEFAULT_SETTINGS };
 pro: SponsorsManager | null = null;
 readonly modals = new Set<Modal>();
 async onload(): Promise<void> {
   // First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
   setupHello(this, WHATS_NEW);
  this.settings = normalizeSettings(await this.loadData() as unknown);
  const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
  pro.init(); this.pro = pro; bindPro(pro);
  const tab = new TranslationTokenAuditSettingTab(this.app, this);
  this.addSettingTab(tab);
  this.register(pro.onChange(() => tab.update()));
  this.addCommand({ id: 'check-pair', name: 'Check translated line pairs', callback: () => this.showAudit() });
  this.addCommand({ id: 'check-folder', name: 'Check declared pairs in a folder (pro)', callback: () => {
   if (this.requirePro()) this.showAudit(true);
  } });
  this.app.workspace.onLayoutReady(() => {
   void pro.refresh();
   this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
  });
 }
 onunload(): void { for (const modal of [...this.modals]) modal.close(); resetPro(); }
 requirePro(): boolean {
  if (isPro()) return true;
  proNotice('This is a pro feature.');
  return false;
 }
 async saveSettings(): Promise<void> { await this.saveData(this.settings); }
 showAudit(folder = false): void { new AuditModal(this, folder).open(); }
 chooseNote(title: string, onChoose: (file: TFile) => void): void {
  new NotePicker(this, title, onChoose).open();
 }
 file(path: string): TFile | null {
  const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
  return file instanceof TFile && file.extension === 'md' ? file : null;
 }
 async checkPair(pair: Pair, grammar: Grammar = 'core'): Promise<PairReport> {
  if (grammar !== 'core' && !this.requirePro()) return { pair, result: null, error: 'Dollar-brace grammar requires Pro.' };
  const source = this.file(pair.source), target = this.file(pair.target);
  if (!source || !target) return { pair, result: null, error: 'Source or target note is missing. Choose two Markdown notes.' };
  try {
   const [a, b] = await Promise.all([this.app.vault.cachedRead(source), this.app.vault.cachedRead(target)]);
   return { pair, result: audit(a, b, grammar), error: '' };
  } catch (e) { return { pair, result: null, error: `Could not read notes: ${e instanceof Error ? e.message : String(e)}` }; }
 }
 async checkFolder(folder: string, declarations: string, grammar: Grammar = 'core'): Promise<PairReport[]> {
  if (!this.requirePro()) return [];
  const root = normalizePath(folder.trim());
  const pairs = parsePairs(declarations).map(p => ({ source: normalizePath(p.source), target: normalizePath(p.target) }));
  if (!pairs.length) throw new Error('Declare at least one source | target pair.');
  if (pairs.some(p => !inFolder(p.source, root) || !inFolder(p.target, root))) throw new Error('A declared note is outside the selected folder. No pairs checked.');
  const reports: PairReport[] = [];
  for (const pair of pairs) {
   if (!isPro()) throw new Error(proText('Pro is off. The folder check stopped.'));
   reports.push(await this.checkPair(pair, grammar));
  }
  return reports;
 }
 showReports(reports: PairReport[], grammar: Grammar = 'core'): void { new ResultModal(this, reports, grammar).open(); }
 async openTarget(path: string, line: number): Promise<void> {
  const file = this.file(path);
  if (!file) { new Notice('The target note is missing.'); return; }
  const leaf = this.app.workspace.getLeaf(false);
  await leaf.openFile(file, { active: true, state: { mode: 'source' } });
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== file.path) { new Notice('Could not open the target editor.'); return; }
  const pos = { line: Math.max(0, Math.min(line - 1, view.editor.lineCount() - 1)), ch: 0 };
  view.editor.setCursor(pos);
  view.editor.scrollIntoView({ from: pos, to: pos }, true);
 }
}
class NotePicker extends FuzzySuggestModal<TFile> {
 constructor(private auditPlugin: TranslationTokenAuditPlugin, title: string, private choose: (file: TFile) => void) {
  super(auditPlugin.app); this.setPlaceholder(title);
 }
 async onOpen(): Promise<void> { await super.onOpen(); this.auditPlugin.modals.add(this); }
 onClose(): void { super.onClose(); this.auditPlugin.modals.delete(this); }
 getItems(): TFile[] { return this.app.vault.getFiles().filter(f => f.extension === 'md'); }
 getItemText(file: TFile): string { return file.path; }
 onChooseItem(file: TFile): void { this.choose(file); }
}
