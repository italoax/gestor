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

declare module '/assets/js/vendor/maps/brazil.js' {
  const map: {
    label: string;
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  export default map;
}
declare module '/assets/js/vendor/maps/world.js' {
  const map: {
    label: string;
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  export default map;
}
