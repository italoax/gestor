// O código React só é baixado ao abrir a primeira página que o utiliza.
let clientsReactLoading;
window.gestorMountReactPage = async function () {
  const container = document.getElementById('react-clientes-root');
  if (!container) return;
  if (!window.gestorReactClients) {
    if (!clientsReactLoading) {
      clientsReactLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = container.dataset.reactBundle;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          clientsReactLoading = undefined;
          reject(new Error('Não foi possível carregar a tela de clientes.'));
        };
        document.head.append(script);
      });
    }
    await clientsReactLoading;
  }
  await window.gestorReactClients.mount();
};
