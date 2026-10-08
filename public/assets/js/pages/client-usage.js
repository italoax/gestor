window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClientUsage = function ({ setDateInputValue }) {
  // Sync no modal de renovacao:
  // O plano conta em meses de calendario? Aceita 'Mes', 'Mês' e 'Meses' — o form
  // de planos grava 'Meses' mas o default do banco e 'Mês'.
  const periodoEmMeses = (tipo) =>
    /^mes/.test(
      String(tipo || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim(),
    );

  // base + (periodo × vezes) em dias OU meses de calendario.
  // ESPELHA core/format.py::somar_periodo — os dois tem que concordar, senao o
  // modal sugere uma data e a renovacao automatica por PIX grava outra.
  // Em meses o dia e preso ao ultimo dia valido: 31/01 + 1 mes = 28/02.
  const somarPeriodo = (base, periodo, tipo, vezes) => {
    const n = Number(periodo) * Number(vezes || 1);
    if (!periodoEmMeses(tipo)) {
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    }
    const total = base.getMonth() + n;
    const ano = base.getFullYear() + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    return new Date(ano, mes, Math.min(base.getDate(), ultimoDia));
  };

  // - O input "Creditos" eh o driver. Se nao tiver (form de cadastro), cai pra telas.
  // - Custo = creditos × valorCred do servidor.
  // - Valor = creditos × valor do plano (so no modal de renovacao, ver valorBase).
  // - Vencimento = data-base + creditos × periodo do plano (so no modal de renovacao,
  //   identificado por form.dataset.baseVencIso + form.dataset.periodoQtd).
  const syncClienteUsageFields = (form) => {
    if (!form) return;
    const creditosInput = form.querySelector(
      '[data-creditos-input], [name="creditos_gastos"]',
    );
    const telasInput = form.querySelector('[data-telas-input], [name="telas"]');
    const servidorSelect = form.querySelector('[name="servidor"]');
    const custoInput = form.querySelector('[name="custo_pagamento"]');
    const valorInput = form.querySelector('[name="valor"]');

    // creditos = numero de PERIODOS renovados (o campo "Creditos" do modal). Cada
    // periodo estende o vencimento e multiplica valor/custo. NAO confundir com o
    // consumo do servidor, que e telas × periodos (ver custo abaixo).
    const creditos = Math.max(1, Number(creditosInput?.value || 0) || 1);
    // telas do cliente na renovacao (campo oculto, fixo) — no cadastro/edicao esse
    // querySelector pega o campo visivel, mas la nao ha custoInput, entao so afeta
    // o custo dentro do modal de renovacao.
    const telasRenov = Math.max(1, Number(telasInput?.value) || 1);

    const selected = servidorSelect?.selectedOptions?.[0];
    const valorCred = Number(
      selected?.getAttribute('data-valor-cred') ?? form.dataset.valorCred ?? 0,
    );
    // Custo = valorCred × telas × periodos. As telas entram porque cada tela e uma
    // linha no servidor: 2 telas renovando 3 meses consomem 6 creditos (R$ 6×valorCred).
    const creditosPlano = Number(form.dataset.creditosPlano) || 1;
    if (custoInput)
      custoInput.value = (
        valorCred *
        telasRenov *
        creditos *
        creditosPlano
      ).toFixed(2);
    const resumoPeriodo = form.querySelector('[data-renovacao-periodo]');
    if (resumoPeriodo) {
      const duracao = Number(form.dataset.periodoQtd) * creditos;
      const unidade = periodoEmMeses(form.dataset.periodoTipo)
        ? duracao === 1
          ? 'mês'
          : 'meses'
        : duracao === 1
          ? 'dia'
          : 'dias';
      resumoPeriodo.textContent =
        'Renova por ' +
        duracao +
        ' ' +
        unidade +
        '. Consumo: ' +
        (telasRenov * creditos * creditosPlano).toLocaleString('pt-BR') +
        ' créditos do servidor.';
    }

    // Valor cobrado = valor do plano × creditos. Cada credito e um periodo inteiro
    // do plano (ja estende o vencimento e ja multiplica o custo), entao renovar 2
    // creditos de um plano de R$ 25 tem que cobrar R$ 50 — nao R$ 25.
    // So no modal de renovacao: valorBase so existe la (no cadastro o usuario digita
    // o valor na mao e nao pode ser sobrescrito).
    const valorBase = Number(form.dataset.valorBase);
    if (
      valorInput &&
      form.dataset.valorBase !== undefined &&
      Number.isFinite(valorBase)
    ) {
      valorInput.value = (valorBase * creditos).toFixed(2);
    }
    // Valor escalonado por telas (SO no cadastro/edicao, onde "Telas" e visivel):
    // dobrar as telas dobra o valor. Base = "valor por tela" (dataset.valorPorTela),
    // semeado ao abrir a edicao (valorAtual/telasAtuais) e reajustado quando o
    // usuario digita o valor na mao (ver o listener de 'valor' em bindClienteUsageFields).
    // No else pra nunca colidir com o valorBase da renovacao acima.
    else if (
      valorInput &&
      telasInput &&
      telasInput.type !== 'hidden' &&
      form.dataset.valorPorTela !== undefined
    ) {
      const porTela = Number(form.dataset.valorPorTela);
      const raw = String(telasInput.value).trim();
      const telasN = Number(raw);
      // So recalcula com telas valida (>=1). Campo vazio/0 durante a digitacao NAO
      // zera o valor — deixa o usuario terminar de digitar sem perder o preco.
      if (
        Number.isFinite(porTela) &&
        porTela > 0 &&
        raw !== '' &&
        Number.isFinite(telasN) &&
        telasN >= 1
      ) {
        valorInput.value = (porTela * telasN).toFixed(2);
      }
    }

    // Recalcula vencimento: base + creditos × periodo (so no modal de renovacao)
    const baseIso = form.dataset.baseVencIso;
    const periodoQtd = Number(form.dataset.periodoQtd || 0);
    const vencInput = form.querySelector('[name="vencimento"]');
    if (baseIso && periodoQtd > 0 && vencInput) {
      const parts = baseIso.split('-');
      const base = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
      );
      const novo = somarPeriodo(
        base,
        periodoQtd,
        form.dataset.periodoTipo,
        creditos,
      );
      const dd = String(novo.getDate()).padStart(2, '0');
      const mm = String(novo.getMonth() + 1).padStart(2, '0');
      setDateInputValue(vencInput, novo.getFullYear() + '-' + mm + '-' + dd);
    }
  };

  const bindClienteUsageFields = (form) => {
    if (!form) return;
    ['plano', 'servidor', 'telas', 'creditos_gastos'].forEach((name) => {
      const field = form.querySelector('[name="' + name + '"]');
      if (field) {
        field.addEventListener('input', () => syncClienteUsageFields(form));
        field.addEventListener('change', () => syncClienteUsageFields(form));
      }
    });
    // No cadastro/edicao, digitar o valor na mao REDEFINE o "valor por tela" — assim
    // um desconto/ajuste manual vira a nova base, e mudar as telas depois escala a
    // partir dele. Nao chama o sync (senao sobrescreveria o que esta sendo digitado)
    // e nao roda na renovacao (la o valor e ditado pelos creditos, valorBase).
    const valorField = form.querySelector('[name="valor"]');
    if (valorField) {
      valorField.addEventListener('input', () => {
        if (form.dataset.valorBase !== undefined) {
          const periodos = Math.max(
            1,
            Number(form.querySelector('[name="creditos_gastos"]')?.value) || 1,
          );
          form.dataset.valorBase = String(Number(valorField.value) / periodos);
          return;
        }
        const telasN = Math.max(
          1,
          Number(form.querySelector('[name="telas"]')?.value) || 1,
        );
        const v = Number(valorField.value);
        if (Number.isFinite(v) && v > 0)
          form.dataset.valorPorTela = String(v / telasN);
      });
    }
    syncClienteUsageFields(form);
  };

  bindClienteUsageFields(document.getElementById('modal-add-cliente-form'));
  bindClienteUsageFields(document.getElementById('modal-add-pagamento-form'));
  const renovacaoPlano = document.querySelector('[data-renovacao-plano]');
  if (renovacaoPlano)
    renovacaoPlano.addEventListener('change', () => {
      const form = renovacaoPlano.form;
      const option = renovacaoPlano.selectedOptions[0];
      form.dataset.periodoQtd = option?.dataset.periodo || '30';
      form.dataset.periodoTipo = option?.dataset.tipoPeriodo || 'Dias';
      form.dataset.creditosPlano = option?.dataset.creditosPlano || '1';
      syncClienteUsageFields(form);
    });

  return { syncClienteUsageFields, somarPeriodo };
};
