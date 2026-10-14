interface ChartInstance {
  destroy(): void;
}
declare const Chart: {
  new (
    canvas: HTMLCanvasElement | CanvasRenderingContext2D,
    options: Record<string, any>,
  ): ChartInstance;
  defaults: { color: string; font: { family: string } };
};

declare module 'https://cdn.jsdelivr.net/npm/@svg-maps/brazil/+esm' {
  const map: {
    label: string;
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  export default map;
}
declare module 'https://cdn.jsdelivr.net/npm/@svg-maps/world/+esm' {
  const map: {
    label: string;
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  export default map;
}
