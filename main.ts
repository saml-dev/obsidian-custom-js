import { App, Plugin, PluginSettingTab, Setting, TAbstractFile, FuzzySuggestModal, FuzzyMatch, Notice } from 'obsidian';
import * as obsidian from 'obsidian';
import * as compareVersionsLib from 'compare-versions';

const compareVersions = compareVersionsLib as (firstVersion: string, secondVersion: string) => 1 | 0 | -1

interface CustomJSSettings {
  jsFiles: string;
  jsFolder: string;
  startupScriptNames: string;
  registeredCustomScriptNames: string[];
}

const DEFAULT_SETTINGS: CustomJSSettings = {
  jsFiles: '',
  jsFolder: '',
  startupScriptNames: 'Startup',
  registeredCustomScriptNames: []
}

interface Invocable {
  invoke: () => Promise<void>;
}

function isInvocable(x: any): x is Invocable {
  return typeof x?.invoke === 'function';
}

export default class CustomJS extends Plugin {
  settings: CustomJSSettings;

  async onload() {
    console.log('Loading CustomJS');
    await this.loadSettings();
    this.registerEvent(this.app.vault.on('modify', this.reloadIfNeeded, this))
    window.forceLoadCustomJS = async () => {
      await this.loadClasses();
    };
    this.app.workspace.onLayoutReady(() => {
      this.loadClasses();
    });
    this.addSettingTab(new CustomJSSettingsTab(this.app, this));

    this.addCommand({
      id: "invokeScript",
      name: "Invoke Script",
      callback: this.selectAndInvokeScript.bind(this),
    });

    for (const scriptName of this.settings.registeredCustomScriptNames) {
      this.registerCustomScript(scriptName);
    }
  }

  onunload() {
    delete window.customJS;
  }

  private async selectAndInvokeScript() {
    const modal = new InvokeScriptFuzzySuggestModal(this.app, []);
    const scriptName = await modal.promise;
    await this.invokeScript(scriptName);
  }

  public async invokeScript(scriptName: string | null) {
    if (!scriptName) {
      return;
    }

    const invocableScript = window.customJS[scriptName] as Invocable;

    try {
      await invocableScript.invoke();
    } catch(e) {
      const message = `Script '${scriptName}' failed`;
      new Notice(`${message}\n${e.message}\nSee error console for more details`);
      console.error(message);
      console.error(e);
    }
  }

