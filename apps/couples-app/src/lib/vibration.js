// iOS Safari has never implemented the Vibration API — calling it there is
// a harmless no-op (spec says it returns false, doesn't throw), so every
// caller can just fire-and-forget without feature-detecting first.
export function vibrate(pattern) {
  navigator.vibrate?.(pattern)
}
