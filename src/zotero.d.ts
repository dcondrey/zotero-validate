declare const IOUtils: {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
};

declare const Zotero: {
  debug(message: string): void;
  uiReadyPromise: Promise<void>;
  getMainWindow(): any;
  getMainWindows(): any[];
  getActiveZoteroPane(): any;
  Items: {
    get(id: number): any;
    getAsync(id: number): Promise<any>;
  };
  Collections: {
    getByLibrary(libraryID: number): any[];
  };
  Libraries: {
    userLibraryID: number;
  };
  Collection: new () => any;
  DataDirectory: {
    dir: string;
  };
  Prefs: {
    get(key: string): any;
    set(key: string, value: any): void;
  };
  PreferencePanes: {
    register(options: any): void;
    unregister(pluginID: string): void;
  };
  ProgressWindow: new (options?: any) => {
    changeHeadline(text: string): void;
    show(): void;
    startCloseTimer(ms: number): void;
    ItemProgress: new (
      icon: string,
      text: string,
    ) => {
      setProgress(pct: number): void;
      setText(text: string): void;
    };
  };
};
