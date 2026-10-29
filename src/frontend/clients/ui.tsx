export function CsrfInput({ token }: { token?: string }) {
  return <input type="hidden" name="_csrf" defaultValue={token} />;
}

export function StatusBadge({ status }: { status?: any }) {
  return <span className={'badge badge-' + status.color}>{status.label}</span>;
}

const paths = {
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chart: <path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4" />,
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />,
  shield: (
    <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6" />
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logout: <path d="M10 4H4v16h6m4-12 4 4-4 4m-6-4h12" />,
  moon: <path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6.5h.01M7 17.5h.01" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M2 9h20M6 15h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="13" height="14" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13M9 9l12-2" />
      <ellipse cx="6" cy="18" rx="3" ry="3" />
      <ellipse cx="18" cy="16" rx="3" ry="3" />
    </>
  ),
  file: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="m12 12 9 9m-3-3 3-3m-6 0 3-3" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v13h14V8m-10 4h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10 5h4m-2 14h.01" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  package: (
    <path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9 9-4m-9 4L3 8m9 4v10M7.5 5.5l9 5v4" />
  ),
  message: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5Z" />
      <path d="M8 10h8m-8 4h5" />
    </>
  ),
  edit: <path d="m16 3 5 5-12 12H4v-5L16 3Zm-3 3 5 5" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
};
const aliases = { '👥': 'users', '🧑‍🤝‍🧑': 'users', '⚠️': 'warning' };

export function Icon({ name }: { name?: string }) {
  return (
    <svg
      className="ui-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[aliases[name] || name]}
    </svg>
  );
}
