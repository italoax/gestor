import { lerCampanha } from '../services/campanhas.ts';
import { appNowSql } from '../services/dates.ts';
import { normalizeDateInput } from '../services/format.ts';

export function createCampaignActions({
  queryRows,
  queryOne,
  execute,
  withTransaction,
}) {
  return {
    async clients(input, reply) {
      const userId = input.session.user.id;
      const termo = String(input.query.termo || '')
        .trim()
        .slice(0, 120);
      const pagina = Math.max(
        1,
        Math.min(100000, Number(input.query.pagina) || 1),
      );
      const rows = await queryRows(
        `SELECT id, nome, telefone, servidor FROM clientes
         WHERE user_id = :userId AND arquivado = 0 AND status = 'Ativo'
           AND (nome LIKE :termo OR telefone LIKE :termo)
         ORDER BY nome, id LIMIT 51 OFFSET ${Math.floor(pagina - 1) * 50}`,
        { userId, termo: `%${termo}%` },
      );
      reply.set('Cache-Control', 'no-store').json({
        ok: true,
        clientes: rows.slice(0, 50).map(({ id, nome, telefone, servidor }) => ({
          id,
          nome,
          telefone,
          servidor,
        })),
        mais: rows.length > 50,
      });
    },
    async change(input, reply) {
      const userId = input.session.user.id;
      const body = input.body;
      const action = String(body.action);
      const id = Number(body.id);
      const redirect = () => reply.redirect('/automacao?aba=envios');
      try {
        let previous;
        if (action !== 'create_campanha') {
          previous = await queryOne(
            'SELECT id, status, campanha_config AS campanhaConfig FROM cobrancas WHERE id=:id AND user_id=:userId AND campanha_config IS NOT NULL',
            { id, userId },
          );
          if (!previous) throw new Error('Envio não encontrado.');
        }
        if (action === 'delete_campanha') {
          await execute(
            'DELETE FROM cobrancas WHERE id=:id AND user_id=:userId AND campanha_config IS NOT NULL',
            { id, userId },
          );
          input.flash('success', 'Envio automático excluído.');
          return redirect();
        }
        if (action === 'pause_campanha') {
          await execute(
            "UPDATE cobrancas SET status='Pausada', automatica=0 WHERE id=:id AND user_id=:userId AND campanha_config IS NOT NULL AND status='Ativo'",
            { id, userId },
          );
          input.flash(
            'success',
            'Envio pausado. Novas mensagens não serão iniciadas.',
          );
          return redirect();
        }
        if (action === 'resume_campanha') {
          if (previous.status !== 'Pausada')
            throw new Error('Somente envios pausados podem ser retomados.');
          lerCampanha(previous.campanhaConfig);
          await execute(
            "UPDATE cobrancas SET status='Ativo', automatica=1, ultima_execucao='1970-01-01 00:00:00' WHERE id=:id AND user_id=:userId AND status='Pausada'",
            { id, userId },
          );
          input.flash(
            'success',
            'Envio retomado. Mensagens confirmadas ou sem confirmação segura não serão repetidas.',
          );
          return redirect();
        }
        if (!['create_campanha', 'update_campanha'].includes(action))
          throw new Error('Ação inválida.');
        const titulo = String(body.nome || '').trim();
        if (!titulo || titulo.length > 160)
          throw new Error(
            'Informe um nome para o envio com até 160 caracteres.',
          );
        const rawIds = body['clientes_ids[]'] ?? body.clientes_ids;
        const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(Number);
        const modo = String(body.modo);
        const data =
          modo === 'unico' ? normalizeDateInput(body.data_envio) : null;
        const config = lerCampanha({
          versao: 1,
          modo,
          data,
          mensagem: String(body.mensagem || '').trim(),
          clientesIds: ids,
          chave: previous
            ? lerCampanha(previous.campanhaConfig).chave
            : String(body.chave || ''),
        });
        const hora = String(body.hora_envio || '');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora))
          throw new Error('Informe um horário válido.');
        if (modo === 'unico' && `${data} ${hora}` <= appNowSql().slice(0, 16))
          throw new Error('Escolha uma data e um horário futuros.');
        const rawDays = body['dias_semana[]'] ?? body.dias_semana;
        const dias =
          modo === 'semanal'
            ? [
                ...new Set(
                  (Array.isArray(rawDays) ? rawDays : [rawDays]).map(Number),
                ),
              ]
            : [];
        if (
          modo === 'semanal' &&
          (!dias.length ||
            dias.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6))
        )
          throw new Error('Selecione pelo menos um dia da semana.');
        const params: Record<string, any> = { userId };
        const placeholders = config.clientesIds.map((clientId, index) => {
          params['cliente' + index] = clientId;
          return ':cliente' + index;
        });
        const owned = await queryRows(
          `SELECT id FROM clientes WHERE user_id=:userId AND arquivado=0 AND status='Ativo' AND id IN (${placeholders.join(',')})`,
          params,
        );
        if (owned.length !== config.clientesIds.length)
          throw new Error(
            'Selecione clientes ativos e não arquivados da sua conta.',
          );
        const values = {
          userId,
          id,
          titulo,
          config: JSON.stringify(config),
          hora,
          dias: dias.join(',') || null,
        };
        await withTransaction(async (conn) => {
          if (previous) {
            const [current] = await conn.query(
              'SELECT campanha_config AS campanhaConfig FROM cobrancas WHERE id=:id AND user_id=:userId AND campanha_config IS NOT NULL FOR UPDATE',
              { id, userId },
            );
            if (!current.length) throw new Error('Envio não encontrado.');
            if (lerCampanha(current[0].campanhaConfig).modo === 'unico') {
              const [attempted] = await conn.query(
                'SELECT id FROM cobrancas_envios WHERE cobranca_id=:id LIMIT 1',
                { id },
              );
              if (attempted.length)
                throw new Error(
                  'Este envio já foi iniciado. Crie um novo agendamento para enviar outra mensagem.',
                );
            }
            await conn.execute(
              "UPDATE cobrancas SET titulo=:titulo, campanha_config=:config, hora_envio=:hora, dias_semana=:dias, status='Ativo', automatica=1 WHERE id=:id AND user_id=:userId AND campanha_config IS NOT NULL",
              values,
            );
          } else {
            await conn.query(
              'SELECT id FROM users WHERE id=:userId FOR UPDATE',
              { userId },
            );
            const [existing] = await conn.query(
              "SELECT id FROM cobrancas WHERE user_id=:userId AND JSON_UNQUOTE(JSON_EXTRACT(campanha_config,'$.chave'))=:chave LIMIT 1",
              { userId, chave: config.chave },
            );
            if (existing.length) return;
            await conn.execute(
              `INSERT INTO cobrancas (user_id,titulo,tipo,periodo,status,automatica,mensagem_id,hora_envio,dias_semana,min_delay,max_delay,ultima_execucao,campanha_config)
            VALUES (:userId,:titulo,'Todos',0,'Ativo',1,NULL,:hora,:dias,5,15,'1970-01-01 00:00:00',:config)`,
              values,
            );
          }
        });
        input.flash(
          'success',
          previous
            ? 'Envio automático atualizado.'
            : 'Envio automático agendado.',
        );
      } catch (error) {
        if (error?.code) throw error;
        input.flash(
          'error',
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o envio.',
        );
      }
      return redirect();
    },
  };
}
