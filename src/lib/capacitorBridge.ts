interface CapacitorAppPlugin {
  addListener?: (
    eventName: 'backButton',
    listenerFunc: () => void
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => void };
  exitApp?: () => Promise<void> | void;
}

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      App?: CapacitorAppPlugin;
    };
  };
}

export function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as CapacitorWindow).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function registerAndroidBackButton(onBack: () => void): () => void {
  if (!isNativeCapacitor()) return () => {};
  const appPlugin = (window as CapacitorWindow).Capacitor?.Plugins?.App;
  if (!appPlugin?.addListener) return () => {};

  const handleOrPromise = appPlugin.addListener('backButton', onBack);
  return () => {
    Promise.resolve(handleOrPromise)
      .then((handle) => handle?.remove?.())
      .catch(() => {});
  };
}

export function exitNativeAndroidApp(): void {
  if (!isNativeCapacitor()) return;
  const appPlugin = (window as CapacitorWindow).Capacitor?.Plugins?.App;
  try {
    void appPlugin?.exitApp?.();
  } catch {
    // Ignore outside native shell
  }
}
