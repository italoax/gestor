import { publicAssetUrl } from '../../lib/publicAssets.ts';

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
      href={publicAssetUrl(`/assets/css/${name}.css`)}
      precedence="panel"
    />
  ));
  return (
    <>
      <link
        rel="preload"
        as="script"
        href={publicAssetUrl('/assets/js/panel-runtime.js')}
      />
      {styles}
    </>
  );
}
