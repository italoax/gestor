window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initTables = function ({ on }) {
  // Mapeia o texto do select de "Status" (Ativo / Vence hoje / Vencido / Inativo / Pra vencer)
  // para o `data-vencimento-status` da linha — antes era `text.includes(value)`, que
  // dava match em "Ativo" mesmo para vencido (a palavra "Ativo" aparecia em outras
  // colunas do row).
  const STATUS_TYPE_MAP = {
    ativo: (t) => t === 'nao-vencido',
    'vence hoje': (t) => t === 'today',
    vencido: (t) => t === 'vencido',
    // "Pra vencer" = clientes que vencem em 1 a 3 dias (definido em format.ts).
    'pra vencer': (t) => t === 'pra-vencer',
  };
  const normalizeSearchText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const applyTableScopeFilters = (scope) => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    const term = normalizeSearchText(input ? input.value : '');
    const activeSelects = selects
      .map((sel) => normalizeSearchText(sel.value))
      .filter(Boolean);
    const vencimentoValue = vencimentoFilter ? vencimentoFilter.value : '';
    const items = scope.querySelectorAll('[data-search-item]');
    let visibleCount = 0;
    items.forEach((item) => {
      const text = normalizeSearchText(
        item.dataset.searchText ?? item.textContent,
      );
      const status = item.dataset.vencimentoStatus || '';
      const matchSearch = !term || text.includes(term);
      const matchSelects = activeSelects.every((value) => {
        // Se o valor do select corresponde a um rótulo de status, casa pelo tipo
        // do badge (data-vencimento-status). Senão, busca o texto na linha.
        const statusMatcher = STATUS_TYPE_MAP[value];
        if (statusMatcher) return statusMatcher(status);
        return text.includes(value);
      });
      const matchVencimento =
        !vencimentoValue ||
        status === vencimentoValue ||
        (vencimentoValue === 'nao-vencido' && status !== 'vencido');
      const visible = matchSearch && matchSelects && matchVencimento;
      item.classList.toggle('hidden', !visible);
      if (visible) visibleCount++;
    });
    const clearSearch = scope.querySelector('[data-clear-search]');
    if (clearSearch) clearSearch.hidden = !input || !input.value;
    const result = scope.querySelector('[data-search-results]');
    if (result) {
      const singular = scope.dataset.searchSingular || 'cliente';
      const plural = scope.dataset.searchPlural || 'clientes';
      result.hidden = !term && !activeSelects.length && !vencimentoValue;
      result.textContent =
        visibleCount === 0
          ? scope.dataset.searchEmpty ||
            'Nenhum cliente encontrado. Tente outro nome ou número.'
          : visibleCount +
            (visibleCount === 1
              ? ' ' + singular + ' encontrado'
              : ' ' + plural + ' encontrados') +
            ' de ' +
            items.length +
            '.';
    }
  };

  // Visual de filtro ativo: marca o wrapper .cli-filter quando o select tem valor,
  // e mostra/esconde o botao "Limpar" baseado em ter algo filtrado. Sem isso, o
  // user nao percebe quais filtros estao aplicados (todos os selects parecem iguais).
  const refreshFilterChips = (scope) => {
    const selects = scope.querySelectorAll('[data-filter-select]');
    let temAlgum = false;
    selects.forEach((sel) => {
      const ativo = !!sel.value;
      const wrap = sel.closest('.cli-filter');
      if (wrap) wrap.classList.toggle('is-active', ativo);
      if (ativo) temAlgum = true;
    });
    const searchInput = scope.querySelector('[data-search-input]');
    if (searchInput && searchInput.value.trim()) temAlgum = true;
    const clearBtn = scope.querySelector('[data-clear-filters]');
    if (clearBtn) clearBtn.classList.toggle('is-visible', temAlgum);
  };

  document.querySelectorAll('[data-search-scope]').forEach((scope) => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    const apply = () => {
      applyTableScopeFilters(scope);
      refreshFilterChips(scope);
    };
    if (input) input.addEventListener('input', apply);
    const clearSearch = scope.querySelector('[data-clear-search]');
    if (clearSearch && input)
      clearSearch.addEventListener('click', () => {
        input.value = '';
        apply();
        input.focus({ preventScroll: true });
      });
    selects.forEach((sel) => sel.addEventListener('change', apply));
    if (vencimentoFilter) vencimentoFilter.addEventListener('change', apply);
    refreshFilterChips(scope);
    if (scope.querySelector('[data-search-results]')) apply();
  });

  // Linha selecionada (check da tabela): destaque visual + "selecionar todos" no cabeçalho.
  // Delegado no document pra cobrir rows criadas via AJAX (cadastro/edição inline).
  on(document, 'change', (e) => {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('cli-check')) return;
    if (t.hasAttribute('data-check-all')) {
      const table = t.closest('table');
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach((row) => {
        const cb = row.querySelector('input.cli-check');
        if (cb && !row.classList.contains('hidden')) {
          cb.checked = t.checked;
          row.classList.toggle('is-selected', t.checked);
        }
      });
    } else {
      const row = t.closest('tr');
      if (row) row.classList.toggle('is-selected', t.checked);
      // Se desmarcou uma linha, desmarca o "todos" do header.
      const table = t.closest('table');
      const header =
        table && table.querySelector('input.cli-check[data-check-all]');
      if (header && !t.checked) header.checked = false;
    }
  });

  const normalizeSortText = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const getSortValue = (row, columnIndex, type) => {
    const cell = row.children[columnIndex];
    const raw = cell ? cell.dataset.sortValue || cell.textContent || '' : '';
    if (type === 'number') {
      return (
        Number(
          String(raw)
            .replace(/[^0-9,-]+/g, '')
            .replace(',', '.'),
        ) || 0
      );
    }
    if (type === 'date') {
      const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso)
        return (
          Number(
            new Date(iso[1] + '-' + iso[2] + '-' + iso[3] + 'T00:00:00'),
          ) || 0
        );
      const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br)
        return (
          Number(new Date(br[3] + '-' + br[2] + '-' + br[1] + 'T00:00:00')) || 0
        );
      return 0;
    }
    return normalizeSortText(raw);
  };

  document.querySelectorAll('table').forEach((table) => {
    table
      .querySelectorAll('tbody tr[data-search-item]')
      .forEach((row, index) => {
        row.dataset.originalIndex = String(index);
      });
  });

  const clearSortButtons = (table) => {
    table.querySelectorAll('[data-sort-toggle]').forEach((other) => {
      other.classList.remove('active', 'asc', 'desc');
      other.removeAttribute('data-sort-state');
    });
  };

  const restoreOriginalTableOrder = (tbody) => {
    Array.from(tbody.querySelectorAll('tr[data-search-item]'))
      .sort(
        (a, b) =>
          Number(a.dataset.originalIndex || 0) -
          Number(b.dataset.originalIndex || 0),
      )
      .forEach((row) => tbody.appendChild(row));
  };

  document.querySelectorAll('[data-sort-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const table = document.querySelector(btn.dataset.sortTable);
      const tbody = table ? table.querySelector('tbody') : null;
      if (!tbody) return;

      const currentState = btn.dataset.sortState || '';
      const nextState =
        currentState === '' ? 'asc' : currentState === 'asc' ? 'desc' : '';
      const column = Number(btn.dataset.sortColumn || 0);
      const type = btn.dataset.sortType || 'text';

      clearSortButtons(table);

      if (!nextState) {
        restoreOriginalTableOrder(tbody);
        return;
      }

      const direction = nextState === 'desc' ? -1 : 1;
      const rows = Array.from(tbody.querySelectorAll('tr[data-search-item]'));
      rows
        .sort((a, b) => {
          const aValue = getSortValue(a, column, type);
          const bValue = getSortValue(b, column, type);
          if (aValue < bValue) return -1 * direction;
          if (aValue > bValue) return 1 * direction;
          return (
            Number(a.dataset.originalIndex || 0) -
            Number(b.dataset.originalIndex || 0)
          );
        })
        .forEach((row) => tbody.appendChild(row));

      btn.dataset.sortState = nextState;
      btn.classList.add('active', nextState);
    });
  });

  document.querySelectorAll('[data-clear-filters]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.closest('[data-search-scope]') || document;
      scope
        .querySelectorAll('[data-filter-select], [data-vencimento-filter]')
        .forEach((sel) => {
          sel.selectedIndex = 0;
        });
      scope.querySelectorAll('[data-search-input]').forEach((input) => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      applyTableScopeFilters(scope);
      if (typeof refreshFilterChips === 'function') refreshFilterChips(scope);
    });
  });
};
