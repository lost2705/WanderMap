// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import styles from './styles.css?inline'

describe('viewport layout contract', () => {
  it('bounds the grid row to the viewport and allows map/sidebar children to shrink', () => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = styles
    document.head.append(stylesheet)
    try {
      const rules = [...(stylesheet.sheet?.cssRules ?? [])].filter((rule): rule is CSSStyleRule => rule.type === 1)
      const rule = (selector: string) => rules.find((entry) => entry.selectorText.replace(/\s/g, '') === selector.replace(/\s/g, ''))?.style
      expect(rule('html, body, #root')?.getPropertyValue('height')).toBe('100%')
      expect(rule('html, body, #root')?.getPropertyValue('width')).toBe('100%')
      expect(rule('html, body, #root')?.getPropertyValue('overflow')).toBe('hidden')
      expect(rule('html, body, #root')?.getPropertyValue('overscroll-behavior')).toBe('none')
      expect(rule('body')?.getPropertyValue('overflow-x')).toBe('')
      expect(rule('.application-shell')?.getPropertyValue('height')).toBe('100dvh')
      expect(rule('.application-shell')?.getPropertyValue('grid-template-rows')).toBe('minmax(0, 1fr)')
      for (const selector of ['.application-shell', '.content-area', '.map-panel', '.sidebar']) {
        expect(Number.parseFloat(rule(selector)?.getPropertyValue('min-height') ?? '')).toBe(0)
      }
      expect(rule('.map-panel')?.getPropertyValue('height')).toBe('100%')
      expect(rule('.sidebar')?.getPropertyValue('height')).toBe('100%')
      expect(rule('.sidebar')?.getPropertyValue('overflow-y')).toBe('auto')
      expect(rule('.sidebar')?.getPropertyValue('overscroll-behavior-y')).toBe('contain')
      const mobile = [...(stylesheet.sheet?.cssRules ?? [])].find((entry) =>
        entry instanceof CSSMediaRule && entry.conditionText === '(max-width: 820px)',
      ) as CSSMediaRule
      const drawer = [...mobile.cssRules].find((entry) =>
        entry instanceof CSSStyleRule && entry.selectorText === '.sidebar',
      ) as CSSStyleRule
      expect(drawer.style.getPropertyValue('position')).toBe('fixed')
      expect(drawer.style.getPropertyValue('height')).toBe('100dvh')
      expect(drawer.style.getPropertyValue('max-height')).toBe('100dvh')
      // The drawer inherits the sidebar's internal scroll/chain containment.
      expect(drawer.style.getPropertyValue('overflow-y')).toBe('')
      // Mobile children must not reintroduce a viewport-sized minimum into the bounded row.
      expect(styles).not.toMatch(/min-height:\s*100(?:d)?vh/)
    } finally {
      stylesheet.remove()
    }
  })
})
