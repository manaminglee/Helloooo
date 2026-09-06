/** Capacitor shell: status bar + splash on the real iOS app. */
export async function bootIosNativeShell() {
  try {
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const [{ StatusBar, Style }, { App }] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/app'),
    ]);
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#07060f' }).catch(() => {});
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
    });
  } catch { /* web or plugins not installed */ }
}
