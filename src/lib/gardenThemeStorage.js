export const DEFAULT_GARDEN_THEME = 'balanced'
export const GARDEN_THEMES = Object.freeze([
  { id: 'balanced', name: 'Balanced Warm' },
  { id: 'warm', name: 'Warm Opal' },
  { id: 'aurora', name: 'Aurora Crystal' },
  { id: 'default', name: 'Original Opal' },
])

export function normalizeGardenTheme(value) {
  return GARDEN_THEMES.some(({ id }) => id === value) ? value : DEFAULT_GARDEN_THEME
}

// Auth IDs, never member/garden IDs. Development previews have their own namespace.
export function gardenThemeStorageKey(userId, demo = false) {
  if (demo) return 'sup.garden-theme.v1.demo'
  return typeof userId === 'string' && userId ? `sup.garden-theme.v1.user.${userId}` : null
}

export function readGardenTheme(key, storage) {
  if (!key) return DEFAULT_GARDEN_THEME
  try {
    return normalizeGardenTheme((storage ?? globalThis.localStorage)?.getItem(key))
  } catch { return DEFAULT_GARDEN_THEME }
}

export function writeGardenTheme(key, value, storage) {
  if (!key) return false
  try {
    const target = storage ?? globalThis.localStorage
    if (!target) return false
    target.setItem(key, normalizeGardenTheme(value))
    return true
  } catch { return false }
}
