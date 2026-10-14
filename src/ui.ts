import { Modal, Notice, Setting } from 'obsidian';
import type TranslationTokenAuditPlugin from './main';
import type { PairReport } from './main';
import { isPro } from './pro';
import type { Grammar } from './audit';
import type { AuditSettings } from './settings';

export class AuditModal extends Modal {
 grammar: Grammar = 'core';
 /** Dialog inputs. They go into the saved settings only after a completed check. */
 readonly draft: AuditSettings;
 constructor(private plugin: TranslationTokenAuditPlugin, private folderMode = false) { super(plugin.app); this.draft = { ...plugin.settings }; }
 onOpen(): void { this.plugin.modals.add(this); this.render(); }
 onClose(): void { this.plugin.modals.delete(this); this.contentEl.empty(); }
 render(): void {
  this.setTitle(this.folderMode ? 'Check declared pairs in a folder (Pro)' : 'Translation token audit');
  const el = this.contentEl; el.empty(); el.addClass('tta-input');
  el.createEl('p', { text: 'Use one translation unit per physical line. Checks read notes without changing them.' });
  if (this.folderMode) {
   new Setting(el).setName('Folder (pro)').setDesc('Vault folder path. Leave empty for the vault root. Both notes must be inside it.')
    .addText(t => t.setValue(this.draft.folder).setPlaceholder('Translations').onChange(v => { this.draft.folder = v; }));
   new Setting(el).setName('Declared pairs (pro)').setDesc('One source.md | target.md pair per line. Use full vault paths.')
    .addTextArea(t => t.setValue(this.draft.declarations).setPlaceholder('Translations/source.md | Translations/target.md').onChange(v => { this.draft.declarations = v; }));
  } else {
   for (const key of ['source', 'target'] as const) {
    new Setting(el).setName(key === 'source' ? 'Source note' : 'Target note').setDesc(this.draft[key] || 'Choose a Markdown note.')
     .addButton(b => b.setButtonText(key === 'source' ? 'Choose source' : 'Choose target').onClick(() => {
      this.plugin.chooseNote(`Choose ${key} note`, file => { this.draft[key] = file.path; this.render(); });
     }));
   }
   new Setting(el).setName('Use the active note as source').addButton(b => b.setButtonText('Use active note').onClick(() => {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension === 'md') { this.draft.source = file.path; this.render(); }
    else new Notice('Open a Markdown note first.');
   }));
  }
  new Setting(el).setName('Placeholder grammar').setDesc('Core: {name}, {{name}}, %s, %d, %1$s, %2$d and %(name)s. Dollar grammar adds ${name}.')
   .addDropdown(d => d.addOption('core', 'Core').addOption('dollar', 'Core plus dollar braces (pro)').setValue(this.grammar).onChange(v => {
    if (v === 'dollar' && !this.plugin.requirePro()) { this.grammar = 'core'; this.render(); return; }
    this.grammar = v === 'dollar' ? 'dollar' : 'core';
   }));
  new Setting(el).setName('Run a local check').addButton(b => b.setButtonText('Check tokens').setCta().onClick(async () => {
   b.setDisabled(true);
   try {
    if (this.folderMode && !isPro()) { this.plugin.requirePro(); return; }
    const reports = this.folderMode
     ? await this.plugin.checkFolder(this.draft.folder, this.draft.declarations, this.grammar)
     : [await this.plugin.checkPair({ source: this.draft.source, target: this.draft.target }, this.grammar)];
    const { settings } = this.plugin, d = this.draft;
    if (this.folderMode) { settings.folder = d.folder; settings.declarations = d.declarations; }
    else { settings.source = d.source; settings.target = d.target; }
    await this.plugin.saveSettings();
    this.close(); this.plugin.showReports(reports, this.grammar);
   } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
   finally { b.setDisabled(false); }
  }));
 }
}
export class ResultModal extends Modal {
 constructor(private plugin: TranslationTokenAuditPlugin, private reports: PairReport[], private grammar: Grammar) { super(plugin.app); }
 onOpen(): void {
  this.plugin.modals.add(this); this.setTitle('Translation token results');
  const el = this.contentEl; el.addClass('tta-results');
  el.createEl('p', { cls: 'tta-grammar', text: `Grammar: ${this.grammar === 'core' ? 'Core' : 'Core plus dollar braces (Pro)'}. ${this.reports.length} note pair(s).` });
  for (const report of this.reports) {
   const section = el.createDiv({ cls: 'tta-pair' });
   section.createEl('h3', { text: `${report.pair.source} → ${report.pair.target}` });
   if (report.error || report.result?.error) { section.createEl('p', { cls: 'tta-error', text: report.error || report.result?.error }); continue; }
   const result = report.result;
   if (!result) continue;
   const passed = result.lines.filter(l => l.status === 'pass').length;
   section.createEl('p', { cls: 'tta-summary', text: `${result.lines.length} units: ${passed} passed, ${result.lines.length - passed} need review.` });
   for (const row of result.lines) {
    const item = section.createDiv({ cls: `tta-line tta-${row.status}` });
    item.dataset.line = String(row.line); item.dataset.status = row.status;
    item.createEl('strong', { text: `Line ${row.line} · ${row.status === 'pass' ? 'Passed' : row.status === 'unsupported' ? 'Unsupported syntax' : 'Mismatch'}` });
    for (const [name, values] of [['Missing', row.missing], ['Added', row.added]] as const) {
     for (const value of values) item.createEl('p', { text: `${name} ${value.token} × ${value.count}` });
    }
    if (row.orderMismatch) item.createEl('p', { text: 'Unnumbered type-order mismatch.' });
    for (const bad of row.unsupported) item.createEl('p', { text: bad });
    item.createEl('p', { cls: 'tta-tokens', text: `Source tokens: ${row.sourceTokens.join(' · ') || '(none)'}\nTarget tokens: ${row.targetTokens.join(' · ') || '(none)'}` });
    const button = item.createEl('button', { text: `Open target line ${row.line}`, cls: 'tta-open' });
    button.addEventListener('click', () => {
     this.close(); void this.plugin.openTarget(report.pair.target, row.line).catch(() => new Notice('Could not open the target line.'));
    });
   }
  }
 }
 onClose(): void { this.plugin.modals.delete(this); this.contentEl.empty(); }
}
