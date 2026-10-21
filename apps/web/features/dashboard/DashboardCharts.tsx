'use client';
import { startTransition, useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../../../src/services/format.ts';

export function SeriesChart({
  title,
  labels,
  series,
  money = false,
}: {
  title?: React.ReactNode;
  labels?: any[];
  series?: any[];
  money?: boolean;
}) {
  const [active, setActive] = useState(null);
  const values = series.flatMap((item) => item.values);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    range = max - min;
  const x = (index) => 50 + (index * 600) / Math.max(1, labels.length - 1);
  const y = (value) => 220 - ((Number(value || 0) - min) / range) * 190;
  const format = (value) => (money ? formatMoney(value) : String(value));
  return (
    <div className="native-series">
      {!labels.length ? (
        <div className="dist-empty">Sem dados no período</div>
      ) : (
        <>
          <svg
            viewBox="0 0 700 260"
            role="img"
            aria-label={String(title)}
            className="native-chart"
          >
            {[0, 1, 2, 3, 4].map((step) => {
              const value = min + (range * step) / 4;
              return (
                <g key={step}>
                  <line
                    x1="50"
                    x2="650"
                    y1={y(value)}
                    y2={y(value)}
                    stroke="var(--border)"
                  />
                  <text
                    x="44"
                    y={y(value) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="var(--muted)"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              );
            })}
            {series.map((item) => (
              <g key={item.label}>
                <polyline
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2.5"
                  points={labels
                    .map((_, index) => `${x(index)},${y(item.values[index])}`)
                    .join(' ')}
                />
                {labels.map((label, index) => (
                  <circle
                    key={index}
                    cx={x(index)}
                    cy={y(item.values[index])}
                    r={labels.length === 1 ? 4 : 2.5}
                    fill={item.color}
                  >
                    <title>
                      {`${label}: ${item.label} ${format(item.values[index] || 0)}`}
                    </title>
                  </circle>
                ))}
              </g>
            ))}
            {labels.map((label, index) => (
              <g key={index}>
                {(index === 0 ||
                  index === labels.length - 1 ||
                  index % Math.ceil(labels.length / 8) === 0) && (
                  <text
                    x={x(index)}
                    y="246"
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--muted)"
                  >
                    {label}
                  </text>
                )}
                <rect
                  x={
                    x(index) -
                    Math.max(10, 300 / Math.max(1, labels.length - 1))
                  }
                  y="15"
                  width={Math.max(20, 600 / Math.max(1, labels.length - 1))}
                  height="210"
                  fill="transparent"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                />
              </g>
            ))}
          </svg>
          <div className="native-chart-legend" aria-live="polite">
            {active !== null && <strong>{labels[active]}</strong>}
            {series.map((item) => (
              <span key={item.label}>
                <i style={{ backgroundColor: item.color }} />
                {item.label}
                {active !== null && `: ${format(item.values[active] || 0)}`}
              </span>
            ))}
          </div>
          <details className="native-chart-data">
            <summary>Ver dados do gráfico</summary>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    {series.map((item) => (
                      <th key={item.label}>{item.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label, index) => (
                    <tr key={index}>
                      <td>{label}</td>
                      {series.map((item) => (
                        <td key={item.label}>
                          {format(item.values[index] || 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
const stops = [
  [45, 212, 191],
  [34, 197, 94],
  [234, 179, 8],
  [249, 115, 22],
  [239, 68, 68],
];
function heat(ratio) {
  const segment = Math.max(0, Math.min(1, ratio)) * 4,
    index = Math.min(3, Math.floor(segment)),
    t = segment - index;
  return `rgb(${stops[index].map((value, channel) => Math.round(value + (stops[index + 1][channel] - value) * t)).join(',')})`;
}
export function GeographyMap({ data, kind }: { data?: any; kind?: any }) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const loadMap = () => {
      if (cancelled) return;
      const module =
        kind === 'estados'
          ? import('@svg-maps/brazil')
          : import('@svg-maps/world');
      module
        .then((value) => {
          if (!cancelled) startTransition(() => setMap(value.default));
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    if ('IntersectionObserver' in window && container.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          loadMap();
        },
        { rootMargin: '200px' },
      );
      observer.observe(container.current);
    } else loadMap();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [kind]);
  const key = kind === 'estados' ? 'uf' : 'code';
  const counts = Object.fromEntries(
    data.top.map((item) => [item[key], Number(item.total)]),
  );
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="dist-card map-card" ref={container}>
      <div className="dist-head spread">
        <span>
          {kind === 'estados'
            ? '📍 Clientes por Estado'
            : '🌐 Clientes por País'}
        </span>
        <span className="dist-total">
          Total: <strong>{data.total}</strong>
        </span>
      </div>
      <div className="map-layout">
        <div className="map-legend">
          <span>{Math.max(0, ...Object.values(counts))}</span>
          <i className="map-scale" />
          <span>0</span>
        </div>
        <div className={`map-figure ${kind === 'paises' ? 'world' : ''}`}>
          {map ? (
            <svg
              viewBox={map.viewBox}
              className="map-svg"
              role="img"
              aria-label={
                kind === 'estados'
                  ? 'Distribuição de clientes por estado'
                  : 'Distribuição de clientes por país'
              }
            >
              {map.locations.map((location) => {
                const code = location.id
                    .replace(/[^a-z]/gi, '')
                    .slice(-2)
                    .toUpperCase(),
                  total = counts[code] || 0;
                return (
                  <path
                    key={location.id}
                    d={location.path}
                    className={`map-area ${total ? 'on' : ''}`}
                    style={{
                      fill: total
                        ? heat(total / max)
                        : 'var(--map-empty, rgba(148,163,184,.14))',
                    }}
                  >
                    <title>
                      {location.name}: {total}
                    </title>
                  </path>
                );
              })}
            </svg>
          ) : (
            <div className="map-fallback" role="status">
              {failed ? 'Mapa indisponível' : 'Carregando mapa...'}
            </div>
          )}
        </div>
        <div className="map-aside">
          <div className="map-aside-title">
            {kind === 'estados' ? 'Top Estados' : 'Top Países'}
          </div>
          {data.top.length ? (
            <ol className="map-rank">
              {data.top.slice(0, 8).map((item, index) => (
                <li key={item[key]}>
                  <span>
                    {index + 1}. {kind === 'estados' ? item.uf : item.nome}
                  </span>
                  <strong>{item.total}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="map-rank-empty">—</div>
          )}
        </div>
      </div>
      <small className="muted native-map-credit">
        Mapas:{' '}
        <a
          href="https://github.com/VictorCazanave/svg-maps"
          target="_blank"
          rel="noopener noreferrer"
        >
          Victor Cazanave / SVG Maps
        </a>{' '}
        ·{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY 4.0
        </a>{' '}
        · cores adaptadas.
      </small>
    </div>
  );
}
