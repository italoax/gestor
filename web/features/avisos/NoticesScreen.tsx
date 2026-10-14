'use client';
import { Icon } from '../../../src/frontend/clients/ui.tsx';
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
        <div className="ui-catalog-heading">
          <h2>
            Painéis e aplicativos <span>{panels.length}</span>
          </h2>
          <p className="muted">Acesse os painéis pelos atalhos abaixo.</p>
        </div>
        <div className="avisos-list avisos-paineis">
          {panels.map((panel) => (
            <article className="aviso-card" key={panel.url}>
              <div className="aviso-icon">
                <Icon name="monitor" />
              </div>
              <div className="aviso-content">
                <div className="aviso-heading">
                  <h3>{panel.name}</h3>
                </div>
                <p>{new URL(panel.url).hostname}</p>
              </div>
              <div className="aviso-actions">
                <a
                  className="btn btn-primary"
                  href={panel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${panel.name} em nova aba`}
                >
                  Abrir painel
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </NativePanel>
  );
}
