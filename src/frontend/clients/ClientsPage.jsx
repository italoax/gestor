import { useLayoutEffect } from 'react';
import { ClientsList } from './ClientsList.jsx';
import { ClientsModals } from './ClientsModals.jsx';
import { useClientForm } from './useClientForm.js';
import { useClientRenewal } from './useClientRenewal.js';
import { RenewalModals } from './RenewalModals.jsx';

export function ClientsPage({ data, onReady }) {
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
