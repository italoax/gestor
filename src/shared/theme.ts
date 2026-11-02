export type ThemePreference = 'light' | 'dark' | 'oled' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export const themeOptions = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'oled', label: 'OLED' },
  { value: 'system', label: 'Acompanhar o sistema' },
] as const;
export interface ThemeController {
  getPreference(): ThemePreference;
  getResolved(): ResolvedTheme;
  setPreference(value: unknown): void;
  refresh(): void;
}
declare global {
  interface Window {
    gestorTheme?: ThemeController;
  }
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return ['light', 'dark', 'oled', 'system'].includes(String(value))
    ? (value as ThemePreference)
    : 'oled';
}
export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

// Esta função é autocontida: a mesma implementação roda antes da primeira
// pintura e nos controles posteriores, sem eval nem dependências do framework.
function bootTheme(
  parse: typeof normalizeThemePreference,
  resolve: typeof resolveTheme,
  browserColors: Record<ResolvedTheme, string>,
) {
  if (window.gestorTheme) return window.gestorTheme;
  const root = document.documentElement;
  const key = 'gestor-theme';
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  let preference = parse(null);
  try {
    preference = parse(localStorage.getItem(key));
  } catch {
    /* Preferência em memória. */
  }
  const runtime = {
    apply() {
      const theme = resolve(preference, Boolean(media?.matches));
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-theme-preference', preference);
      const path = window.location.pathname;
      if (path !== '/' && !/^\/(area-cliente|pagar|p)(\/|$)/.test(path)) {
        document
          .querySelectorAll('meta[name="theme-color"]')
          .forEach((meta) =>
            meta.setAttribute('content', browserColors[theme]),
          );
      }
      document
        .querySelectorAll<HTMLSelectElement>('[data-theme-select]')
        .forEach((select) => {
          select.value = preference;
        });
      document.dispatchEvent(
        new CustomEvent('gestor:theme-change', {
          detail: { preference, theme },
        }),
      );
    },
    systemChanged() {
      if (preference === 'system') runtime.apply();
    },
    selectChanged(event: Event) {
      const select = event.target as HTMLSelectElement;
      if (select?.matches('[data-theme-select]'))
        window.gestorTheme.setPreference(select.value);
    },
  };
  window.gestorTheme = {
    getPreference() {
      return preference;
    },
    getResolved() {
      return resolve(preference, Boolean(media?.matches));
    },
    setPreference(value) {
      const next = parse(value);
      if (preference === next) return;
      preference = next;
      try {
        localStorage.setItem(key, preference);
      } catch {
        /* Não impede a troca. */
      }
      runtime.apply();
    },
    refresh: runtime.apply,
  };
  if (media?.addEventListener)
    media.addEventListener('change', runtime.systemChanged);
  else media?.addListener?.(runtime.systemChanged);
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      preference = parse(event.newValue);
      runtime.apply();
    }
  });
  window.addEventListener('pageshow', runtime.apply);
  document.addEventListener('DOMContentLoaded', runtime.apply, { once: true });
  document.addEventListener('gestor:navigated', runtime.apply);
  // Captura a escolha antes da hidratação de controles React no Safari.
  document.addEventListener('input', runtime.selectChanged, true);
  document.addEventListener('change', runtime.selectChanged, true);
  runtime.apply();
  return window.gestorTheme;
}
const browserColors = { light: '#f7f8fa', dark: '#14161b', oled: '#000000' };
export function installTheme(): ThemeController {
  return bootTheme(normalizeThemePreference, resolveTheme, browserColors);
}
export const themeBootstrapSource = `(${bootTheme.toString()})(${normalizeThemePreference.toString()},${resolveTheme.toString()},${JSON.stringify(browserColors)});`;
