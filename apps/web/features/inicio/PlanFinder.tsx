'use client';
import { useState } from 'react';

const devices = [
  ['android', 'Android, Android TV ou Google TV', '25'],
  ['fireos', 'Fire TV com Fire OS', '25'],
  ['vega', 'Fire TV com Vega OS', '30'],
  ['ios', 'iPhone (iOS)', '30'],
  ['samsung', 'Smart TV Samsung', '30'],
  ['lg', 'Smart TV LG', '30'],
  ['roku', 'Roku ou Roku TV', '30'],
  ['xbox', 'Xbox', '30'],
  ['unknown', 'Outro aparelho ou não sei o sistema', 'none'],
];

export function planFinderContact(
  contacts: Record<string, string>,
  device: string,
  model: string,
) {
  const choice = devices.find(([key]) => key === device);
  const base = contacts[choice?.[2] || 'none'];
  if (!choice || !base) return '#contato';
  try {
    const url = new URL(base);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'wa.me' ||
      !/^\/\d{10,15}$/.test(url.pathname)
    )
      return '#contato';
    const price =
      choice[2] === 'none'
        ? 'Quero ajuda para escolher um plano.'
        : `Quero confirmar o plano de R$ ${choice[2]}/mês.`;
    url.searchParams.set(
      'text',
      `Olá! ${price} Meu aparelho: ${choice[1]}.${model.trim() ? ` Modelo: ${model.trim().slice(0, 100)}.` : ''} Podem confirmar a compatibilidade e orientar a instalação?`,
    );
    return url.toString();
  } catch {
    return '#contato';
  }
}

export function PlanFinder({
  contacts,
  contactReady,
}: {
  contacts: Record<string, string>;
  contactReady: boolean;
}) {
  const [device, setDevice] = useState('');
  const [model, setModel] = useState('');
  const choice = devices.find(([key]) => key === device);
  return (
    <div className="plan-finder" aria-labelledby="plan-finder-title">
      <div className="plan-finder-intro">
        <h3 id="plan-finder-title">Qual plano combina com seu aparelho?</h3>
        <p>
          Informe onde você quer assistir. Depois, confirme o modelo com o
          atendimento.
        </p>
      </div>
      <div className="plan-finder-fields">
        <label>
          <span>Seu aparelho</span>
          <select
            value={device}
            onChange={(event) => setDevice(event.target.value)}
            name="aparelho-plano"
          >
            <option value="">Escolha seu aparelho</option>
            {devices.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Modelo <small>(opcional)</small>
          </span>
          <input
            name="modelo-aparelho"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            maxLength={100}
            placeholder="Ex.: modelo informado nas configurações"
          />
        </label>
      </div>
      {choice && (
        <div className="plan-finder-result">
          <div role="status" aria-live="polite">
            <strong>
              {choice[2] === 'none'
                ? 'Vamos conferir seu aparelho juntos'
                : `Sugestão: plano de R$ ${choice[2]}/mês`}
            </strong>
            <p>
              {choice[2] === '25'
                ? 'Uma opção para aparelhos com Android ou Fire OS. O modelo e o aplicativo precisam ser confirmados.'
                : choice[2] === '30'
                  ? 'A opção com compatibilidade mais ampla. Confirme seu modelo e a quantidade de telas com o atendimento.'
                  : 'Informe o modelo no WhatsApp para receber a indicação adequada.'}
            </p>
          </div>
          <a
            className="button button-purple"
            href={planFinderContact(contacts, device, model)}
          >
            {contactReady ? 'Confirmar no WhatsApp' : 'Ver contato'}
          </a>
        </div>
      )}
    </div>
  );
}
