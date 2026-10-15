export {};

declare global {
  interface Window {
    desktopPet?: { phase: string; locale: string };
  }
}
