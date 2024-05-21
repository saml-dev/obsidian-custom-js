import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  FuzzySuggestModal,
  FuzzyMatch,
  Notice,
} from 'obsidian';
import * as obsidian from 'obsidian';
import compareVersions from 'compare-versions';
import debuggableEval from 'debuggable-eval';
import { CustomJSType } from './types';

interface CustomJSSettings {
  jsFiles: string;
  jsFolder: string;
  startupScriptNames: string[];
  registeredInvocableScriptNames: string[];
  rerunStartupScriptsOnFileChange: boolean;
}

const DEFAULT_SETTINGS: CustomJSSettings = {
  jsFiles: '',
  jsFolder: '',
  startupScriptNames: [],
  registeredInvocableScriptNames: [],
  rerunStartupScriptsOnFileChange: false,
};

interface Invocable {
  invoke: () => Promise<void>;
}

function isInvocable(x: unknown): x is Invocable {
  return typeof (x as { invoke: 'function' })?.invoke === 'function';
}

export default class CustomJS extends Plugin {
  settings: CustomJSSettings;
  deconstructorsOfLoadedFiles: { deconstructor: () => void; name: string }[] =
    [];
  loaderPromise: Promise<void> | null = null;

  async onload() {
    // eslint-disable-next-line no-console
    console.log('Loading CustomJS');
    await this.loadSettings();
    this.registerEvent(this.app.vault.on('modify', this.reloadIfNeeded, this));

    window.forceLoadCustomJS = async () => {
      await this.initCustomJS();
    };

    window.cJS = async (
      moduleOrCallback?: string | ((customJS: CustomJSType) => void),
    ) => {
      if (!window.customJS?.state?._ready) {
        await this.initCustomJS();
      }

      if (moduleOrCallback) {
        if ('string' === typeof moduleOrCallback) {
          return window.customJS[moduleOrCallback];
        } else if ('function' === typeof moduleOrCallback) {
          await moduleOrCallback(window.customJS);
        }
      }

      return window.customJS;
    };

    this.app.workspace.onLayoutReady(async () => {
      await this.loadClasses();

      for (const startupScriptName of this.settings.startupScriptNames) {
        await this.invokeScript(startupScriptName);
      }
    });
    this.addSettingTab(new CustomJSSettingsTab(this.app, this));

    this.addCommand({
      id: 'invokeScript',
      name: 'Invoke Script',
      callback: this.selectAndInvokeScript.bind(this),
    });

    for (const scriptName of this.settings.registeredInvocableScriptNames) {
      this.registerInvocableScript(scriptName);
    }
  }

  async onunload() {
    await this.deconstructLoadedFiles();
    delete window.customJS;
  }

  private async selectAndInvokeScript() {
    const modal = new InvocableScriptSelectorModal(this.app, []);
    const scriptName = await modal.promise;
    await this.invokeScript(scriptName);
  }

