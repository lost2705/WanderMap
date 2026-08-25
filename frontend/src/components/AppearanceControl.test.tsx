// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEMES } from '../appearance/theme'
import { AppearanceControl } from './AppearanceControl'

afterEach(cleanup)

describe('AppearanceControl', () => {
  it('exposes all themes in a compact labelled keyboard-focusable control', () => {
    const onChange = vi.fn()
    render(<AppearanceControl theme="terracotta" onChange={onChange} />)

    const select = screen.getByRole('combobox', { name: 'Appearance' }) as HTMLSelectElement
    expect(select.value).toBe('terracotta')
    expect([...select.options].map((option) => option.text)).toEqual(THEMES.map(({ label }) => label))

    select.focus()
    expect(document.activeElement).toBe(select)
    fireEvent.change(select, { target: { value: 'midnight' } })
    expect(onChange).toHaveBeenCalledWith('midnight')
  })
})
