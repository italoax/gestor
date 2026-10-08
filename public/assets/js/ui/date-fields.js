window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initDateFields = function ({ setIconLabel }) {
  const formatDateBrValue = (value, completeYear = false) => {
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const digits = text.replace(/\D+/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
    if (completeYear && digits.length === 6)
      return (
        digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/20' + digits.slice(4)
      );
    return (
      digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    );
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
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  };

  // Aplica mascara preservando a posicao do cursor — assim editar um digito no
  // meio (ex.: trocar so o ano) nao embaralha o campo. Contamos digitos antes
  // do caret, reformatamos, e posicionamos o caret depois do mesmo numero de
  // digitos no valor novo.
  const applyDateMaskKeepCaret = (input) => {
    const original = input.value;
    const selStart = input.selectionStart ?? original.length;
    let digitsBeforeCaret = 0;
    for (let i = 0; i < selStart; i++)
      if (/\d/.test(original[i])) digitsBeforeCaret++;
    const formatted = formatDateBrValue(original);
    if (formatted === original) return;
    input.value = formatted;
    let newCaret = formatted.length;
    let digitsSeen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (digitsSeen === digitsBeforeCaret) {
        newCaret = i;
        break;
      }
      if (/\d/.test(formatted[i])) digitsSeen++;
    }
    if (digitsSeen < digitsBeforeCaret) newCaret = formatted.length;
    try {
      input.setSelectionRange(newCaret, newCaret);
    } catch (e) {}
  };

  // Overtype: quando o campo ja tem 8 digitos e o usuario digita sobre um
  // digito (caret NAO em selecao), substitui o digito da direita em vez de
  // inserir — evita ter que apagar pra trocar um numero.
  const dateOvertypeKeydown = (input) => (e) => {
    if (!/^\d$/.test(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const value = input.value;
    if (value.replace(/\D+/g, '').length < 8) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start !== end) return;
    // Encontra o proximo digito a partir do caret pra substituir.
    let pos = start;
    while (pos < value.length && !/\d/.test(value[pos])) pos++;
    if (pos >= value.length) return;
    e.preventDefault();
    const novo = value.slice(0, pos) + e.key + value.slice(pos + 1);
    input.value = novo;
    // Move caret pra depois do digito substituido, pulando separadores.
    let after = pos + 1;
    while (after < novo.length && !/\d/.test(novo[after]) && after < pos + 2)
      after++;
    try {
      input.setSelectionRange(after, after);
    } catch (err) {}
  };

  document.querySelectorAll('[data-date-mask]').forEach((input) => {
    setDateInputValue(input, input.value);
    // Icone de calendario: abre o seletor de data NATIVO e escreve de volta no
    // campo mascarado (mantendo a digitacao manual em dd/mm/aaaa).
    (function addDatePicker(inp) {
      if (inp.dataset.datePicker === '1') return;
      inp.dataset.datePicker = '1';
      const wrap = document.createElement('span');
      wrap.className = 'date-input-wrap';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      const toIso = (br) => {
        const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
      };
      // Input date nativo TRANSPARENTE por cima do icone (ver CSS). O toque cai
      // direto nele — no iOS e a unica forma do seletor nativo abrir. Ele precisa
      // ser tocavel de verdade, entao NADA de tabIndex -1 / aria-hidden / pointer-
      // events:none aqui (isso mataria o iOS).
      const picker = document.createElement('input');
      picker.type = 'date';
      picker.className = 'date-input-native';
      picker.setAttribute('aria-label', 'Abrir calendário');
      wrap.appendChild(picker);
      // Ícone decorativo (pointer-events:none no CSS) — fica visivel
      // por baixo do input transparente.
      const btn = document.createElement('span');
      btn.className = 'date-input-btn';
      btn.setAttribute('aria-hidden', 'true');
      setIconLabel(btn, 'calendar');
      wrap.appendChild(btn);
      // Sincroniza o mes/dia que o seletor abre com o que ja esta digitado.
      // pointerdown roda ANTES do iOS ler o value e montar a rodinha.
      const syncPickerValue = () => {
        const iso = toIso(inp.value);
        if (iso) picker.value = iso;
      };
      picker.addEventListener('pointerdown', syncPickerValue);
      picker.addEventListener('focus', syncPickerValue);
      // Desktop (Chrome/Edge): um clique simples no input date nao abre o dropdown
      // sozinho — showPicker() resolve. No iOS o proprio toque ja abriu a rodinha e
      // showPicker() lanca; o try/catch engole sem quebrar nada.
      picker.addEventListener('click', () => {
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker();
          } catch (e) {
            /* iOS: ja abriu pelo toque */
          }
        }
      });
      picker.addEventListener('change', () => {
        if (!picker.value) return;
        const p = picker.value.split('-');
        inp.value = p[2] + '/' + p[1] + '/' + p[0];
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    })(input);
    input.addEventListener('input', () => applyDateMaskKeepCaret(input));
    input.addEventListener('keydown', dateOvertypeKeydown(input));
    input.addEventListener('paste', () =>
      setTimeout(() => setDateInputValue(input, input.value), 0),
    );
    input.addEventListener('blur', () => {
      setDateInputValue(input, input.value, true);
      input.setCustomValidity(
        isValidDateBrValue(input.value)
          ? ''
          : 'Use uma data válida em dd/mm/aaaa.',
      );
    });
    input.addEventListener('invalid', () => {
      input.setCustomValidity(
        isValidDateBrValue(input.value)
          ? ''
          : 'Use uma data válida em dd/mm/aaaa.',
      );
    });
  });

  return { setDateInputValue };
};
