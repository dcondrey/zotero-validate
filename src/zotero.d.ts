declare const Zotero: {
  debug(message: string): void;
  getMainWindow(): any;
  getMainWindows(): any[];
  getActiveZoteroPane(): any;
  WindowWatcher: {
    registerCallback(callback: (win: any, type: string) => void): string;
    deregisterCallback(id: string): void;
  };
  DB: {
    executeTransaction(fn: () => Promise<void>): Promise<void>;
  };
  Prefs: {
    get(key: string): any;
    set(key: string, value: any): void;
  };
  PreferencePanes: {
    register(options: any): void;
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