  public async invokeScript(scriptName: string | null) {
    if (!scriptName) {
      return;
    }

    const scriptObj = window.customJS[scriptName];

    if (!scriptObj) {
      // eslint-disable-next-line no-console
      console.warn(`Script '${scriptName}' is not defined`);

      return;
    }

    if (!isInvocable(scriptObj)) {
      // eslint-disable-next-line no-console
      console.warn(`Script '${scriptName}' is not invocable`);

      return;
    }

    try {
      await scriptObj.invoke();
    } catch (e) {
      const message = `Script '${scriptName}' failed`;

      new Notice(
        `${message}\n${e.message}\nSee error console for more details`,
      );
      // eslint-disable-next-line no-console
      console.error(message);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  async deconstructLoadedFiles() {
    // Run deconstructor if exists
    for (const deconstructor of this.deconstructorsOfLoadedFiles) {
      try {
        await deconstructor.deconstructor();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`${deconstructor.name} failed`);
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }

    // Clear the list
    this.deconstructorsOfLoadedFiles = [];
  }

  async reloadIfNeeded(f: TAbstractFile) {
    if (f.path.endsWith('.js')) {
      // Run deconstructor if exists
      await this.deconstructLoadedFiles();

      await this.initCustomJS();

      // invoke startup scripts again if wanted
      if (this.settings.rerunStartupScriptsOnFileChange) {
        for (const startupScriptName of this.settings.startupScriptNames) {
          await this.invokeScript(startupScriptName);
        }
      }

      // reload dataviewjs blocks if installed & version >= 0.4.11
      if (this.app.plugins.enabledPlugins.has('dataview')) {
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

      const def = debuggableEval(`(${file})`, f) as new () => {
        deconstructor?: () => void;
      };

      // Store the existing instance
      const cls = new def();
      window.customJS[cls.constructor.name] = cls;

      // Check if the class has a deconstructor
      if (typeof cls.deconstructor === 'function') {
        // Add the deconstructor to the list
        const deconstructor = cls.deconstructor.bind(cls);

        const deconstructorWrapper = {
          deconstructor: deconstructor,
          name: `Deconstructor of ${cls.constructor.name}`,
        };
        this.deconstructorsOfLoadedFiles.push(deconstructorWrapper);
      }

      // Provide a way to create a new instance
      window.customJS[`create${def.name}Instance`] = () => new def();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`CustomJS couldn't import ${f}`);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  async initCustomJS() {
    if (!this.loaderPromise) {
      this.loaderPromise = this.loadClasses().finally(() => {
        this.loaderPromise = null;
      });
    }

    await this.loaderPromise;
  }

  async loadClasses() {
    window.customJS = {
      obsidian,
      state: window.customJS?.state ?? {},
      app: this.app,
    };
    const filesToLoad = [];
    window.customJS.state._ready = false;

    // Get individual paths
    if (this.settings.jsFiles != '') {
      const individualFiles = this.settings.jsFiles
        .split(',')
        .map((s) => s.trim())
        .sort();

      for (const f of individualFiles) {
        if (f != '' && f.endsWith('.js')) {
          filesToLoad.push(f);
        }
      }
    }

    // Get paths in folder
    if (this.settings.jsFolder != '') {
      const prefix = this.settings.jsFolder;
      const files = this.app.vault.getFiles();

      const scripts = files.filter(
        (f) => f.path.startsWith(prefix) && f.path.endsWith('.js'),
      );

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
    window.customJS.state._ready = true;
  }

  sortByFileName(files: string[]) {
    files.sort((a, b) => {
      const nameA = a.split('/').last();
      const nameB = b.split('/').last();

      return nameA.localeCompare(nameB);
    });
  }

  private getInvocableScriptCommandId(scriptName: string) {
    return `invoke-${scriptName}`;
  }

  async registerInvocableScript(scriptName: string) {
    this.addCommand({
      id: this.getInvocableScriptCommandId(scriptName),
      name: scriptName,
      callback: async () => {
        await this.invokeScript(scriptName);
      },
    });

    if (!this.settings.registeredInvocableScriptNames.includes(scriptName)) {
      this.settings.registeredInvocableScriptNames.push(scriptName);
      await this.saveSettings();
    }
  }

  async unregisterInvocableScript(scriptName: string) {
    this.app.commands.removeCommand(
      `${this.manifest.id}:${this.getInvocableScriptCommandId(scriptName)}`,
    );

    const index =
      this.settings.registeredInvocableScriptNames.indexOf(scriptName);
    this.settings.registeredInvocableScriptNames.splice(index, 1);
    await this.saveSettings();
  }

  async addStartupScript(scriptName: string) {
    this.settings.startupScriptNames.push(scriptName);
    await this.saveSettings();
  }

  async deleteStartupScript(scriptName: string) {
    const index = this.settings.startupScriptNames.indexOf(scriptName);
    this.settings.startupScriptNames.splice(index, 1);
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
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'CustomJS' });

    // individual files
    new Setting(containerEl)
      .setName('Individual files')
      .setDesc('Comma-separated list of files to load')
      .addText((text) =>
        text
          .setPlaceholder('jsfile1.js,jsfile2.js')
          .setValue(this.plugin.settings.jsFiles)
          .onChange(async (value) => {
            this.plugin.settings.jsFiles = value;
            await this.plugin.saveSettings();
            await this.plugin.loadClasses();
          }),
      );

    // folder
    new Setting(containerEl)
      .setName('Folder')
      .setDesc('Path to folder containing JS files to load')
      .addText((text) =>
        text
          .setPlaceholder('js/scripts')
          .setValue(this.plugin.settings.jsFolder)
          .onChange(async (value) => {
            this.plugin.settings.jsFolder = value;
            await this.plugin.saveSettings();
            await this.plugin.loadClasses();
          }),
      );

    let descriptionTemplate = document.createElement('template');

    descriptionTemplate.innerHTML =
      'Allows you to bind an <dfn title="the class with `async invoke()` method">invocable script</dfn> to a hotkey';

    new Setting(containerEl)
      .setName('Registered invocable scripts')
      .setDesc(descriptionTemplate.content);

    for (const scriptName of this.plugin.settings
      .registeredInvocableScriptNames) {
      new Setting(containerEl)
        .addText((text) => text.setValue(scriptName).setDisabled(true))
        .addExtraButton((cb) =>
          cb
            .setIcon('any-key')
            .setTooltip('Configure Hotkey')
            .onClick(() => {
              const hotkeysTab = this.app.setting.openTabById('hotkeys');

              hotkeysTab.searchComponent.setValue(
                `${this.plugin.manifest.name}: ${scriptName}`,
              );
              hotkeysTab.updateHotkeyVisibility();
            }),
        )
        .addExtraButton((cb) =>
          cb
            .setIcon('cross')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.unregisterInvocableScript(scriptName);
              this.display();
            }),
        );
    }

    new Setting(this.containerEl).addButton((cb) =>
      cb
        .setButtonText('Register invocable script')
        .setCta()
        .onClick(async () => {
          const modal = new InvocableScriptSelectorModal(
            this.app,
            this.plugin.settings.registeredInvocableScriptNames,
          );
          const scriptName = await modal.promise;

          if (scriptName) {
            this.plugin.registerInvocableScript(scriptName);
            this.display();
          }
        }),
    );

    descriptionTemplate = document.createElement('template');

    descriptionTemplate.innerHTML =
      '<dfn title="the class with `async invoke()` method">Invocable scripts</dfn> executed when the plugin is loaded';

    new Setting(containerEl)
      .setName('Startup scripts')
      .setDesc(descriptionTemplate.content);

    for (const scriptName of this.plugin.settings.startupScriptNames) {
      new Setting(containerEl)
        .addText((text) => text.setValue(scriptName).setDisabled(true))
        .addExtraButton((cb) =>
          cb
            .setIcon('cross')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.deleteStartupScript(scriptName);
              this.display();
            }),
        );
    }

