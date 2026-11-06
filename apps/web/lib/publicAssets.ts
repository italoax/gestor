// O build incorpora a mesma versão nos estilos e nos controles do navegador.
import { minifiedStylePath } from '../../../src/shared/assetPaths.ts';

export function publicAssetUrl(path: string) {
  if (process.env.NODE_ENV === 'production') path = minifiedStylePath(path);
  const version = process.env.NEXT_PUBLIC_ASSET_VERSION;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}
