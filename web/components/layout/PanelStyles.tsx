export function PanelStyles() {
  const styles = [
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
  return (
    <>
      <link rel="preload" as="script" href="/assets/js/panel-runtime.js" />
      {styles}
    </>
  );
}
