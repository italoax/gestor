'use client';

export function DeliveryDetail({
  summary,
  title,
  onPending,
}: {
  summary: { detalhe: string; pendentes?: number };
  title: string;
  onPending: () => void;
}) {
  const count = Number(summary.pendentes || 0);
  const label = `${count} pendente${count === 1 ? '' : 's'}`;
  const position = count > 0 ? summary.detalhe.indexOf(label) : -1;
  if (position < 0) return <span>{summary.detalhe}</span>;
  return (
    <span>
      {summary.detalhe.slice(0, position)}
      <button
        type="button"
        className="auto-pending-link"
        onClick={onPending}
        aria-label={`Ver ${label} da regra ${title}`}
      >
        {label}
      </button>
      {summary.detalhe.slice(position + label.length)}
    </span>
  );
}
