document.addEventListener('DOMContentLoaded', function () {
  const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const getOpenModals = () => Array.from(document.querySelectorAll('.modal-overlay.open'));
  const getTopOpenModal = () => {
    const open = getOpenModals();
    return open.length ? open[open.length - 1] : null;
  };
  const syncModalUiState = () => {
    const hasOpenModal = getOpenModals().length > 0;
    document.body.classList.toggle('modal-open', hasOpenModal);
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      const isOpen = overlay.classList.contains('open');
      overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      if (isOpen) {
        overlay.removeAttribute('inert');
      } else {
        overlay.setAttribute('inert', '');
      }
    });
  };

  const setModalState = (modal, isOpen, triggerSelector = null) => {
    if (!modal) return;
    if (isOpen) {
      if (!triggerSelector && document.activeElement instanceof HTMLElement) {
        modal._lastFocusedEl = document.activeElement;
      }
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      modal.removeAttribute('inert');
      if (triggerSelector) modal.dataset.lastTrigger = triggerSelector;
      syncModalUiState();
      const focusable = modal.querySelector(focusableSelector);
      if (focusable) focusable.focus();
    } else {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      syncModalUiState();
      if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      if (modal.dataset.lastTrigger) {
        const el = document.querySelector(modal.dataset.lastTrigger);
        if (el) el.focus();
      } else if (modal._lastFocusedEl && typeof modal._lastFocusedEl.focus === 'function') {
        modal._lastFocusedEl.focus();
      }
    }
  };

  const showNoticeModal = (message, type = 'success') => {
    const modal = document.getElementById('modal-notice');
    const msg = document.getElementById('modal-notice-message');
    if (!modal || !msg) return false;
    msg.textContent = message;
    msg.classList.remove('success', 'error');
    msg.classList.add(type === 'error' ? 'error' : 'success');
    setModalState(modal, true);
    return true;
  };
  const dropdowns = document.querySelectorAll('[data-dropdown]');
  dropdowns.forEach(d => {
    const trigger = d.querySelector('.nav-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdowns.forEach(other => { if (other !== d) other.classList.remove('open'); });
      d.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    dropdowns.forEach(d => d.classList.remove('open'));
  });

  const hamburger = document.querySelector('[data-hamburger]');
  const nav = document.querySelector('[data-nav]');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  // Alternância de tema claro/escuro (persistido em localStorage).
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const next = isLight ? 'dark' : 'light';
      if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('gestor-theme', next); } catch (e) {}
    });
  });

  document.querySelectorAll('[data-switch] input').forEach(input => {
    input.addEventListener('change', () => {
      const status = input.closest('[data-switch]').querySelector('.switch-status');
      status.textContent = input.checked ? 'Ativa' : 'Inativa';
    });
  });

  const phonePrefixes = [
    ['+93','Afeganistão'],['+355','Albânia'],['+213','Argélia'],['+1684','Samoa Americana'],['+376','Andorra'],['+244','Angola'],['+1264','Anguilla'],['+1268','Antígua e Barbuda'],['+54','Argentina'],['+374','Armênia'],['+297','Aruba'],['+61','Austrália'],['+43','Áustria'],['+994','Azerbaijão'],['+1242','Bahamas'],['+973','Bahrein'],['+880','Bangladesh'],['+1246','Barbados'],['+375','Belarus'],['+32','Bélgica'],['+501','Belize'],['+229','Benin'],['+1441','Bermudas'],['+975','Butão'],['+591','Bolívia'],['+387','Bósnia e Herzegovina'],['+267','Botsuana'],['+55','Brasil'],['+246','Território Britânico do Oceano Índico'],['+673','Brunei'],['+359','Bulgária'],['+226','Burkina Faso'],['+257','Burundi'],['+855','Camboja'],['+237','Camarões'],['+1','Canadá / Estados Unidos'],['+238','Cabo Verde'],['+1345','Ilhas Cayman'],['+236','República Centro-Africana'],['+235','Chade'],['+56','Chile'],['+86','China'],['+57','Colômbia'],['+269','Comores'],['+242','Congo'],['+243','República Democrática do Congo'],['+682','Ilhas Cook'],['+506','Costa Rica'],['+225','Costa do Marfim'],['+385','Croácia'],['+53','Cuba'],['+599','Curaçao / Caribe Neerlandês'],['+357','Chipre'],['+420','Tchéquia'],['+45','Dinamarca'],['+253','Djibuti'],['+1767','Dominica'],['+1809','República Dominicana'],['+1829','República Dominicana'],['+1849','República Dominicana'],['+593','Equador'],['+20','Egito'],['+503','El Salvador'],['+240','Guiné Equatorial'],['+291','Eritreia'],['+372','Estônia'],['+268','Essuatíni'],['+251','Etiópia'],['+500','Ilhas Malvinas'],['+298','Ilhas Faroe'],['+679','Fiji'],['+358','Finlândia'],['+33','França'],['+594','Guiana Francesa'],['+689','Polinésia Francesa'],['+241','Gabão'],['+220','Gâmbia'],['+995','Geórgia'],['+49','Alemanha'],['+233','Gana'],['+350','Gibraltar'],['+30','Grécia'],['+299','Groenlândia'],['+1473','Granada'],['+590','Guadalupe / São Bartolomeu / São Martinho'],['+1671','Guam'],['+502','Guatemala'],['+44','Reino Unido / Guernsey / Ilha de Man / Jersey'],['+224','Guiné'],['+245','Guiné-Bissau'],['+592','Guiana'],['+509','Haiti'],['+504','Honduras'],['+852','Hong Kong'],['+36','Hungria'],['+354','Islândia'],['+91','Índia'],['+62','Indonésia'],['+98','Irã'],['+964','Iraque'],['+353','Irlanda'],['+972','Israel'],['+39','Itália / Vaticano'],['+1876','Jamaica'],['+81','Japão'],['+962','Jordânia'],['+7','Rússia / Cazaquistão'],['+254','Quênia'],['+686','Kiribati'],['+850','Coreia do Norte'],['+82','Coreia do Sul'],['+965','Kuwait'],['+996','Quirguistão'],['+856','Laos'],['+371','Letônia'],['+961','Líbano'],['+266','Lesoto'],['+231','Libéria'],['+218','Líbia'],['+423','Liechtenstein'],['+370','Lituânia'],['+352','Luxemburgo'],['+853','Macau'],['+261','Madagascar'],['+265','Malawi'],['+60','Malásia'],['+960','Maldivas'],['+223','Mali'],['+356','Malta'],['+692','Ilhas Marshall'],['+596','Martinica'],['+222','Mauritânia'],['+230','Maurício'],['+262','Mayotte / Reunião'],['+52','México'],['+691','Micronésia'],['+373','Moldávia'],['+377','Mônaco'],['+976','Mongólia'],['+382','Montenegro'],['+1664','Montserrat'],['+212','Marrocos'],['+258','Moçambique'],['+95','Myanmar'],['+264','Namíbia'],['+674','Nauru'],['+977','Nepal'],['+31','Países Baixos'],['+687','Nova Caledônia'],['+64','Nova Zelândia'],['+505','Nicarágua'],['+227','Níger'],['+234','Nigéria'],['+683','Niue'],['+672','Norfolk / Antártida Australiana'],['+389','Macedônia do Norte'],['+1670','Ilhas Marianas do Norte'],['+47','Noruega / Svalbard'],['+968','Omã'],['+92','Paquistão'],['+680','Palau'],['+970','Palestina'],['+507','Panamá'],['+675','Papua-Nova Guiné'],['+595','Paraguai'],['+51','Peru'],['+63','Filipinas'],['+48','Polônia'],['+351','Portugal'],['+1787','Porto Rico'],['+1939','Porto Rico'],['+974','Catar'],['+40','Romênia'],['+250','Ruanda'],['+290','Santa Helena'],['+1869','São Cristóvão e Névis'],['+1758','Santa Lúcia'],['+508','Saint Pierre e Miquelon'],['+1784','São Vicente e Granadinas'],['+685','Samoa'],['+378','San Marino'],['+239','São Tomé e Príncipe'],['+966','Arábia Saudita'],['+221','Senegal'],['+381','Sérvia'],['+248','Seychelles'],['+232','Serra Leoa'],['+65','Singapura'],['+421','Eslováquia'],['+386','Eslovênia'],['+677','Ilhas Salomão'],['+252','Somália'],['+27','África do Sul'],['+211','Sudão do Sul'],['+34','Espanha'],['+94','Sri Lanka'],['+249','Sudão'],['+597','Suriname'],['+46','Suécia'],['+41','Suíça'],['+963','Síria'],['+886','Taiwan'],['+992','Tajiquistão'],['+255','Tanzânia'],['+66','Tailândia'],['+670','Timor-Leste'],['+228','Togo'],['+690','Tokelau'],['+676','Tonga'],['+1868','Trinidad e Tobago'],['+216','Tunísia'],['+90','Turquia'],['+993','Turcomenistão'],['+1649','Turks e Caicos'],['+688','Tuvalu'],['+256','Uganda'],['+380','Ucrânia'],['+971','Emirados Árabes Unidos'],['+598','Uruguai'],['+998','Uzbequistão'],['+678','Vanuatu'],['+58','Venezuela'],['+84','Vietnã'],['+1284','Ilhas Virgens Britânicas'],['+1340','Ilhas Virgens Americanas'],['+681','Wallis e Futuna'],['+967','Iêmen'],['+260','Zâmbia'],['+263','Zimbábue']
  ];

  const normalizePrefixValue = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    return digits ? '+' + digits : '+55';
  };

  const findPrefixFromPhone = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    const sorted = phonePrefixes.map(item => item[0]).sort((a, b) => b.length - a.length);
    return sorted.find(prefix => digits.startsWith(prefix.replace(/\D+/g, ''))) || '+55';
  };

  const setPhonePrefix = (box, prefix) => {
    if (!box) return;
    const normalized = normalizePrefixValue(prefix);
    const btn = box.querySelector('[data-phone-prefix-toggle]');
    const input = box.querySelector('[data-phone-prefix-value]');
    if (btn) btn.textContent = normalized;
    if (input) input.value = normalized;
  };

  const getPhonePrefix = (input) => {
    const box = input && input.closest('.phone-control') ? input.closest('.phone-control').querySelector('[data-phone-prefix]') : null;
    const value = box ? box.querySelector('[data-phone-prefix-value]') : null;
    return normalizePrefixValue(value ? value.value : '+55');
  };

  const stripPhonePrefix = (value, prefix) => {
    let digits = String(value || '').replace(/\D+/g, '');
    const prefixDigits = normalizePrefixValue(prefix).replace(/\D+/g, '');
    if (digits.startsWith(prefixDigits) && digits.length > prefixDigits.length) digits = digits.slice(prefixDigits.length);
    return digits;
  };

  const formatPhoneValue = (value, prefix = '+55') => {
    let digits = stripPhonePrefix(value, prefix);
    if (normalizePrefixValue(prefix) !== '+55') {
      digits = digits.slice(0, 15);
      return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    }
    digits = digits.slice(0, 11);
    if (digits.length <= 2) return digits ? '(' + digits : '';
    if (digits.length <= 6) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
    if (digits.length <= 10) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
    return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
  };

  const formatPhoneInput = (input) => {
    if (!input) return;
    input.value = formatPhoneValue(input.value, getPhonePrefix(input));
  };

  const initPhonePrefixSelect = () => {
    document.querySelectorAll('[data-phone-prefix]').forEach(box => {
      const btn = box.querySelector('[data-phone-prefix-toggle]');
      const hidden = box.querySelector('[data-phone-prefix-value]');
      const menu = box.querySelector('.phone-prefix-menu');
      const search = box.querySelector('[data-phone-prefix-search]');
      const list = box.querySelector('[data-phone-prefix-list]');
      const phoneInput = box.closest('.phone-control') ? box.closest('.phone-control').querySelector('[data-phone-mask]') : null;
      if (!btn || !hidden || !menu || !list) return;

      const closeMenu = () => {
        box.classList.remove('open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      };
      const render = (term = '') => {
        const normalized = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        list.innerHTML = '';
        phonePrefixes
          .filter(([prefix, country]) => (prefix + ' ' + country).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalized))
          .forEach(([prefix, country]) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'phone-prefix-option' + (hidden.value === prefix ? ' active' : '');
            option.innerHTML = '<strong>' + prefix + '</strong><span class="phone-prefix-country">' + country + '</span>';
            option.addEventListener('click', () => {
              const oldPrefix = hidden.value;
              setPhonePrefix(box, prefix);
              if (phoneInput && oldPrefix !== prefix) formatPhoneInput(phoneInput);
              closeMenu();
            });
            list.appendChild(option);
          });
      };

      setPhonePrefix(box, hidden.value || '+55');
      render();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = menu.hidden;
        document.querySelectorAll('[data-phone-prefix] .phone-prefix-menu').forEach(other => { other.hidden = true; });
        document.querySelectorAll('[data-phone-prefix]').forEach(other => other.classList.remove('open'));
        menu.hidden = !open;
        box.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          render(search ? search.value : '');
          if (search) search.focus();
        }
      });
      if (search) search.addEventListener('input', () => render(search.value));
      document.addEventListener('click', (e) => {
        if (!box.contains(e.target)) closeMenu();
      });
    });
  };

  initPhonePrefixSelect();

  document.querySelectorAll('[data-phone-mask]').forEach(input => {
    formatPhoneInput(input);
    input.addEventListener('input', () => formatPhoneInput(input));
    input.addEventListener('paste', () => setTimeout(() => formatPhoneInput(input), 0));
  });

  const formatDateBrValue = (value, completeYear = false) => {
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const digits = text.replace(/\D+/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
    if (completeYear && digits.length === 6) return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/20' + digits.slice(4);
    return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  };

  const setDateInputValue = (input, value, completeYear = false) => {
    if (!input) return;
    input.value = formatDateBrValue(value, completeYear);
  };

  const isValidDateBrValue = (value) => {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return !String(value || '').trim();
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  };

  document.querySelectorAll('[data-date-mask]').forEach(input => {
    setDateInputValue(input, input.value);
    input.addEventListener('input', () => setDateInputValue(input, input.value));
    input.addEventListener('paste', () => setTimeout(() => setDateInputValue(input, input.value), 0));
    input.addEventListener('blur', () => {
      setDateInputValue(input, input.value, true);
      input.setCustomValidity(isValidDateBrValue(input.value) ? '' : 'Use uma data válida em dd/mm/aaaa.');
    });
    input.addEventListener('invalid', () => {
      input.setCustomValidity(isValidDateBrValue(input.value) ? '' : 'Use uma data válida em dd/mm/aaaa.');
    });
  });

  // Mapeia o texto do select de "Status" (Ativo / Vence hoje / Vencido / Inativo / Pra vencer)
  // para o `data-vencimento-status` da linha — antes era `text.includes(value)`, que
  // dava match em "Ativo" mesmo para vencido (a palavra "Ativo" aparecia em outras
  // colunas do row).
  const STATUS_TYPE_MAP = {
    'ativo': (t) => t === 'nao-vencido',
    'vence hoje': (t) => t === 'today',
    'vencido': (t) => t === 'vencido',
    'inativo': (t) => t === 'inativo',
    'pra vencer': (t) => t === 'today' || t === 'nao-vencido',
  };
  const applyTableScopeFilters = (scope) => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    const term = input ? input.value.toLowerCase().trim() : '';
    const activeSelects = selects
      .map(sel => (sel.value || '').toLowerCase().trim())
      .filter(Boolean);
    const vencimentoValue = vencimentoFilter ? vencimentoFilter.value : '';

    scope.querySelectorAll('[data-search-item]').forEach(item => {
      const text = item.textContent.toLowerCase();
      const status = item.dataset.vencimentoStatus || '';
      const matchSearch = !term || text.includes(term);
      const matchSelects = activeSelects.every(value => {
        // Se o valor do select corresponde a um rótulo de status, casa pelo tipo
        // do badge (data-vencimento-status). Senão, busca o texto na linha.
        const statusMatcher = STATUS_TYPE_MAP[value];
        if (statusMatcher) return statusMatcher(status);
        return text.includes(value);
      });
      const matchVencimento = !vencimentoValue
        || status === vencimentoValue
        || (vencimentoValue === 'nao-vencido' && status !== 'vencido');
      item.classList.toggle('hidden', !(matchSearch && matchSelects && matchVencimento));
    });
  };

  document.querySelectorAll('[data-search-scope]').forEach(scope => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    if (input) input.addEventListener('input', () => applyTableScopeFilters(scope));
    selects.forEach(sel => sel.addEventListener('change', () => applyTableScopeFilters(scope)));
    if (vencimentoFilter) vencimentoFilter.addEventListener('change', () => applyTableScopeFilters(scope));
  });

  // Linha selecionada (check da tabela): destaque visual + "selecionar todos" no cabeçalho.
  // Delegado no document pra cobrir rows criadas via AJAX (cadastro/edição inline).
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('cli-check')) return;
    if (t.hasAttribute('data-check-all')) {
      const table = t.closest('table');
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach(row => {
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
      const header = table && table.querySelector('input.cli-check[data-check-all]');
      if (header && !t.checked) header.checked = false;
    }
  });

  const normalizeSortText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const getSortValue = (row, columnIndex, type) => {
    const cell = row.children[columnIndex];
    const raw = cell ? (cell.dataset.sortValue || cell.textContent || '') : '';
    if (type === 'number') {
      return Number(String(raw).replace(/[^0-9,-]+/g, '').replace(',', '.')) || 0;
    }
    if (type === 'date') {
      const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return Number(new Date(iso[1] + '-' + iso[2] + '-' + iso[3] + 'T00:00:00')) || 0;
      const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return Number(new Date(br[3] + '-' + br[2] + '-' + br[1] + 'T00:00:00')) || 0;
      return 0;
    }
    return normalizeSortText(raw);
  };

  document.querySelectorAll('table').forEach(table => {
    table.querySelectorAll('tbody tr[data-search-item]').forEach((row, index) => {
      row.dataset.originalIndex = String(index);
    });
  });

  const clearSortButtons = (table) => {
    table.querySelectorAll('[data-sort-toggle]').forEach(other => {
      other.classList.remove('active', 'asc', 'desc');
      other.removeAttribute('data-sort-state');
    });
  };

  const restoreOriginalTableOrder = (tbody) => {
    Array.from(tbody.querySelectorAll('tr[data-search-item]'))
      .sort((a, b) => Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0))
      .forEach(row => tbody.appendChild(row));
  };

  document.querySelectorAll('[data-sort-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const table = document.querySelector(btn.dataset.sortTable);
      const tbody = table ? table.querySelector('tbody') : null;
      if (!tbody) return;

      const currentState = btn.dataset.sortState || '';
      const nextState = currentState === '' ? 'asc' : currentState === 'asc' ? 'desc' : '';
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
          return Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0);
        })
        .forEach(row => tbody.appendChild(row));

      btn.dataset.sortState = nextState;
      btn.classList.add('active', nextState);
    });
  });

  document.querySelectorAll('[data-clear-filters]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.closest('[data-search-scope]') || document;
      scope.querySelectorAll('[data-filter-select], [data-vencimento-filter]').forEach(sel => { sel.selectedIndex = 0; });
      scope.querySelectorAll('[data-search-input]').forEach(input => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      applyTableScopeFilters(scope);
    });
  });

  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open-modal');
      const modal = document.getElementById(id);
      if (modal) {
        if (id === 'modal-add-plano') {
          const form = modal.querySelector('#modal-add-plano-form');
          if (form) {
            form.reset();
            form.querySelector('[name="action"]').value = 'create_plano';
            form.querySelector('[name="id"]').value = '';
          }
        }
        if (id === 'modal-add-cliente') {
          const form = modal.querySelector('#modal-add-cliente-form');
          if (form) {
            form.reset();
            form.querySelector('[name="action"]').value = 'create_cliente';
            form.querySelector('[name="id"]').value = '';
            form.querySelector('[name="status"]').value = 'Ativo';
            setPhonePrefix(form.querySelector('[data-phone-prefix]'), '+55');
            setTimeout(() => syncClienteUsageFields(form), 0);
          }
        }
        if (id === 'modal-add-servidor') {
          const form = modal.querySelector('#modal-add-servidor-form');
          if (form) {
            form.reset();
            form.querySelector('[name="action"]').value = 'create_servidor';
            form.querySelector('[name="id"]').value = '';
          }
        }
        if (id === 'modal-add-cobranca') {
          const form = modal.querySelector('#modal-add-cobranca-form');
          if (form) {
            form.reset();
            form.querySelector('[name="action"]').value = 'create_cobranca';
            form.querySelector('[name="id"]').value = '';
            const title = modal.querySelector('#cobranca-title');
            if (title) title.textContent = 'Adicionar Cobrança';
          }
        }
        if (id === 'modal-add-mensagem') {
          const form = modal.querySelector('#modal-add-mensagem-form');
          if (form) {
            form.reset();
            form.querySelector('[name="action"]').value = 'create_mensagem';
            form.querySelector('[name="id"]').value = '';
            const title = modal.querySelector('.modal-header h3');
            if (title) title.textContent = '+ Novo Template';
          }
        }
        const triggerSelector = '[data-open-modal="' + id + '"]';
        setModalState(modal, true, triggerSelector);
      }
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) setModalState(overlay, false);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        setModalState(overlay, false);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    const topModal = getTopOpenModal();
    if (!topModal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setModalState(topModal, false);
      return;
    }

    if (e.key !== 'Tab') return;
    const focusableEls = Array.from(topModal.querySelectorAll(focusableSelector))
      .filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'));
    if (!focusableEls.length) {
      e.preventDefault();
      return;
    }

    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !topModal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !topModal.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  });

  syncModalUiState();

  document.querySelectorAll('.modal').forEach(modal => {
    const tabs = modal.querySelectorAll('.tab-btn');
    const panels = modal.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = modal.querySelector('[data-tab-panel=\"' + key + '\"]');
        if (panel) panel.classList.add('active');
      });
    });
  });

  document.querySelectorAll('.edit-plano').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-plano');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-plano-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_plano';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value = btn.getAttribute('data-nome') || '';
      form.querySelector('[name="tipo"]').value = btn.getAttribute('data-tipo') || '';
      form.querySelector('[name="periodo"]').value = btn.getAttribute('data-periodo') || '1';
      form.querySelector('[name="observacao"]').value = btn.getAttribute('data-observacao') || '';
      const pCred = form.querySelector('[name="creditos"]'); if (pCred) pCred.value = btn.getAttribute('data-creditos') || '0';
      const pAtivo = form.querySelector('[name="ativo"]'); if (pAtivo) pAtivo.checked = btn.getAttribute('data-ativo') !== '0';
      const pTitulo = modal.querySelector('.modal-header h3'); if (pTitulo) pTitulo.textContent = '✎ Editar Plano';
      const pBtnEd = document.querySelector('button[type="submit"][form="modal-add-plano-form"]'); if (pBtnEd) pBtnEd.textContent = 'Salvar';
      const pInfoUpd = form.querySelector('[name="periodo"]'); if (pInfoUpd) pInfoUpd.dispatchEvent(new Event('input', { bubbles: true }));
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('[data-open-modal="modal-add-plano"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('modal-add-plano-form');
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]'); if (a) a.value = 'create_plano';
        const i = form.querySelector('[name="id"]'); if (i) i.value = '';
      }
      const t = document.querySelector('#modal-add-plano .modal-header h3'); if (t) t.textContent = '+ Novo Plano';
      const pBtnNv = document.querySelector('button[type="submit"][form="modal-add-plano-form"]'); if (pBtnNv) pBtnNv.textContent = 'Cadastrar';
    });
  });

  document.querySelectorAll('.edit-dispositivo').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-dispositivo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-dispositivo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_dispositivo';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value = btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value = btn.getAttribute('data-descricao') || '';
      const dStatus = form.querySelector('[name="status"]'); if (dStatus) dStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const dTit = modal.querySelector('.modal-header h3'); if (dTit) dTit.textContent = '✎ Editar Dispositivo';
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('[data-open-modal="modal-add-dispositivo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('modal-add-dispositivo-form');
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]'); if (a) a.value = 'create_dispositivo';
        const i = form.querySelector('[name="id"]'); if (i) i.value = '';
      }
      const t = document.querySelector('#modal-add-dispositivo .modal-header h3'); if (t) t.textContent = '🖥️ Novo Dispositivo';
    });
  });

  document.querySelectorAll('.edit-aplicativo').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-aplicativo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-aplicativo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_aplicativo';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value = btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value = btn.getAttribute('data-descricao') || '';
      const aVal = form.querySelector('[name="valor_renovacao"]'); if (aVal) aVal.value = btn.getAttribute('data-valor') || '';
      const aStatus = form.querySelector('[name="status"]'); if (aStatus) aStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const aTit = modal.querySelector('.modal-header h3'); if (aTit) aTit.textContent = '✎ Editar Aplicativo';
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('[data-open-modal="modal-add-aplicativo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('modal-add-aplicativo-form');
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]'); if (a) a.value = 'create_aplicativo';
        const i = form.querySelector('[name="id"]'); if (i) i.value = '';
      }
      const t = document.querySelector('#modal-add-aplicativo .modal-header h3'); if (t) t.textContent = '🗓️ Novo Aplicativo';
    });
  });

  document.querySelectorAll('.edit-servidor').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-servidor');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-servidor-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_servidor';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value = btn.getAttribute('data-nome') || '';
      form.querySelector('[name="creditos"]').value = btn.getAttribute('data-creditos') || '0';
      form.querySelector('[name="valor_cred"]').value = btn.getAttribute('data-valor') || '0';
      form.querySelector('[name="sessao"]').value = btn.getAttribute('data-sessao') || '';
      form.querySelector('[name="integracao"]').value = btn.getAttribute('data-integracao') || '';
      const sExtras = {
        identificador: 'data-identificador', link_painel: 'data-link-painel', observacao_servidor: 'data-obs',
        dispositivo_whatsapp: 'data-dispositivo', url_app_android: 'data-app-android', url_app_ios: 'data-app-ios',
        info_servidor: 'data-info', dns_1: 'data-dns1', dns_2: 'data-dns2', dns_3: 'data-dns3', dns_4: 'data-dns4',
        url_api_xc: 'data-api-xc', url_api_smarters: 'data-api-smarters', epg: 'data-epg',
        pix: 'data-pix', pix_nome: 'data-pix-nome', pix_tipo: 'data-pix-tipo', url_renovacao: 'data-url-renovacao'
      };
      Object.keys(sExtras).forEach(name => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = btn.getAttribute(sExtras[name]) || '';
      });
      const cob = form.querySelector('[name="cobranca_por_telas"]'); if (cob) cob.checked = btn.getAttribute('data-cobranca') === '1';
      const ren = form.querySelector('[name="renovacao_automatica"]'); if (ren) ren.checked = btn.getAttribute('data-renovacao') === '1';
      const stitulo = modal.querySelector('.modal-header h3'); if (stitulo) stitulo.textContent = '🗄️ Editar Servidor';
      const sBtnEd = document.querySelector('button[type="submit"][form="modal-add-servidor-form"]'); if (sBtnEd) sBtnEd.textContent = 'Salvar';
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('[data-open-modal="modal-add-servidor"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('modal-add-servidor-form');
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]'); if (a) a.value = 'create_servidor';
        const i = form.querySelector('[name="id"]'); if (i) i.value = '';
      }
      const t = document.querySelector('#modal-add-servidor .modal-header h3'); if (t) t.textContent = '🗄️ Novo Servidor';
      const sBtnNv = document.querySelector('button[type="submit"][form="modal-add-servidor-form"]'); if (sBtnNv) sBtnNv.textContent = 'Cadastrar';
    });
  });

  document.querySelectorAll('form.delete-servidor').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar este servidor?')) {
        e.preventDefault();
      }
    });
  });

  const syncClienteUsageFields = (form) => {
    if (!form) return;
    const telasInput = form.querySelector('[name="telas"]');
    const creditosInput = form.querySelector('[name="creditos_gastos"]');
    const servidorSelect = form.querySelector('[name="servidor"]');
    const custoInput = form.querySelector('[name="custo_pagamento"]');
    const telas = Math.max(0, Number(telasInput?.value || 0));
    if (creditosInput) creditosInput.value = String(telas);
    const selected = servidorSelect?.selectedOptions?.[0];
    const valorCred = Number(selected?.getAttribute('data-valor-cred') || form.dataset.valorCred || 0);
    if (custoInput) custoInput.value = valorCred && telas ? (valorCred * telas).toFixed(2) : '';
  };

  const bindClienteUsageFields = (form) => {
    if (!form) return;
    ['plano', 'servidor', 'telas'].forEach(name => {
      const field = form.querySelector('[name="' + name + '"]');
      if (field) {
        field.addEventListener('input', () => syncClienteUsageFields(form));
        field.addEventListener('change', () => syncClienteUsageFields(form));
      }
    });
    syncClienteUsageFields(form);
  };

  bindClienteUsageFields(document.getElementById('modal-add-cliente-form'));
  bindClienteUsageFields(document.getElementById('modal-add-pagamento-form'));

  // Memoriza a preferência do usuário para o switch "Enviar mensagem" e qual
  // template foi escolhido por último — assim, da próxima vez que abrir o modal
  // o estado já vem como o usuário deixou.
  const PREF_KEYS = { enviar_boas_vindas: 'pref-enviar-msg' };
  const PREF_DEFAULTS = { enviar_boas_vindas: false };
  const PREF_TEMPLATE_KEY = 'pref-msg-template-id';
  function lerPref(name) {
    try {
      const raw = localStorage.getItem(PREF_KEYS[name]);
      if (raw === null) return PREF_DEFAULTS[name];
      return raw === '1';
    } catch { return PREF_DEFAULTS[name]; }
  }
  function gravarPref(name, value) {
    try { localStorage.setItem(PREF_KEYS[name], value ? '1' : '0'); } catch { /* ignora */ }
  }
  // Mostra/oculta o select de template conforme o switch.
  function aplicarToggleTemplate(form) {
    if (!form) return;
    const toggle = form.querySelector('[data-toggle-template]');
    const wrapper = form.querySelector('[data-template-wrapper]');
    if (!toggle || !wrapper) return;
    wrapper.hidden = !toggle.checked;
  }
  function aplicarPrefs(form) {
    if (!form) return;
    Object.keys(PREF_KEYS).forEach(name => {
      const el = form.querySelector('[name="' + name + '"]');
      if (el) el.checked = lerPref(name);
    });
    // Reaplica o último template escolhido (se ainda existir no select).
    const tplSelect = form.querySelector('[name="template_boas_vindas"]');
    if (tplSelect) {
      const savedId = localStorage.getItem(PREF_TEMPLATE_KEY) || '';
      if (savedId && tplSelect.querySelector('option[value="' + savedId + '"]')) {
        tplSelect.value = savedId;
      }
    }
    aplicarToggleTemplate(form);
  }
  // Salva quando o usuário muda o switch — uma única vez basta para virar default.
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'checkbox') return;
    const name = target.getAttribute('name');
    if (PREF_KEYS[name]) gravarPref(name, target.checked);
    if (target.hasAttribute('data-toggle-template')) {
      const form = target.closest('form');
      if (form) aplicarToggleTemplate(form);
    }
  });
  // Memoriza o último template escolhido.
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target && target.tagName === 'SELECT' && target.getAttribute('name') === 'template_boas_vindas') {
      try { localStorage.setItem(PREF_TEMPLATE_KEY, target.value || ''); } catch { /* ignora */ }
    }
  });

  document.querySelectorAll('.edit-cliente').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-cliente');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-cliente-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_cliente';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="status"]').value = btn.getAttribute('data-status') || 'Ativo';
      form.querySelector('[name="nome"]').value = btn.getAttribute('data-nome') || '';
      form.querySelector('[name="user"]').value = btn.getAttribute('data-user') || '';
      const telefoneInput = form.querySelector('[name="telefone"]');
      if (telefoneInput) {
        const telefoneCompleto = btn.getAttribute('data-telefone') || '';
        const prefix = findPrefixFromPhone(telefoneCompleto);
        setPhonePrefix(form.querySelector('[data-phone-prefix]'), prefix);
        telefoneInput.value = stripPhonePrefix(telefoneCompleto, prefix);
        formatPhoneInput(telefoneInput);
      }
      setDateInputValue(form.querySelector('[name="vencimento"]'), btn.getAttribute('data-vencimento') || '');
      // Para selects: se o valor salvo no cliente não existir mais nas options
      // (catálogo renomeado/apagado), injeta opção temporária com o valor salvo
      // pra ele NÃO virar branco no Editar. Antes ficava em branco silenciosamente.
      const setSelectWithFallback = (name, value) => {
        const sel = form.querySelector('[name="' + name + '"]');
        if (!sel) return;
        // Limpa fallback de uma edição anterior pra não acumular ao trocar de cliente.
        sel.querySelectorAll('option[data-fallback="1"]').forEach(o => o.remove());
        const valor = String(value || '');
        if (!valor) { sel.value = ''; return; }
        if (sel.tagName === 'SELECT' && !sel.querySelector('option[value="' + valor.replace(/"/g, '\\"') + '"]')) {
          const opt = document.createElement('option');
          opt.value = valor;
          opt.textContent = valor + ' (atual)';
          opt.dataset.fallback = '1';
          sel.appendChild(opt);
        }
        sel.value = valor;
      };
      setSelectWithFallback('plano', btn.getAttribute('data-plano') || '');
      form.querySelector('[name="valor"]').value = btn.getAttribute('data-valor') || '';
      setSelectWithFallback('servidor', btn.getAttribute('data-servidor') || '');
      setSelectWithFallback('forma_pagamento', btn.getAttribute('data-forma-pagamento') || '');
      form.querySelector('[name="telas"]').value = btn.getAttribute('data-telas') || '1';
      // Pré-preenche os campos novos (guardado: ignora se o campo não existir no DOM)
      const extras = {
        senha: 'data-senha', id_painel: 'data-id-painel', email: 'data-email', captacao: 'data-captacao',
        aniversario: 'data-aniversario', link_m3u: 'data-link-m3u', time_cliente: 'data-time-cliente',
        telefone_secundario: 'data-telefone-secundario', observacoes: 'data-observacoes',
        data_inicio: 'data-data-inicio', hora_vencimento: 'data-hora-vencimento',
        pontos_fidelidade: 'data-pontos'
      };
      Object.keys(extras).forEach(name => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = btn.getAttribute(extras[name]) || '';
      });
      // dispositivo e aplicativo também são selects — aplica o mesmo fallback.
      setSelectWithFallback('dispositivo', btn.getAttribute('data-dispositivo') || '');
      setSelectWithFallback('aplicativo', btn.getAttribute('data-aplicativo') || '');
      // Aplica a preferência salva (sobrepõe o valor do cliente — usuário pediu
      // explicitamente que, uma vez desmarcado, permaneça desmarcado).
      aplicarPrefs(form);
      // "Registrar pagamento" só vale para cliente novo: oculta na edição.
      const onlyNew = modal.querySelector('[data-only-new]'); if (onlyNew) onlyNew.style.display = 'none';
      const tituloEd = modal.querySelector('.modal-header h3'); if (tituloEd) tituloEd.textContent = '✎ Editar Cliente';
      const btnEd = document.querySelector('button[type="submit"][form="modal-add-cliente-form"]'); if (btnEd) btnEd.textContent = 'Salvar Cliente';
      syncClienteUsageFields(form);
      setModalState(modal, true);
    });
  });

  // Abrir "Novo Cliente": reexibe e marca a opção de registrar pagamento.
  document.querySelectorAll('[data-open-modal="modal-add-cliente"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-cliente');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-cliente-form');
      // Reseta o form antes — senão valores de uma edição anterior viajam pro novo cliente.
      if (form) {
        form.reset();
        // form.reset() não limpa o prefixo de telefone (componente custom).
        const phonePrefix = form.querySelector('[data-phone-prefix]');
        if (phonePrefix) setPhonePrefix(phonePrefix, '+55');
        // Limpa qualquer destaque de erro deixado por uma validação anterior.
        form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
        form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
        const modalErr = document.getElementById('modal-add-cliente-error'); if (modalErr) modalErr.textContent = '';
      }
      // Remove qualquer display:none deixado por uma edição anterior — caso
      // contrário, o switch "Registrar pagamento" some no Novo Cliente.
      const onlyNew = modal.querySelector('[data-only-new]');
      if (onlyNew) { onlyNew.style.removeProperty('display'); onlyNew.hidden = false; }
      const reg = modal.querySelector('[name="registrar_pagamento"]'); if (reg) reg.checked = true;
      aplicarPrefs(form);
      const act = modal.querySelector('#modal-add-cliente-form [name="action"]'); if (act) act.value = 'create_cliente';
      const idf = modal.querySelector('#modal-add-cliente-form [name="id"]'); if (idf) idf.value = '';
      const tituloNv = modal.querySelector('.modal-header h3'); if (tituloNv) tituloNv.textContent = '👤 Novo Cliente';
      const btnNv = document.querySelector('button[type="submit"][form="modal-add-cliente-form"]'); if (btnNv) btnNv.textContent = 'Cadastrar Cliente';
      // Volta para a primeira aba (Dados).
      const firstTab = modal.querySelector('.tab-btn[data-tab="dados"]'); if (firstTab) firstTab.click();
      if (form) syncClienteUsageFields(form);
    });
  });

  // ----- Transações -----
  document.querySelectorAll('[data-open-modal="modal-nova-transacao"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('modal-nova-transacao-form');
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]'); if (a) a.value = 'create_transacao';
        const i = form.querySelector('[name="id"]'); if (i) i.value = '';
      }
      const titulo = document.querySelector('#modal-nova-transacao .modal-header h3');
      if (titulo) titulo.textContent = '+ Nova Transação';
    });
  });

  document.querySelectorAll('.edit-transacao').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-nova-transacao');
      const form = modal && modal.querySelector('#modal-nova-transacao-form');
      if (!form) return;
      const set = (name, val) => { const el = form.querySelector('[name="' + name + '"]'); if (el) el.value = val; };
      set('action', 'update_transacao');
      set('id', btn.getAttribute('data-id') || '');
      set('data', btn.getAttribute('data-data') || '');
      set('forma_pagamento', btn.getAttribute('data-forma') || '');
      set('cliente_id', btn.getAttribute('data-cliente-id') || '');
      set('descricao', btn.getAttribute('data-descricao') || '');
      set('plano', btn.getAttribute('data-plano') || '');
      set('servidor', btn.getAttribute('data-servidor') || '');
      set('telas', btn.getAttribute('data-telas') || '1');
      set('creditos', btn.getAttribute('data-creditos') || '0');
      set('custo', btn.getAttribute('data-custo') || '0');
      set('valor_venda', btn.getAttribute('data-valor-venda') || '');
      const titulo = modal.querySelector('.modal-header h3'); if (titulo) titulo.textContent = '✎ Editar Transação';
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('.view-transacao').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-transacao-info');
      if (!modal) return;
      const put = (id, attr) => { const el = document.getElementById(id); if (el) el.textContent = btn.getAttribute(attr) || '-'; };
      put('tx-info-data', 'data-data'); put('tx-info-cliente', 'data-cliente'); put('tx-info-pagamento', 'data-pagamento');
      put('tx-info-descricao', 'data-descricao'); put('tx-info-servidor', 'data-servidor'); put('tx-info-plano', 'data-plano');
      put('tx-info-telas', 'data-telas'); put('tx-info-creditos', 'data-creditos'); put('tx-info-custo', 'data-custo');
      put('tx-info-total', 'data-total'); put('tx-info-lucro', 'data-lucro');
      setModalState(modal, true);
    });
  });

  const txClienteSelect = document.querySelector('[data-tx-cliente]');
  if (txClienteSelect) {
    txClienteSelect.addEventListener('change', () => {
      const opt = txClienteSelect.selectedOptions[0];
      if (!opt || !opt.value) return;
      const form = txClienteSelect.closest('form');
      if (!form) return;
      const fill = (name, val) => { const el = form.querySelector('[name="' + name + '"]'); if (el && !el.value) el.value = val; };
      fill('plano', opt.getAttribute('data-plano') || '');
      fill('servidor', opt.getAttribute('data-servidor') || '');
      const telas = form.querySelector('[name="telas"]'); if (telas) telas.value = opt.getAttribute('data-telas') || '1';
      fill('valor_venda', opt.getAttribute('data-valor') || '');
    });
  }

  document.querySelectorAll('form.delete-cliente').forEach(form => {
    form.addEventListener('submit', async (e) => {
      if (form.dataset.nativeSubmit === '1') {
        if (!confirm('Deseja apagar este cliente?')) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!confirm('Deseja apagar este cliente?')) return;
      const formData = new FormData(form);
      formData.set('action', 'delete_cliente');
      try {
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        const data = await res.json();
        if (data.ok) {
          const row = form.closest('tr');
          if (row) row.remove();
          const badge = document.querySelector('.toolbar .badge');
          if (badge && typeof data.count !== 'undefined') {
            badge.textContent = data.count;
          }
          if (!showNoticeModal('Cliente apagado.', 'success')) {
            showToast('Cliente apagado.', 'success');
          }
        } else {
          if (!showNoticeModal(data.message || 'Erro ao apagar.', 'error')) {
            showToast(data.message || 'Erro ao apagar.', 'error');
          }
        }
      } catch (err) {
        if (!showNoticeModal('Erro ao apagar.', 'error')) {
          showToast('Erro ao apagar.', 'error');
        }
      }
    });
  });

  const normalizeTemplateKey = (key) => String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  document.querySelectorAll('.open-whatsapp-message').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-send-whatsapp');
      if (!modal) return;
      const form = modal.querySelector('#modal-send-whatsapp-form');
      if (!form) return;
      form.reset();
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      const nome = btn.getAttribute('data-nome') || '';
      const tel = btn.getAttribute('data-telefone') || '';
      const nomeEl = modal.querySelector('[data-wa-nome]'); if (nomeEl) nomeEl.textContent = nome || '—';
      const telEl = modal.querySelector('[data-wa-telefone]'); if (telEl) telEl.textContent = tel;
      // reseta a mídia
      const mt = form.querySelector('[name="media_tipo"]'); if (mt) mt.value = '';
      const murl = form.querySelector('.wa-media-url'); if (murl) { murl.hidden = true; murl.value = ''; }
      form.querySelectorAll('[data-wa-media]').forEach(b => b.classList.remove('active'));
      setModalState(modal, true);
    });
  });

  // Template (opcional) -> preenche o textarea da mensagem
  const waTemplate = document.querySelector('#modal-send-whatsapp-form [data-wa-template]');
  const waMensagem = document.querySelector('#modal-send-whatsapp-form [data-wa-mensagem]');
  if (waTemplate && waMensagem) {
    waTemplate.addEventListener('change', () => {
      const opt = waTemplate.options[waTemplate.selectedIndex];
      const msg = opt ? (opt.getAttribute('data-message') || '') : '';
      if (msg) waMensagem.value = msg;
    });
  }

  // Botões de Anexar Mídia: define o tipo e mostra o campo de link
  const waForm = document.getElementById('modal-send-whatsapp-form');
  if (waForm) {
    const urlInput = waForm.querySelector('.wa-media-url');
    const tipoInput = waForm.querySelector('[name="media_tipo"]');
    waForm.querySelectorAll('[data-wa-media]').forEach(b => {
      b.addEventListener('click', () => {
        const ativo = b.classList.contains('active');
        waForm.querySelectorAll('[data-wa-media]').forEach(x => x.classList.remove('active'));
        if (ativo) {
          if (tipoInput) tipoInput.value = '';
          if (urlInput) { urlInput.hidden = true; }
        } else {
          b.classList.add('active');
          if (tipoInput) tipoInput.value = b.getAttribute('data-wa-media') || '';
          if (urlInput) { urlInput.hidden = false; urlInput.focus(); }
        }
      });
    });
  }

  document.querySelectorAll('.open-payment').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-pagamento');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-pagamento-form');
      if (!form) return;
      // Reseta para não vazar dados entre clientes.
      form.reset();
      form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
      const modalErr = document.getElementById('modal-add-pagamento-error'); if (modalErr) modalErr.textContent = '';

      const nome = btn.getAttribute('data-nome') || '';
      const venc = btn.getAttribute('data-vencimento') || '';
      const plano = btn.getAttribute('data-plano') || '';
      const servidor = btn.getAttribute('data-servidor') || '';
      const valor = btn.getAttribute('data-valor') || '0';
      const telas = btn.getAttribute('data-telas') || '1';
      const valorCred = btn.getAttribute('data-valor-cred') || '0';
      const horaVenc = btn.getAttribute('data-hora') || '23:59';

      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      // Novo vencimento = max(hoje, venc antigo) + periodo do plano.
      // Antes ficava fixo em +30 dias a partir do venc antigo — cliente vencido há
      // 90 dias renovava pra uma data AINDA no passado. E plano trimestral/anual
      // ficava com vencimento errado (sempre 30 dias).
      const periodoDias = Math.max(1, Number(btn.getAttribute('data-periodo') || 30));
      let baseDate = new Date();
      if (venc && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
        const parts = venc.split('/');
        const oldVenc = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        baseDate = oldVenc > today ? oldVenc : today;
      }
      const novoVenc = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + periodoDias);
      const ddNv = String(novoVenc.getDate()).padStart(2, '0');
      const mmNv = String(novoVenc.getMonth() + 1).padStart(2, '0');
      setDateInputValue(form.querySelector('[name="vencimento"]'), novoVenc.getFullYear() + '-' + mmNv + '-' + ddNv);

      const horaInput = form.querySelector('[name="hora_vencimento"]');
      if (horaInput) horaInput.value = String(horaVenc).slice(0, 5) || '23:59';

      // Plano e Servidor são FIXOS na renovação (não editáveis). Setamos o
      // input hidden (que é submetido) e o input visível readonly só pra exibir.
      const planoInput = form.querySelector('[name="plano"]');
      if (planoInput) planoInput.value = plano;
      const planoDisplay = form.querySelector('[data-plano-display]');
      if (planoDisplay) planoDisplay.value = plano;
      const servidorInput = form.querySelector('[name="servidor"]');
      if (servidorInput) servidorInput.value = servidor;
      const servidorDisplay = form.querySelector('[data-servidor-display]');
      if (servidorDisplay) servidorDisplay.value = servidor;
      // Cliente legado sem plano/servidor: avisa no topo do modal — não dá pra editar
      // esses campos aqui, o usuário precisa abrir a edição do cliente primeiro.
      const modalErrorTop = document.getElementById('modal-add-pagamento-error');
      if (modalErrorTop && (!plano || !servidor)) {
        modalErrorTop.textContent = 'Este cliente está sem plano e/ou servidor. Edite o cliente para preencher esses campos antes de renovar.';
      }

      form.querySelector('[name="valor"]').value = valor;
      form.querySelector('[name="forma_pagamento"]').value = 'PIX';
      form.querySelector('[name="telas"]').value = telas;
      form.dataset.valorCred = valorCred;
      // Calcula créditos+custo automaticamente; também reage a mudanças nos selects.
      syncClienteUsageFields(form);

      // Pago em = hoje.
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      setDateInputValue(form.querySelector('[name="pago_em"]'), today.getFullYear() + '-' + mm + '-' + dd);

      const mensagemPagamento = form.querySelector('[name="mensagem_pagamento_id"]');
      if (mensagemPagamento) {
        const savedMessageId = localStorage.getItem('gestor:last-payment-message-id') || '';
        mensagemPagamento.value = savedMessageId;
        if (mensagemPagamento.value !== savedMessageId) mensagemPagamento.value = '';
      }
      const title = modal.querySelector('#pagamento-title');
      if (title) title.textContent = '↻ Renovar - ' + nome;
      setModalState(modal, true);
    });
  });

  // Valida campos obrigatórios do modal de renovação (mesmo padrão do cadastro).
  const pagamentoFormEl = document.getElementById('modal-add-pagamento-form');
  if (pagamentoFormEl) {
    pagamentoFormEl.addEventListener('submit', (e) => {
      const modalError = document.getElementById('modal-add-pagamento-error');
      pagamentoFormEl.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      pagamentoFormEl.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
      if (modalError) modalError.textContent = '';
      let missing = false;
      pagamentoFormEl.querySelectorAll('[data-required="1"]').forEach(field => {
        if (!String(field.value || '').trim()) {
          field.classList.add('input-error');
          const msg = pagamentoFormEl.querySelector('[data-error-for="' + field.getAttribute('name') + '"]');
          if (msg) msg.textContent = 'Campo obrigatório.';
          missing = true;
        }
      });
      if (missing) {
        if (modalError) modalError.textContent = 'Revise os campos obrigatórios destacados.';
        e.preventDefault();
      }
      // Backend usa "valor" como valor_pago quando esse campo não vem no body.
    });
  }

  const pagamentoForm = document.getElementById('modal-add-pagamento-form');
  if (pagamentoForm) {
    const mensagemPagamento = pagamentoForm.querySelector('[name="mensagem_pagamento_id"]');
    if (mensagemPagamento) {
      mensagemPagamento.addEventListener('change', () => {
        localStorage.setItem('gestor:last-payment-message-id', mensagemPagamento.value || '');
      });
    }
    pagamentoForm.addEventListener('submit', async (e) => {
      const mensagemPagamentoSubmit = pagamentoForm.querySelector('[name="mensagem_pagamento_id"]');
      if (mensagemPagamentoSubmit) {
        localStorage.setItem('gestor:last-payment-message-id', mensagemPagamentoSubmit.value || '');
      }
      if (pagamentoForm.dataset.nativeSubmit === '1') return;
      e.preventDefault();
      pagamentoForm.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      pagamentoForm.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
      const formData = new FormData(pagamentoForm);
      formData.set('action', 'add_pagamento');
      try {
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        const data = await res.json();
        if (data.ok && data.rowHtml) {
          const id = pagamentoForm.querySelector('[name="id"]').value;
          const row = document.querySelector('tr[data-id="' + id + '"]');
          if (row) {
            row.insertAdjacentHTML('beforebegin', data.rowHtml);
            row.remove();
          }
          setModalState(pagamentoForm.closest('.modal-overlay'), false);
          if (!showNoticeModal('Pagamento salvo.', 'success')) {
            showToast('Pagamento salvo.', 'success');
          }
        } else {
          if (data.errors) {
            Object.keys(data.errors).forEach(key => {
              const field = pagamentoForm.querySelector('[name="' + key + '"]');
              if (field) field.classList.add('input-error');
              const msg = pagamentoForm.querySelector('[data-error-for="' + key + '"]');
              if (msg) msg.textContent = data.errors[key];
            });
          } else if (!showNoticeModal(data.message || 'Erro ao salvar pagamento.', 'error')) {
            showToast(data.message || 'Erro ao salvar pagamento.', 'error');
          }
        }
      } catch (err) {
        if (!showNoticeModal('Erro ao salvar pagamento.', 'error')) {
          showToast('Erro ao salvar pagamento.', 'error');
        }
      }
    });
  }

  document.querySelectorAll('.info-cliente').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-cliente-info');
      if (!modal) return;
      const map = {
        'info-nome': 'data-nome',
        'info-user': 'data-user',
        'info-telefone': 'data-telefone',
        'info-vencimento': 'data-vencimento',
        'info-plano': 'data-plano',
        'info-valor': 'data-valor',
        'info-status': 'data-status',
        'info-servidor': 'data-servidor',
        'info-telas': 'data-telas'
      };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = btn.getAttribute(map[id]) || '';
      });
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('form.delete-plano').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar este plano?')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('.edit-mensagem').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-mensagem');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-mensagem-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_mensagem';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="titulo"]').value = btn.getAttribute('data-titulo') || '';
      const desc = form.querySelector('[name="descricao"]'); if (desc) desc.value = btn.getAttribute('data-descricao') || '';
      form.querySelector('[name="mensagem"]').value = btn.getAttribute('data-mensagem') || '';
      form.querySelector('[name="media_tipo"]').value = btn.getAttribute('data-media-tipo') || '';
      form.querySelector('[name="media_path"]').value = btn.getAttribute('data-media-path') || '';
      const title = modal.querySelector('.modal-header h3');
      if (title) title.textContent = '✎ Editar Template';
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('form.delete-mensagem').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar esta mensagem?')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('.edit-cobranca').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-cobranca');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-cobranca-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_cobranca';
      form.querySelector('[name="id"]').value = btn.getAttribute('data-id') || '';
      form.querySelector('[name="titulo"]').value = btn.getAttribute('data-titulo') || '';
      form.querySelector('[name="tipo"]').value = btn.getAttribute('data-tipo') || 'Vencimento';
      form.querySelector('[name="tipo_periodo"]').value = btn.getAttribute('data-tipo-periodo') || 'Dias';
      form.querySelector('[name="periodo"]').value = btn.getAttribute('data-periodo') || '0';
      form.querySelector('[name="status"]').value = btn.getAttribute('data-status') || 'Ativo';
      form.querySelector('[name="mensagem_id"]').value = btn.getAttribute('data-mensagem-id') || '';
      const auto = form.querySelector('[name="automatica"]');
      if (auto) auto.checked = (btn.getAttribute('data-automatica') || '0') === '1';
      form.querySelector('[name="hora_envio"]').value = btn.getAttribute('data-hora-envio') || '09:00';
      const diasRaw = (btn.getAttribute('data-dias-semana') || '').split(',').map(v => v.trim()).filter(Boolean);
      const diasNumericos = diasRaw.map(Number);
      const diasOneBase = diasNumericos.length > 0 && diasNumericos.every(n => Number.isInteger(n) && n >= 1 && n <= 7);
      const dias = diasOneBase
        ? diasNumericos.map(n => String(n === 7 ? 0 : n))
        : diasRaw;
      form.querySelectorAll('input[name="dias_semana[]"]').forEach(chk => {
        chk.checked = dias.includes(chk.value);
      });
      const title = modal.querySelector('#cobranca-title');
      if (title) title.textContent = 'Editar Cobrança';
      setModalState(modal, true);
    });
  });

  const cobrancaForm = document.getElementById('modal-add-cobranca-form');
  if (cobrancaForm) {
    const clienteStatusSelect = cobrancaForm.querySelector('[data-cliente-status]');
    const periodoInput = cobrancaForm.querySelector('[data-periodo-input]');
    const syncPeriodoByClienteStatus = () => {
      if (!clienteStatusSelect || !periodoInput) return;
      const disablePeriodo = clienteStatusSelect.value === 'Vence Hoje';
      periodoInput.disabled = disablePeriodo;
      if (disablePeriodo) {
        periodoInput.dataset.previousValue = periodoInput.value;
        periodoInput.value = '0';
      } else if (periodoInput.value === '0' && periodoInput.dataset.previousValue) {
        periodoInput.value = periodoInput.dataset.previousValue;
      }
    };
    if (clienteStatusSelect && periodoInput) {
      clienteStatusSelect.addEventListener('change', syncPeriodoByClienteStatus);
      syncPeriodoByClienteStatus();
    }
  }

  document.querySelectorAll('.open-cobranca-recipients').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-cobranca-recipients');
      if (!modal) return;
      const title = modal.querySelector('#cobranca-recipients-title');
      const summary = modal.querySelector('#cobranca-recipients-summary');
      const list = modal.querySelector('#cobranca-recipients-list');
      let nomes = [];
      try {
        nomes = JSON.parse(btn.getAttribute('data-recebedores') || '[]');
      } catch (e) {
        nomes = [];
      }
      const cobrancaTitulo = btn.getAttribute('data-title') || 'Cobrança';
      if (title) title.textContent = 'Recebem - ' + cobrancaTitulo;
      if (summary) summary.textContent = nomes.length === 1 ? '1 cliente vai receber esta mensagem.' : nomes.length + ' clientes vão receber esta mensagem.';
      if (list) {
        list.innerHTML = '';
        if (!nomes.length) {
          const item = document.createElement('li');
          item.className = 'recipient-empty';
          item.textContent = 'Nenhum cliente encontrado para esta regra.';
          list.appendChild(item);
        } else {
          nomes.forEach((nome, index) => {
            const item = document.createElement('li');
            const number = document.createElement('span');
            number.textContent = String(index + 1).padStart(2, '0');
            const label = document.createElement('strong');
            label.textContent = nome;
            item.appendChild(number);
            item.appendChild(label);
            list.appendChild(item);
          });
        }
      }
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('form.delete-cobranca').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar esta cobrança?')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('[data-toggle-cobranca]').forEach(input => {
    input.addEventListener('change', async () => {
      const formData = new FormData();
      formData.set('action', 'toggle_cobranca');
      formData.set('id', input.getAttribute('data-id') || '');
      formData.set('automatica', input.checked ? '1' : '0');
      try {
        await fetch(window.location.href, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
      } catch (e) {
        input.checked = !input.checked;
        const status = input.closest('[data-switch]')?.querySelector('.switch-status');
        if (status) status.textContent = input.checked ? 'Ativa' : 'Inativa';
      }
    });
  });

  const msgNotice = document.getElementById('modal-mensagem-notice');
  if (msgNotice) {
    const msg = document.getElementById('modal-mensagem-notice-msg');
    const params = new URLSearchParams(window.location.search);
    let text = '';
    if (params.get('saved') === '1') text = 'Mensagem salva com sucesso.';
    if (params.get('updated') === '1') text = 'Mensagem atualizada com sucesso.';
    if (params.get('deleted') === '1') text = 'Mensagem apagada com sucesso.';
    if (text) {
      if (msg) msg.textContent = text;
      setModalState(msgNotice, true);
      params.delete('saved');
      params.delete('updated');
      params.delete('deleted');
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }

  const tagSelect = document.querySelector('[data-insert-tag]');
  const msgTextarea = document.querySelector('[data-mensagem-text]');
  if (tagSelect && msgTextarea) {
    tagSelect.addEventListener('change', () => {
      const tag = tagSelect.value;
      if (!tag) return;
      const start = msgTextarea.selectionStart || 0;
      const end = msgTextarea.selectionEnd || 0;
      const text = msgTextarea.value;
      msgTextarea.value = text.slice(0, start) + tag + text.slice(end);
      const pos = start + tag.length;
      msgTextarea.setSelectionRange(pos, pos);
      msgTextarea.focus();
      tagSelect.value = '';
    });
  }

  const clienteForm = document.getElementById('modal-add-cliente-form');
  if (clienteForm) {
    const requiredModal = document.getElementById('modal-required-fields');
    const requiredList = document.getElementById('modal-required-list');
    const requiredGo = document.getElementById('modal-required-go');
    const requiredMessage = document.getElementById('modal-required-message');

    const openRequiredModal = (items) => {
      if (!requiredModal || !requiredList || !requiredGo) return;
      requiredList.innerHTML = '';
      const first = items[0];
      items.forEach(it => {
        const div = document.createElement('div');
        div.className = 'item';
        const tabLabel = it.tab === 'pagamento' ? 'Aba Pagamento' : 'Aba Dados';
        div.innerHTML = '<span>' + it.label + ' — ' + tabLabel + '</span>';
        requiredList.appendChild(div);
      });
      requiredGo.onclick = () => {
        if (!first) return;
        const tabBtn = document.querySelector('.tab-btn[data-tab="' + first.tab + '"]');
        if (tabBtn) tabBtn.click();
        setModalState(requiredModal, false);
      };
      requiredMessage.textContent = 'Existem campos obrigatórios em outra aba. Veja abaixo:';
      setModalState(requiredModal, true);
    };

    // Valida campos obrigatórios SEMPRE — inclusive quando o envio é nativo (data-native-submit="1").
    // Se faltar algo, bloqueia o submit, destaca os campos e exibe a mensagem embaixo.
    const validarObrigatorios = (form) => {
      const modalError = document.getElementById('modal-add-cliente-error');
      form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
      if (modalError) modalError.textContent = '';
      const missing = [];
      form.querySelectorAll('[data-required="1"]').forEach(field => {
        const name = field.getAttribute('name');
        const value = (field.value || '').trim();
        if (!value) {
          field.classList.add('input-error');
          const msg = form.querySelector('[data-error-for="' + name + '"]');
          if (msg && !msg.textContent) msg.textContent = 'Campo obrigatório.';
          missing.push({
            label: field.getAttribute('data-field-label') || name,
            tab: field.getAttribute('data-tab') || 'dados'
          });
        }
      });
      if (missing.length) {
        const otherTab = missing.find(m => m.tab !== (document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'dados'));
        if (otherTab) openRequiredModal(missing);
        else if (modalError) modalError.textContent = 'Revise os campos obrigatórios destacados.';
        return false;
      }
      return true;
    };

    clienteForm.addEventListener('submit', async (e) => {
      if (clienteForm.dataset.nativeSubmit === '1') {
        if (!validarObrigatorios(clienteForm)) { e.preventDefault(); }
        return;
      }
      e.preventDefault();
      const form = e.currentTarget;
      const modalError = document.getElementById('modal-add-cliente-error');
      const formData = new FormData(form);
      const actionInput = form.querySelector('[name="action"]');
      if (actionInput) {
        formData.set('action', actionInput.value);
      }

      // Clear previous field errors
      form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach(el => { el.textContent = ''; });
      if (modalError) modalError.textContent = '';

      const missing = [];
      form.querySelectorAll('[data-required="1"]').forEach(field => {
        const name = field.getAttribute('name');
        const value = (field.value || '').trim();
        if (!value) {
          field.classList.add('input-error');
          const msg = form.querySelector('[data-error-for="' + name + '"]');
          if (msg && !msg.textContent) msg.textContent = 'Campo obrigatório.';
          missing.push({
            label: field.getAttribute('data-field-label') || name,
            tab: field.getAttribute('data-tab') || 'dados'
          });
        }
      });
      if (missing.length) {
        const otherTab = missing.find(m => m.tab === 'pagamento');
        if (otherTab) {
          openRequiredModal(missing);
        } else if (modalError) {
          modalError.textContent = 'Revise os campos obrigatórios destacados.';
        }
        return;
      }

      try {
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        const data = await res.json();
        if (data.ok) {
          const tbody = document.querySelector('.table tbody');
          if (tbody && data.rowHtml) {
            if (actionInput && actionInput.value === 'update_cliente') {
              const id = form.querySelector('[name="id"]').value;
              const oldRow = document.querySelector('tr[data-id="' + id + '"]');
              if (oldRow) {
                oldRow.insertAdjacentHTML('beforebegin', data.rowHtml);
                oldRow.remove();
              }
            } else {
              tbody.insertAdjacentHTML('afterbegin', data.rowHtml);
            }
          }
          const badge = document.querySelector('.toolbar .badge');
          if (badge && typeof data.count !== 'undefined') {
            badge.textContent = data.count;
          }
          form.reset();
          const overlay = form.closest('.modal-overlay');
          if (overlay) setModalState(overlay, false);
          if (!showNoticeModal(data.message || 'Cliente salvo com sucesso.', 'success')) {
            showToast(data.message || 'Cliente salvo com sucesso.', 'success');
          }
        } else {
          if (data.errors) {
            const missingServer = [];
            Object.keys(data.errors).forEach(key => {
              const field = form.querySelector('[name="' + key + '"]');
              if (field) field.classList.add('input-error');
              const msg = form.querySelector('[data-error-for="' + key + '"]');
              if (msg) msg.textContent = data.errors[key];
              if (field) {
                missingServer.push({
                  label: field.getAttribute('data-field-label') || key,
                  tab: field.getAttribute('data-tab') || 'dados'
                });
              }
            });
            const otherTab = missingServer.find(m => m.tab === 'pagamento');
            if (otherTab) {
              openRequiredModal(missingServer);
            } else if (modalError) {
              modalError.textContent = 'Revise os campos obrigatórios destacados.';
            }
          } else if (data.message) {
            if (modalError) {
              modalError.textContent = data.message;
            } else {
              if (!showNoticeModal(data.message, 'error')) {
                showToast(data.message, 'error');
              }
            }
          }
        }
      } catch (err) {
        if (modalError) {
          modalError.textContent = 'Erro ao salvar. Tente novamente.';
        } else {
          if (!showNoticeModal('Erro ao salvar. Tente novamente.', 'error')) {
            showToast('Erro ao salvar. Tente novamente.', 'error');
          }
        }
      }
    });
  }

  // Input masks for older fields that do not use the shared date component.
  const dateInputs = document.querySelectorAll('input[name="vencimento"]:not([data-date-mask]), input[name="data_pagamento"]:not([data-date-mask])');
  dateInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 8);
      if (v.length >= 5) {
        v = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,2})/, '$1/$2');
      }
      e.target.value = v;
    });
  });

  const phoneInputs = document.querySelectorAll('input[name="telefone"]');
  phoneInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 11);
      if (v.length >= 7) {
        v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
      } else if (v.length >= 1) {
        v = v.replace(/(\d{0,2})/, '($1');
      }
      e.target.value = v.trim();
    });
  });

  const servidorSelect = document.querySelector('[data-valor-cred-select]');
  if (servidorSelect) {
    servidorSelect.addEventListener('change', () => {
      const selected = servidorSelect.options[servidorSelect.selectedIndex];
      const valorCred = selected ? selected.getAttribute('data-valor-cred') : '';
      const telasInput = document.querySelector('input[name="telas"]');
      const custoTotalInput = document.querySelector('[data-custo-total]');
      const telas = telasInput ? parseInt(telasInput.value || '1', 10) : 1;
      if (custoTotalInput && valorCred !== null) {
        const base = parseFloat((valorCred || '0').toString().replace(',', '.'));
        const total = (base * (isNaN(telas) ? 1 : telas)).toFixed(2).replace('.', ',');
        custoTotalInput.value = total;
      }
    });
  }

  function showToast(message, type) {
    const container = document.querySelector('.container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type === 'success' ? 'toast-success' : 'toast-error');
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    container.prepend(toast);
    setTimeout(() => { toast.remove(); }, 4000);
  }

  if (document.body.classList.contains('page-whatsapp_sessoes')) {
    const refreshSessionCards = async () => {
      try {
        const formData = new FormData();
        formData.set('action', 'refresh_sessoes');
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.items)) return;

        data.items.forEach(item => {
          const card = document.querySelector('[data-wa-card-id="' + item.id + '"]');
          if (!card) return;
          const isOn = (item.status || '').toLowerCase() === 'conectado';
          const cover = card.querySelector('.wa-cover');
          const badge = card.querySelector('[data-wa-status-badge]');
          const phoneRow = card.querySelector('[data-wa-phone-row]');
          const phoneEl = card.querySelector('[data-wa-phone]');

          if (cover) cover.textContent = isOn ? 'ONLINE' : 'OFFLINE';
          if (badge) {
            badge.textContent = isOn ? 'Conectado' : 'Desconectado';
            badge.classList.remove('badge-green', 'badge-red');
            badge.classList.add(isOn ? 'badge-green' : 'badge-red');
          }
          if (phoneRow && phoneEl) {
            const phone = (item.telefone || '').trim();
            if (phone) {
              phoneEl.textContent = phone;
              phoneRow.style.display = '';
            } else {
              phoneEl.textContent = '';
              phoneRow.style.display = 'none';
            }
          }
        });
      } catch (err) {
        // Silent fail: auto-refresh should not interrupt user interaction.
      }
    };

    setTimeout(refreshSessionCards, 1500);
    setInterval(refreshSessionCards, 10000);
  }
});
