import { App, Plugin, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';

interface CustomJSSettings {
  jsFiles: string;
}

const DEFAULT_SETTINGS: CustomJSSettings = {
  jsFiles: '',
}

export default class CustomJS extends Plugin {
  settings: CustomJSSettings;

  async onload() {
    console.log('Loading CustomJS');
    await this.loadSettings();
    this.loadClasses();
    this.registerEvent(this.app.vault.on('modify', this.reloadIfNeeded, this))
    this.addSettingTab(new CustomJSSettingsTab(this.app, this));
  }

  onunload() {
    // @ts-ignore
    delete window.customJS;
  }

  async reloadIfNeeded(f: TAbstractFile) {
    if (this.settings.jsFiles.includes(f.path)) {
      this.loadClasses()
    }
  }

  async loadSettings() {
    const settings = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async loadClasses() {
    const customjs = {}
    const files = this.settings.jsFiles.split(',').map(s => s.trim());
    for (const f of files) {
      try {
        if (f != '' && f.includes('.js')) {
          const file = await this.app.vault.adapter.read(f)
          const def = eval('(' + file + ')')
          const cls = new def()
          // @ts-ignore
          customjs[cls.constructor.name] = cls
        }
      } catch (e) {
        console.error(`CustomJS couldn\'t import ${f}`)
        console.error(e)
      }
    }
    // @ts-ignore
    window.customJS = customjs;
  }
}

class CustomJSSettingsTab extends PluginSettingTab {
  plugin: CustomJS;

  constructor(app: App, plugin: CustomJS) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'CustomJS' });

    new Setting(containerEl)
      .setName('Files to load')
      .setDesc('Comma-separated list of files to import')
      .addText(text => text
        .setPlaceholder('jsfile1.js,jsfile2.js')
        .setValue(this.plugin.settings.jsFiles)
        .onChange(async (value) => {
          this.plugin.settings.jsFiles = value;
          await this.plugin.saveSettings();
          await this.plugin.loadClasses();
        })
      );
  }
}
