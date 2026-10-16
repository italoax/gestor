// O supervisor abre um canal IPC para cada filho. Até um SIGKILL no pai
// fecha esse canal; sem esta proteção, backend e worker podem ficar órfãos.
// Chamar depois de enableShutdownHooks(), para usar a limpeza do Nest.
export function stopWhenSupervisorExits() {
  if (typeof process.send !== 'function') return;
  const stop = () => {
    process.emit('SIGTERM', 'SIGTERM');
  };
  if (!process.connected) stop();
  else process.once('disconnect', stop);
}
