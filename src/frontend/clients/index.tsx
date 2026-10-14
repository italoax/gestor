import { hydrateRoot } from 'react-dom/client';
import { ClientsPage } from './ClientsPage.tsx';

let active;
function unmount() {
  active?.root.unmount();
  active = undefined;
}
window.gestorReactClients = {
  mount() {
    const container = document.getElementById(
      'react-clientes-root',
    ) as HTMLElement;
    if (!container) {
      unmount();
      return Promise.resolve();
    }
    if (active?.container === container) return active.ready;
    unmount();
    const data = JSON.parse(
      (document.getElementById('react-clientes-data') as HTMLElement)
        .textContent,
    );
    let resolveReady, rejectReady;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const root = hydrateRoot(
      container,
      <ClientsPage data={data} onReady={resolveReady} />,
      { onUncaughtError: rejectReady },
    );
    active = { container, root, ready };
    return ready;
  },
};
document.addEventListener('gestor:before-swap', unmount);
