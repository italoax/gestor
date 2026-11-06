export function minifiedStylePath(url: string) {
  return url.replace(
    /^(\/assets\/css\/.*?)(?<!\.min)\.css(?=[?#]|$)/,
    '$1.min.css',
  );
}
