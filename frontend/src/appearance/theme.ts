export const THEMES = [
  { id: 'terracotta', label: 'Terracotta' },
  { id: 'sage', label: 'Sage' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'burgundy', label: 'Burgundy' },
  { id: 'midnight', label: 'Midnight' },
] as const

export type Theme = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: Theme = 'terracotta'
export const THEME_STORAGE_KEY = 'wandermap.appearance.theme.v1'

type ThemeStorageReader = Pick<Storage, 'getItem'>
type ThemeStorageWriter = Pick<Storage, 'setItem'>

const themeIds = new Set<string>(THEMES.map(({ id }) => id))

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themeIds.has(value)
}

export function readStoredTheme(storage: ThemeStorageReader | null = browserStorage()): Theme {
  if (!storage) {
    return DEFAULT_THEME
  }

  try {
    const storedTheme = storage.getItem(THEME_STORAGE_KEY)
    return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme
}

export function initializeTheme(
  storage: ThemeStorageReader | null = browserStorage(),
  root: HTMLElement = document.documentElement,
): Theme {
  const theme = readStoredTheme(storage)
  applyTheme(theme, root)
  return theme
}

export function persistTheme(theme: Theme, storage: ThemeStorageWriter | null = browserStorage()): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Appearance remains available for this session when storage is unavailable.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}
