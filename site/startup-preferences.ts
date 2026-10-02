// Keep startup lightweight: loading the review engine here would delay the scene.
// Each demo page starts with fresh preferences and a fresh repository.
export async function readStartupPreferences() {
  return { showSplashScreen: true, reducedMotion: false, sound: true, volume: .18 };
}
