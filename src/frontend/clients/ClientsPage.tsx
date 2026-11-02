import { useLayoutEffect, useState } from 'react';
import { ClientHistory } from './ClientHistory.tsx';
import { ClientsList } from './ClientsList.tsx';
import { ClientsModals } from './ClientsModals.tsx';
import { useClientForm } from './useClientForm.ts';
import { useClientRenewal } from './useClientRenewal.ts';
import { RenewalModals } from './RenewalModals.tsx';

export function ClientsPage({
  data,
  onReady,
}: {
  data?: any;
  onReady?: (...args: any[]) => any;
}) {
  const clientForm = useClientForm();
  const [historyClient, setHistoryClient] = useState(null);
  const renewal = useClientRenewal(data);
  useLayoutEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <div
      data-clients-controller=""
      onClick={(event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-client-history]',
        );
        if (button)
          setHistoryClient({
            id: button.dataset.clientHistory,
            name: button.dataset.clientName,
          });
        clientForm.onPageClick(event);
        renewal.onPageClick(event);
      }}
      onSubmit={clientForm.onPageSubmit}
    >
      <link rel="stylesheet" href="/assets/css/native-clients.css" />
      <ClientsList {...data} />
      <ClientsModals {...data} clientForm={clientForm} />
      <RenewalModals {...data} renewal={renewal} />
      {historyClient && (
        <ClientHistory
          client={historyClient}
          onClose={() => setHistoryClient(null)}
        />
      )}
    </div>
  );
}