  async reloadIfNeeded(f: TAbstractFile) {
    if (f.path.endsWith('.js')) {
      await this.loadClasses();

      // reload dataviewjs blocks if installed & version >= 0.4.11
      if (this.app.plugins.enabledPlugins.has("dataview")) {
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
      const file = await this.app.vault.adapter.read(f);
      const def = eval('(' + file + ')') as new () => unknown;
      const cls = new def()
      window.customJS[cls.constructor.name] = cls;
    } catch (e) {
      console.error(`CustomJS couldn\'t import ${f}`)
      console.error(e)
    }
  }

  async loadClasses() {
    window.customJS = { obsidian };
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

    for (const startupScriptName of this.settings.startupScriptNames.split(',').map(s => s.trim())) {
      const startupScript = window.customJS[startupScriptName];

      if (!startupScript) {
        console.warn(`Startup script '${startupScriptName}' is not defined`);
        continue;
      }

      if (!isInvocable(startupScript)) {
        console.warn(`Startup script '${startupScriptName}' is not invocable`);
        continue;
      }

      try {
        await startupScript.invoke();
      } catch(e) {
        console.error(`Startup script '${startupScriptName}' failed`);
        console.error(e);
      }
    }
  }

  sortByFileName(files: string[]) {
    files.sort((a, b) => {
      const nameA = a.split('/').last()
      const nameB = b.split('/').last()
      return nameA.localeCompare(nameB);
    })
  }

  private getCustomScriptCommandId(scriptName: string) {
    return `invoke-custom-${scriptName}`;
  }

  async registerCustomScript(scriptName: string) {
    this.addCommand({
      id: this.getCustomScriptCommandId(scriptName),
      name: scriptName,
      callback: async () => {
        await this.invokeScript(scriptName)
      },
    });

    if (!this.settings.registeredCustomScriptNames.includes(scriptName)) {
      this.settings.registeredCustomScriptNames.push(scriptName);
      await this.saveSettings();
    }
  }

  async unregisterCustomScript(scriptName: string) {
    this.app.commands.removeCommand(`${this.manifest.id}:${this.getCustomScriptCommandId(scriptName)}`)
    const index = this.settings.registeredCustomScriptNames.indexOf(scriptName);
    this.settings.registeredCustomScriptNames.splice(index, 1);
    await this.saveSettings();
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

    new Setting(containerEl)
      .setName('Startup script names')
      .setDesc('Comma-separated list of Startup script names')
      .addText(text => text
        .setPlaceholder('Startup, Autostart')
        .setValue(this.plugin.settings.startupScriptNames)
        .onChange(async (value) => {
          this.plugin.settings.startupScriptNames = value;
          await this.plugin.saveSettings();
          await this.plugin.loadClasses();
        })
      );

    new Setting(containerEl)
      .setName('Registered custom scripts')
      .setDesc('Allows you to bind an invocable script to a hotkey');

    for (const scriptName of this.plugin.settings.registeredCustomScriptNames) {
      new Setting(containerEl)
        .addText(text => text
          .setValue(scriptName)
          .setDisabled(true)
        )
        .addExtraButton(cb => cb
          .setIcon("any-key")
          .setTooltip("Configure Hotkey")
          .onClick(() => {
            const hotkeysTab = this.app.setting.openTabById("hotkeys");
            hotkeysTab.searchComponent.setValue(`${this.plugin.manifest.name}: ${scriptName}`);
            hotkeysTab.updateHotkeyVisibility();
          })
        )
        .addExtraButton(cb => cb
          .setIcon("cross")
          .setTooltip("Delete")
          .onClick(async () => {
            this.plugin.unregisterCustomScript(scriptName);
            this.display();
          })
        );
    }

    new Setting(this.containerEl)
      .addButton(cb => cb
        .setButtonText("Add new hotkey for script")
        .setCta()
        .onClick(async () => {
            const modal = new InvokeScriptFuzzySuggestModal(this.app, this.plugin.settings.registeredCustomScriptNames);
            const scriptName = await modal.promise;
            if (scriptName) {
              this.plugin.registerCustomScript(scriptName);
              this.display();
            }
        })
      );
  }
}

class InvokeScriptFuzzySuggestModal extends FuzzySuggestModal<string> {
  private resolve: (value: string) => void;
  private isSelected: boolean;
  private excludedScriptNames: Set<string>;
  public promise: Promise<string>;

  constructor(app: App, excludedScriptNames: string[]) {
    super(app);

    this.promise = new Promise<string>((resolve) => {
      this.resolve = resolve;
    });

    this.excludedScriptNames = new Set<string>(excludedScriptNames);
    this.open();
  }

  getItems(): string[] {
    const entries = (Object.entries(window.customJS) as [string, any][]).map(entry => ({
      scriptName: entry[0],
      scriptObj: entry[1]
    }));
    const invocableScriptNames = entries
      .filter(entry => isInvocable(entry.scriptObj))
      .map(entry => entry.scriptName)
      .filter(scriptName => !this.excludedScriptNames.has(scriptName))
      .sort();
    return invocableScriptNames;
  }

  getItemText(item: string): string {
    return item;
  }

  selectSuggestion(value: FuzzyMatch<string>, evt: MouseEvent | KeyboardEvent): void {
    this.isSelected = true;
    super.selectSuggestion(value, evt);
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    this.resolve(item);
  }

  onClose(): void {
    if (!this.isSelected) {
      this.resolve(null);
    }
  }
}
