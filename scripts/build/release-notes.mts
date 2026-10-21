import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../src/config/paths.ts';

export function readReleaseNotes(root = projectRoot) {
  try {
    const history = execFileSync(
      'git',
      ['log', '-1', '--format=%H%x00%cI%x00%s%x00%b%x1e'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .split('\x1e')
      .filter((record) => record.trim())
      .map((record) => {
        const [rawVersion, date, subject, body = ''] = record
          .trim()
          .split('\0');
        if (!rawVersion || !subject || !Number.isFinite(Date.parse(date)))
          throw new Error('Commit sem metadados válidos.');
        const prefix =
          /^(feat|fix|chore|refactor|perf|docs|style|test|build|ci)(?:\([^)]*\))?!?:\s*/i;
        const type = subject.match(prefix)?.[1]?.toLowerCase();
        const categories: Record<string, string> = {
          feat: 'Novas funcionalidades',
          fix: 'Correções',
          perf: 'Desempenho',
          style: 'Visual e organização',
          docs: 'Documentação',
          refactor: 'Melhorias',
        };
        // Preserva os parágrafos e todos os detalhes; remove apenas créditos do Git.
        const description = body
          .split(/\r?\n/)
          .filter(
            (line) => !/^(?:Signed-off-by|Co-authored-by):/i.test(line.trim()),
          )
          .join('\n')
          .trim();
        return {
          version: rawVersion,
          date,
          title: subject.replace(prefix, '').trim(),
          category: categories[type] || 'Atualização do sistema',
          description,
        };
      });
    if (!history.length) throw new Error('Histórico indisponível.');
    const latest = history[0];
    return {
      ...latest,
      changes: [
        latest.title,
        ...latest.description
          .split('\n')
          .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
          .filter(Boolean),
      ],
      history,
    };
  } catch {
    // Builds sem o histórico Git continuam exibindo um aviso útil.
    return {
      version: 'release',
      date: null,
      title: 'Atualização do painel',
      category: 'Atualização do sistema',
      description:
        'Os detalhes desta atualização não foram incluídos na publicação.',
      changes: ['Melhorias e correções disponíveis nesta versão do painel.'],
    };
  }
}

export function writeReleaseNotes() {
  const output = path.join(projectRoot, 'public');
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, 'updates.json'),
    JSON.stringify(readReleaseNotes(), null, 2) + '\n',
  );
}
