'use client';
import { useEffect } from 'react';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { installTheme, themeOptions } from '../../../../src/shared/theme.ts';

export function ThemeSelector() {
  useEffect(() => {
    installTheme().refresh();
  }, []);
  return (
    <label className="theme-selector topbar-icon" title="Tema do painel">
      {Object.entries({
        light: 'sun',
        dark: 'moon',
        oled: 'oled',
        system: 'monitor',
      }).map(([theme, icon]) => (
        <span key={theme} data-theme-icon={theme} aria-hidden="true">
          <Icon name={icon} />
        </span>
      ))}
      <select
        aria-label="Tema do painel"
        data-theme-select
        defaultValue="oled"
        onChange={(event) => installTheme().setPreference(event.target.value)}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
