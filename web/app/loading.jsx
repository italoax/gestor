export default function Loading() {
  return (
    <div
      style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}
      role="status"
      aria-live="polite"
    >
      <p>Carregando página…</p>
    </div>
  );
}
