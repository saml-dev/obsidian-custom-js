import { App, Plugin, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';
// @ts-ignore
import compareVersions from 'compare-versions';

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
    this.registerEvent(this.app.vault.on('modify', this.reloadIfNeeded, this))
    // @ts-ignore
    window.forceLoadCustomJS = async () => {
      await this.loadClasses();
    };
    this.app.workspace.onLayoutReady(() => {
      this.loadClasses();
    });
    this.addSettingTab(new CustomJSSettingsTab(this.app, this));
  }

  onunload() {
    // @ts-ignore
    delete window.customJS;
  }

  async reloadIfNeeded(f: TAbstractFile) {
    if (f.path.endsWith('.js')) {
      await this.loadClasses();

      // reload dataviewjs blocks if installed & version >= 0.4.11
      if (this.app.plugins.enabledPlugins.has("dataview")) {
        // @ts-ignore
        const version = this.app.plugins.plugins?.dataview?.manifest.version;
        if (compareVersions(version, '0.4.11') < 0) return;

        this.app.plugins.plugins.dataview?.api?.index?.touch();
      }
    }
  }

  async loadSettings() {
    const settings = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async evalFile(f: string): Promise<void> {
    try {
      const file = await this.app.vault.adapter.read(f)
      const def = eval('(' + file + ')')
      const cls = new def()
      // @ts-ignore
      window.customJS[cls.constructor.name] = cls 
    } catch (e) {
      console.error(`CustomJS couldn\'t import ${f}`)
      console.error(e)
    }
  }

  async loadClasses() {
    // @ts-ignore
    window.customJS = {}
    const filesToLoad = [];

    // Get individual paths
    if (this.settings.jsFiles != '') {
      const individualFiles = this.settings.jsFiles.split(',').map(s => s.trim()).sort();
      for (const f of individualFiles) {
        if (f != '' && f.endsWith('.js')) {
          filesToLoad.push(f)
        }
      }
    }

    // Get paths in folder
    if (this.settings.jsFolder != '') {
      const prefix = this.settings.jsFolder;
      const files = this.app.vault.getFiles();
      const scripts = files.filter(f => f.path.startsWith(prefix) && f.path.endsWith('.js'));

      for (const s of scripts) {
        if (s.path != '' && s.path.endsWith('.js')) {
          filesToLoad.push(s.path);
        }
      }
    }

    this.sortByFileName(filesToLoad);

    // load all scripts
    for (const f of filesToLoad) {
      await this.evalFile(f);
    }
  }

  sortByFileName(files: string[]) {
    files.sort((a, b) => {
      const nameA = a.split('/').last()
      const nameB = b.split('/').last()
      return nameA.localeCompare(nameB);
    })
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
