import * as obsidian from 'obsidian';
import { DataviewAPI } from 'obsidian-dataview';

declare global {
  interface Window {
    forceLoadCustomJS?: () => Promise<void>;
    customJS?: {
      obsidian?: typeof obsidian;
      app?: obsidian.App;
      state?: {};
      [scriptName: string]: unknown;
    };
  }
}

declare module 'obsidian' {
  interface App {
    plugins: {
      enabledPlugins: Set<string>;
      plugins: {
        [id: string]: any;
        dataview?: {
          api?: DataviewAPI;
          manifest: {
            version: string;
          };
        };
      };
    };
    setting: {
      openTabById: (tabId: 'hotkeys') => {
        searchComponent: SearchComponent;
        updateHotkeyVisibility: () => void;
      };
    };
    commands: {
      removeCommand: (commandName: string) => void;
    };
  }
  interface MetadataCache {
    on(
      name: 'dataview:api-ready',
      callback: (api: DataviewAPI) => any,
      ctx?: any,
    ): EventRef;
    on(
      name: 'dataview:metadata-change',
      callback: (
        ...args:
          | [op: 'rename', file: TAbstractFile, oldPath: string]
          | [op: 'delete', file: TFile]
          | [op: 'update', file: TFile]
      ) => any,
      ctx?: any,
    ): EventRef;
  }
}
