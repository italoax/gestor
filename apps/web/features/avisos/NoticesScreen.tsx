'use client';
import { Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';

const panels = [
  { name: 'Painel Genial', url: 'https://dashgen.net/' },
  { name: 'Painel UniTV', url: 'https://panel-web.revenda.watch/' },
  { name: 'UniTV Web', url: 'https://www.unitvprime.vip/' },
  { name: 'Manager Apps', url: 'https://reseller.multi-player.app/' },
];

export function NoticesScreen({ data }: { data?: any }) {
  return (
    <NativePanel data={data} path="/avisos">
      <div className="container page-avisos" data-react-page="avisos">
        <section className="avisos-paineis" aria-labelledby="paineis-heading">
          <div className="ui-catalog-heading">
            <h2 id="paineis-heading">
              Painéis e aplicativos <span>{panels.length}</span>
            </h2>
            <p className="muted">Acesse os painéis pelos atalhos abaixo.</p>
          </div>
          <ul className="painel-links">
            {panels.map((panel) => (
              <li key={panel.url}>
                <div className="painel-link">
                  <span className="aviso-icon">
                    <Icon name="monitor" />
                  </span>
                  <span className="painel-link-info">
                    <strong>{panel.name}</strong>
                    <span>{new URL(panel.url).hostname}</span>
                  </span>
                  <a
                    className="painel-link-action"
                    href={panel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${panel.name} em nova aba`}
                  >
                    Abrir ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </NativePanel>
  );
}
