'use client';
import { useState } from 'react';
export function useRenewalSelection(data) {
  const [selection, setSelection] = useState(
    data.selecao || data.escolhas[0]?.selecao || '',
  );
  const [periods, setPeriods] = useState(
    String(data.periodosSelecionados || 1),
  );
  const options =
    data.escolhas.find((group) => group.selecao === selection)?.opcoes ||
    data.opcoesRenovacao;
  const selected =
    options.find((option) => String(option.periodos) === periods) || options[0];
  function changeSelection(value) {
    const group = data.escolhas.find((item) => item.selecao === value);
    setSelection(value);
    setPeriods(String(group?.opcoes[0]?.periodos || 1));
  }
  return {
    selection,
    periods: String(selected?.periodos || 1),
    options,
    selected,
    setPeriods,
    changeSelection,
  };
}
