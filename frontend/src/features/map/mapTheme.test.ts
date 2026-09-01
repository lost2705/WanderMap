// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import tokens from '../../design-tokens.css?inline'
import { mapThemeColors } from './mapTheme'

let stylesheet: HTMLStyleElement

beforeEach(() => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = tokens
  document.head.append(stylesheet)
})

afterEach(() => {
  stylesheet.remove()
  delete document.documentElement.dataset.theme
})

describe('World travel-data palette', () => {
  it.each(['terracotta', 'sage', 'ocean', 'lavender', 'burgundy', 'midnight'])('%s keeps cluster text readable', (theme) => {
    applyTestTheme(theme)
    const { worldPlaces } = mapThemeColors()
    expect(contrast(worldPlaces.clusterText, worldPlaces.cluster)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['terracotta', 'sage', 'ocean', 'lavender', 'burgundy', 'midnight'])('%s exposes a distinct bucket-list palette', (theme) => {
    applyTestTheme(theme)
    const { bucketPlaces, worldPlaces } = mapThemeColors()
    expect(bucketPlaces.ring).toMatch(/^#[0-9a-f]{6}$/i)
    expect(bucketPlaces.halo).toMatch(/^#[0-9a-f]{6}$/i)
    expect(bucketPlaces.fill).toMatch(/^#[0-9a-f]{6}$/i)
    expect(bucketPlaces.ring).not.toBe(worldPlaces.areaCore)
  })

  it.each(['ocean', 'midnight'])('%s separates travel cores from both land and water', (theme) => {
    applyTestTheme(theme)
    const { worldPlaces, basemap } = mapThemeColors()
    expect(contrast(worldPlaces.areaCore, basemap.land)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(worldPlaces.areaCore, basemap.water)).toBeGreaterThanOrEqual(4.5)
  })

  it('switches to dark cluster text on the light Midnight fill without changing Journey marker text', () => {
    applyTestTheme('ocean')
    expect(mapThemeColors().worldPlaces.clusterText).toBe('#fff')
    applyTestTheme('midnight')
    expect(mapThemeColors().worldPlaces.clusterText).toBe('#101a24')
    expect(getComputedStyle(document.documentElement).getPropertyValue('--color-map-marker-label').trim()).toBe('#fff')
  })
})

function applyTestTheme(theme: string) {
  document.documentElement.dataset.theme = theme
  // Keep computed-style cache invalidation explicit in jsdom.
  stylesheet.remove()
  document.head.append(stylesheet)
}

function contrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const hex = color.slice(1)
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
    const channels = [0, 2, 4].map((offset) => {
      const channel = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b)
  return (values[1] + 0.05) / (values[0] + 0.05)
}
