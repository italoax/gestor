export function PayerDetails({ disabled = false }: { disabled?: boolean }) {
  const field = { display: 'grid', gap: 8, marginBottom: 16, fontSize: 14 };
  const input = {
    width: '100%',
    minHeight: 48,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    fontSize: 16,
  };
  return (
    <div className="payment-payer-details">
      <label style={field}>
        Nome completo do pagador
        <input
          style={input}
          name="payerName"
          autoComplete="name"
          minLength={3}
          maxLength={255}
          required
          disabled={disabled}
        />
      </label>
      <label style={field}>
        E-mail para o pagamento
        <input
          style={input}
          type="email"
          name="payerEmail"
          autoComplete="email"
          maxLength={254}
          required
          disabled={disabled}
        />
      </label>
      <label style={field}>
        CPF ou CNPJ do pagador
        <input
          style={input}
          name="payerDocument"
          autoComplete="off"
          minLength={11}
          maxLength={18}
          required
          disabled={disabled}
        />
      </label>
    </div>
  );
}