    new Setting(this.containerEl).addButton((cb) =>
      cb
        .setButtonText('Add startup script')
        .setCta()
        .onClick(async () => {
          const modal = new InvocableScriptSelectorModal(
            this.app,
            this.plugin.settings.startupScriptNames,
          );
          const scriptName = await modal.promise;

          if (scriptName) {
            this.plugin.addStartupScript(scriptName);
            this.display();
          }
        }),
    );

    new Setting(containerEl)
      .setName('Re-execute the start scripts when reloading')
      .setDesc(
        'Decides whether the startup scripts should be executed again after reloading the scripts',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rerunStartupScriptsOnFileChange)
          .onChange(async (value) => {
            this.plugin.settings.rerunStartupScriptsOnFileChange = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

class InvocableScriptSelectorModal extends FuzzySuggestModal<string> {
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
    const entries = (
      Object.entries(window.customJS) as [string, Record<string, unknown>][]
    ).map(([scriptName, scriptObj]) => ({
      scriptName,
      scriptObj,
    }));

    const invocableScriptNames = entries
      .filter((entry) => isInvocable(entry.scriptObj))
      .map((entry) => entry.scriptName)
      .filter((scriptName) => !this.excludedScriptNames.has(scriptName))
      .sort();

    return invocableScriptNames;
  }

  getItemText(item: string): string {
    return item;
  }

  selectSuggestion(
    value: FuzzyMatch<string>,
    evt: MouseEvent | KeyboardEvent,
  ): void {
    this.isSelected = true;
    super.selectSuggestion(value, evt);
  }

  onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
    this.resolve(item);
  }

  onClose(): void {
    if (!this.isSelected) {
      this.resolve(null);
    }
  }
}
