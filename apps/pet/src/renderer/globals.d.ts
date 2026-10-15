export {};

type PetSettings = {
  alwaysOnTop: boolean;
  sfxEnabled: boolean;
};

declare global {
  interface Window {
    desktopPet?: {
      phase: string;
      locale: string;
      moveBy: (dx: number, dy: number) => Promise<void>;
      getSettings: () => Promise<PetSettings>;
      setAlwaysOnTop: (enabled: boolean) => Promise<PetSettings>;
      setSfx: (enabled: boolean) => Promise<PetSettings>;
      quit: () => Promise<void>;
      showContextMenu: () => void;
      onToast: (handler: (message: string) => void) => () => void;
      onSettingsChanged: (handler: (settings: PetSettings) => void) => () => void;
    };
  }
}
