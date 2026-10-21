import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type TranslationTokenAuditPlugin from './main';
import { helloSettingItems } from './hello/settings';
export interface AuditSettings { source: string; target: string; folder: string; declarations: string }
export const DEFAULT_SETTINGS: AuditSettings = { source: '', target: '', folder: '', declarations: '' };
export function normalizeSettings(raw: unknown): AuditSettings {
 const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
 return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [key, typeof value[key] === 'string' ? value[key] : fallback])) as unknown as AuditSettings;
}
export class TranslationTokenAuditSettingTab extends PluginSettingTab {
 constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], private auditPlugin: TranslationTokenAuditPlugin) { super(app, auditPlugin); }
 getSettingDefinitions(): SettingDefinitionItem[] {
 	// The product rows, then the "More from NoteMods" card (packages/hello).
 	return [...this.productSettingDefinitions(), ...helloSettingItems()];
 }

 productSettingDefinitions(): SettingDefinitionItem[] {
  return [
   { name: 'Local checks', desc: 'Choose notes with the Check translated line pairs command. The plugin reads note text and does not change it.' },
   ...(this.auditPlugin.pro ? sponsorsSettingItems(this.auditPlugin.pro, PRO_UI) : []),
  ];
 }
}
