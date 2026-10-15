export function PanelStyles() {
  return [
    'style',
    'node-migration',
    'modals',
    'panel-ui',
    'visual-effects',
  ].map((name) => (
    <link
      key={name}
      rel="stylesheet"
      href={`/assets/css/${name}.css`}
      precedence="panel"
    />
  ));
}
