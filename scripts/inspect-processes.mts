import { readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { projectRoot } from '../src/config/paths.ts';
import { currentThreadCount } from '../src/config/processResources.ts';

// Não lê argumentos nem variáveis de outros processos: podem conter segredos.
if (process.platform !== 'linux') {
  console.log(
    'Execute este diagnóstico na hospedagem Linux para medir processos e threads da conta.',
  );
  console.log(
    JSON.stringify({
      pid: process.pid,
      platform: process.platform,
      threads: currentThreadCount(),
    }),
  );
} else {
  const root = realpathSync(projectRoot);
  const ownUid = process.getuid?.();
  const processes: {
    pid: number;
    parentPid: number;
    name: string;
    threads: number;
    currentProject: boolean;
    diagnostic: boolean;
  }[] = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const status = readFileSync(`/proc/${entry}/status`, 'utf8');
      const field = (key: string) =>
        status.match(new RegExp(`^${key}:\\s+(.+)$`, 'm'))?.[1];
      if (Number(field('Uid')?.split(/\s+/)[0]) !== ownUid) continue;
      let currentProject = false;
      try {
        currentProject = readlinkSync(`/proc/${entry}/cwd`) === root;
      } catch {}
      processes.push({
        pid: Number(entry),
        parentPid: Number(field('PPid')),
        name: field('Name') || 'unknown',
        threads: Number(field('Threads') || 1),
        currentProject,
        diagnostic: Number(entry) === process.pid,
      });
    } catch {
      // O processo pode encerrar durante a leitura.
    }
  }
  console.table(processes.sort((a, b) => b.threads - a.threads));
  console.log(
    JSON.stringify(
      {
        accountProcesses: processes.length,
        accountThreads: processes.reduce(
          (total, item) => total + item.threads,
          0,
        ),
        projectProcesses: processes.filter(
          (item) => item.currentProject && !item.diagnostic,
        ).length,
        projectThreads: processes
          .filter((item) => item.currentProject && !item.diagnostic)
          .reduce((total, item) => total + item.threads, 0),
      },
      null,
      2,
    ),
  );
}
