// O build incorpora a mesma versão no preload e nos controles do navegador.
export function publicAssetUrl(path: string) {
  const version = process.env.NEXT_PUBLIC_ASSET_VERSION;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}
