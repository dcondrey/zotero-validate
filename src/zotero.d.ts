declare const Zotero: {
  debug(message: string): void;
  getMainWindow(): any;
  getMainWindows(): any[];
  getActiveZoteroPane(): any;
  WindowWatcher: {
    registerCallback(
      id: string,
      callback: (win: any, type: string) => void,
    ): void;
    deregisterCallback(id: string): void;
  };
  Items: {
    get(id: number): any;
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
