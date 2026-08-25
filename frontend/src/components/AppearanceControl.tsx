import { isTheme, THEMES } from '../appearance/theme'
import type { Theme } from '../appearance/theme'

interface AppearanceControlProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

export function AppearanceControl({ theme, onChange }: AppearanceControlProps) {
  return (
    <section className="appearance-control" aria-labelledby="appearance-heading">
      <label htmlFor="appearance-theme">
        <span className="appearance-heading" id="appearance-heading">Appearance</span>
        <span className="appearance-select-wrap">
          <span aria-hidden="true" className="appearance-swatch" />
          <select
            id="appearance-theme"
            value={theme}
            onChange={(event) => {
              if (isTheme(event.target.value)) {
                onChange(event.target.value)
              }
            }}
          >
            {THEMES.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </span>
      </label>
    </section>
  )
}
