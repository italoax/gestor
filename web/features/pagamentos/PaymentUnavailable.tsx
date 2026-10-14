export function PaymentUnavailable({ invalid = false }: { invalid?: boolean }) {
  return (
    <>
      <link rel="stylesheet" href="/assets/css/native-payment.css" />
      <div className="pay-wrap">
        <div className="pay-card">
          <div className="pay-body" style={{ textAlign: 'center' }}>
            <div aria-hidden="true" style={{ fontSize: 48 }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: 20 }}>
              {invalid ? 'Link inválido' : 'Pagamento indisponível'}
            </h1>
            <p>
              {invalid
                ? 'Link de pagamento inválido ou expirado.'
                : 'Não foi possível carregar o pagamento. Entre em contato com o responsável pela assinatura ou tente novamente mais tarde.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
