// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTheme,
  DEFAULT_THEME,
  initializeTheme,
  persistTheme,
  readStoredTheme,
  THEMES,
  THEME_STORAGE_KEY,
} from './theme'

afterEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('appearance theme model', () => {
  it('uses Terracotta by default and rejects an invalid stored value', () => {
    expect(readStoredTheme(window.localStorage)).toBe(DEFAULT_THEME)

    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon-from-untrusted-storage')
    expect(initializeTheme()).toBe(DEFAULT_THEME)
    expect(document.documentElement.dataset.theme).toBe('terracotta')
  })

  it('persists and restores a validated theme during bootstrap', () => {
    persistTheme('sage')
    delete document.documentElement.dataset.theme

    expect(initializeTheme()).toBe('sage')
    expect(document.documentElement.dataset.theme).toBe('sage')
  })

  it('allows every supported theme to be applied through the stable root marker', () => {
    THEMES.forEach(({ id }) => {
      applyTheme(id)
      expect(document.documentElement.dataset.theme).toBe(id)
    })
  })

  it('falls back safely when local storage cannot be read or written', () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readStoredTheme(unavailableStorage)).toBe(DEFAULT_THEME)
    expect(() => persistTheme('midnight', unavailableStorage)).not.toThrow()
  })
})
