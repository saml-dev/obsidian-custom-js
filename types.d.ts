import * as obsidian from 'obsidian';
import { DataviewAPI } from 'obsidian-dataview';

export type CustomJSType = {
  obsidian?: typeof obsidian;
  app?: obsidian.App;
  state?: Record<string, unknown>;
  [scriptName: string]: unknown;
};

declare global {
  interface Window {
    forceLoadCustomJS?: () => Promise<void>;
    cJS?: (
      moduleOrCallback?: string | ((customJS: CustomJSType) => void),
    ) => Promise<unknown>;
    customJS?: CustomJSType;
  }
}

declare module 'obsidian' {
  interface App {
    plugins: {
      enabledPlugins: Set<string>;
      plugins: {
        [id: string]: unknown;
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
      callback: (api: DataviewAPI) => unknown,
      ctx?: unknown,
    ): EventRef;
    on(
      name: 'dataview:metadata-change',
      callback: (
        ...args:
          | [op: 'rename', file: TAbstractFile, oldPath: string]
          | [op: 'delete', file: TFile]
          | [op: 'update', file: TFile]
      ) => unknown,
      ctx?: unknown,
    ): EventRef;
  }
}
