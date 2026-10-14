import { useLayoutEffect } from 'react';
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
  const renewal = useClientRenewal(data);
  useLayoutEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <div
      data-clients-controller=""
      onClick={(event) => {
        clientForm.onPageClick(event);
        renewal.onPageClick(event);
      }}
      onSubmit={clientForm.onPageSubmit}
    >
      <ClientsList {...data} />
      <ClientsModals {...data} clientForm={clientForm} />
      <RenewalModals {...data} renewal={renewal} />
    </div>
  );
}
