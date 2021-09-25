import { App, Plugin, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';

interface CustomJSSettings {
  jsFiles: string;
  jsFolder: string;
}

const DEFAULT_SETTINGS: CustomJSSettings = {
  jsFiles: '',
  jsFolder: '',
}

export default class CustomJS extends Plugin {
  settings: CustomJSSettings;

  async onload() {
    console.log('Loading CustomJS');
    await this.loadSettings();
    // this.loadClasses();
    this.registerEvent(this.app.vault.on('modify', this.reloadIfNeeded, this))
    this.app.workspace.onLayoutReady(() => {
      this.loadClasses();
    })
    this.addSettingTab(new CustomJSSettingsTab(this.app, this));
  }

  onunload() {
    // @ts-ignore
    delete window.customJS;
  }

  async reloadIfNeeded(f: TAbstractFile) {
    if (f.path.endsWith('.js')) {
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

  async evalFile(f: string, customjs: any): Promise<void> {
    try {
      const file = await this.app.vault.adapter.read(f)
      const def = eval('(' + file + ')')
      const cls = new def()
      customjs[cls.constructor.name] = cls
    } catch (e) {
      console.error(`CustomJS couldn\'t import ${f}`)
      console.error(e)
    }
  }

  async loadClasses() {
    const customjs = {}

    // Load individual files
    if (this.settings.jsFiles != '') {
      const individualFiles = this.settings.jsFiles.split(',').map(s => s.trim()).sort();
      for (const f of individualFiles) {
        if (f != '' && f.endsWith('.js')) {
          await this.evalFile(f, customjs);
        }
      }
    }

    // load scripts in folder
    if (this.settings.jsFolder != '') {
      const prefix = this.settings.jsFolder;
      const files = this.app.vault.getFiles();
      const filesToLoad = files.filter(f => f.path.startsWith(prefix) && f.path.endsWith('.js'))
        .sort((a, b) => a.path.localeCompare(b.path));
      for (const f of filesToLoad) {
        if (f.path != '' && f.path.endsWith('.js')) {
          await this.evalFile(f.path, customjs);
        }
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

    // individual files
    new Setting(containerEl)
      .setName('Individual files')
      .setDesc('Comma-separated list of files to load')
      .addText(text => text
        .setPlaceholder('jsfile1.js,jsfile2.js')
        .setValue(this.plugin.settings.jsFiles)
        .onChange(async (value) => {
          this.plugin.settings.jsFiles = value;
          await this.plugin.saveSettings();
          await this.plugin.loadClasses();
        })
      );

    // folder
    new Setting(containerEl)
      .setName('Folder')
      .setDesc('Path to folder containing JS files to load')
      .addText(text => text
        .setPlaceholder('js/scripts')
        .setValue(this.plugin.settings.jsFolder)
        .onChange(async (value) => {
          this.plugin.settings.jsFolder = value;
          await this.plugin.saveSettings();
          await this.plugin.loadClasses();
        })
      );
  }
}
