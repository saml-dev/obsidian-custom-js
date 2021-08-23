import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { readFileSync } from 'fs';

interface MyPluginSettings {
  jsFiles: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  jsFiles: '',
}

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    console.log('loading customjs plugin');
    await this.loadSettings();
    console.log(this.settings)
    await this.loadFunctions();

    this.addSettingTab(new SampleSettingTab(this.app, this));
  }

  onunload() {
    console.log('unloading plugin');
  }

  async loadSettings() {
    const settings = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async loadFunctions() {
    const files = this.settings.jsFiles.split(',');
    files.forEach(f => {
      try {
        if (f != '' && f.includes('.js')) {
          // @ts-ignore
          const path = this.app.vault.adapter.basePath + '/' + f
          // const imp = require(path)
          const file = readFileSync(path, 'utf-8')
          const o = eval(file);
          // const fn = f.split('/').pop().split('.')[0]
          Object.keys(o).forEach(key => {
            // @ts-ignore
            this[key] = o[key]
          })
        }
      } catch (e) {
        console.error(`CustomJS couldn\'t import ${f}`)
        // console.error(e)
      }
    })
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
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
          console.log(this.app.vault.getFiles())
          this.plugin.settings.jsFiles = value;
          await this.plugin.saveSettings();
          await this.plugin.loadFunctions();
        })
      );
  }
}
