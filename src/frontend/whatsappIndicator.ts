export interface WhatsappIndicator {
  connected?: boolean;
  disconnectedChecks: number;
  deviceId?: number;
}

export function advanceWhatsappIndicator(
  previous: WhatsappIndicator,
  state: any,
): WhatsappIndicator {
  const current: WhatsappIndicator =
    state?.deviceId && previous.deviceId && state.deviceId !== previous.deviceId
      ? { disconnectedChecks: 0, deviceId: state.deviceId }
      : previous;
  const status = String(state?.status || '')
    .trim()
    .toLowerCase();
  const deviceId = Number(state?.deviceId) || current.deviceId;
  if (state?.connected === true || status === 'conectado')
    return { connected: true, disconnectedChecks: 0, deviceId };
  // Reinicialização, erro e resposta incompleta não comprovam uma queda.
  if (
    !['desconectado', 'disconnected', 'closed', 'qr', 'pairing'].includes(
      status,
    )
  )
    return {
      connected: current.connected === true ? true : undefined,
      disconnectedChecks: 0,
      deviceId,
    };
  const disconnectedChecks = Math.min(2, current.disconnectedChecks + 1);
  return {
    connected: disconnectedChecks >= 2 ? false : current.connected,
    disconnectedChecks,
    deviceId,
  };
}
