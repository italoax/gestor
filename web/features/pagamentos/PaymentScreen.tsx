'use client';
import { useRef } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { formatDateBr, formatMoney } from '../../../src/services/format.ts';
import { createPix, usePixPayment } from './usePixPayment.ts';
import { useRenewalSelection } from './useRenewalSelection.ts';

export function PaymentScreen({ data }: { data?: any }) {
  const basePath = '/pagar/' + encodeURIComponent(data.pagamentoToken),
    selection = useRenewalSelection(data);
  const pix = usePixPayment(
      data.pagamento?.mpQrText
        ? {
            basePath,
            id: data.pagamento.id,
            qrText: data.pagamento.mpQrText,
            qrBase64: data.pagamento.mpQrBase64 || '',
          }
        : null,
    ),
    code = useRef(null);
  return (
    <>
      <link rel="stylesheet" href="/assets/css/native-payment.css" />
      <div className="pay-wrap" data-react-page="pagar">
        <div className="pay-card">
          <div className="pay-head">
            <h1>💳 Renovar acesso</h1>
            <span className="badge">PIX</span>
          </div>
          <div className="pay-body">
            <div className="pay-info">
              {[
                ['Cliente', data.cliente.nome],
                ['Usuário IPTV', data.cliente.user || '—'],
                ['Telas', data.cliente.telas || 1],
                ['Plano', data.cliente.plano || '—'],
                [
                  'Vencimento atual',
                  formatDateBr(data.cliente.vencimento) +
                    (data.cliente.horaVencimento
                      ? ` às ${String(data.cliente.horaVencimento).slice(0, 5)}`
                      : ''),
                ],
              ].map(([label, value]) => (
                <div className="pay-info-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {data.escolhas.length > 1 && (
              <label className="pay-field">
                Quais servidores deseja renovar?
                <select
                  id="pay-selecao"
                  value={selection.selection}
                  disabled={pix.locked}
                  onChange={(event) => {
                    selection.changeSelection(
                      (event.target as HTMLSelectElement).value,
                    );
                    pix.reset();
                  }}
                >
                  {data.escolhas.map((group) => (
                    <option key={group.selecao} value={group.selecao}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="pay-field">
              Por quanto tempo deseja renovar?
              <select
                id="pay-periodos"
                value={selection.periods}
                disabled={pix.locked}
                onChange={(event) => {
                  selection.setPeriods(
                    (event.target as HTMLSelectElement).value,
                  );
                  pix.reset();
                }}
              >
                {selection.options.map((option) => (
                  <option key={option.periodos} value={option.periodos}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="pay-amount" id="pay-amount">
              {formatMoney(selection.selected?.valor || 0)}
            </div>
            {['idle', 'busy', 'ready'].includes(pix.phase) && (
              <button
                className="pay-btn"
                id="pay-btn"
                type="button"
                disabled={pix.phase === 'busy'}
                onClick={() =>
                  pix.phase === 'ready'
                    ? pix.reveal()
                    : pix.generate((signal) =>
                        createPix(
                          basePath,
                          {
                            periodos: Number(selection.periods),
                            selecao: selection.selection || undefined,
                          },
                          signal,
                        ),
                      )
                }
              >
                {pix.phase === 'busy'
                  ? 'Gerando…'
                  : pix.phase === 'ready'
                    ? '📱 Ver código PIX'
                    : '📱 Gerar código PIX'}
              </button>
            )}
            {pix.phase === 'approved' && (
              <div
                className="pay-confirmed"
                id="pay-confirmed"
                role="status"
                aria-live="polite"
              >
                <span className="pay-check" aria-hidden="true">
                  ✓
                </span>
                <h2>PIX pago!</h2>
                <p>
                  Pagamento confirmado. O responsável recebeu o aviso e fará a
                  renovação do seu acesso.
                </p>
              </div>
            )}
            <div
              className={`pay-qr-box ${pix.phase === 'pending' ? 'on' : ''}`}
              id="pay-qr-box"
            >
              {pix.payment?.qrBase64 && (
                <img
                  id="pay-qr-img"
                  src={`data:image/png;base64,${pix.payment.qrBase64}`}
                  alt="QR Code PIX"
                />
              )}
              <textarea
                ref={code}
                className="pay-pix-code"
                id="pay-pix-code"
                readOnly
                value={pix.payment?.qrText || ''}
                aria-label="PIX Copia e Cola"
              />
              <button
                className="pay-copy"
                type="button"
                id="pay-copy"
                onClick={() => pix.copy(code.current)}
              >
                {pix.copied ? '✓ Copiado!' : '📋 Copiar código PIX'}
              </button>
            </div>
            {pix.phase !== 'approved' && (
              <div className="pay-status-msg" id="pay-status-msg">
                {pix.message && (
                  <PanelNotice
                    inline
                    title="Pagamento"
                    text={pix.message}
                    error={pix.phase === 'idle'}
                    info={pix.phase !== 'idle'}
                    pending={pix.phase === 'busy'}
                  />
                )}
              </div>
            )}
          </div>
          <div className="pay-foot">
            Confira seus dados e gere o PIX. Após a confirmação do pagamento, o
            responsável fará a renovação do seu acesso.
          </div>
        </div>
      </div>
    </>
  );
}
