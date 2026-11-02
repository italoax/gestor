import { publicAssetUrl } from '../../lib/publicAssets.ts';

export function PanelStyles() {
  const styles = [
    'style',
    'panel-base',
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
      {styles}
      <link
        rel="stylesheet"
        href={publicAssetUrl('/assets/css/themes.css')}
        precedence="panel-theme"
      />
    </>
  );
}
