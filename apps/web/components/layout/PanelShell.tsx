'use client';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { PanelFlashNotice } from '../ui/PanelFlashNotice.tsx';
import Link from 'next/link';
import { Icon, CsrfInput } from '../../../../src/frontend/clients/ui.tsx';
import { PanelInteractions } from './PanelInteractions.tsx';
import { panelShellData } from '../../lib/panelData.ts';

const menu = [
  ['Dashboard', '/dashboard', 'chart'],
  ['Clientes', '/clientes', 'users'],
  ['Avisos', '/avisos', 'warning'],
  ['Transações', '/transacoes', 'card'],
  ['Planos', '/planos', 'package'],
  ['Servidores', '/servidores', 'server'],
  ['Aplicativos', '/aplicativos', 'phone'],
  ['Dispositivos', '/dispositivos', 'monitor'],
  ['Status', '/status', 'image'],
  ['Mensagens', '/mensagens', 'message'],
  ['Automação', '/automacao', 'bolt'],
];

const PanelDataContext = createContext<((data: any) => void) | null>(null);

// O layout do painel permanece montado entre as rotas. As telas publicam
// seus dados para atualizar o título e a sessão sem recriar os controles.
export function PersistentPanel({
  data,
  children,
}: {
  data: any;
  children: React.ReactNode;
}) {
  const [currentData, setCurrentData] = useState(data);
  useLayoutEffect(() => {
    document.body.className = 'page-app';
  }, []);
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent('gestor:navigated', { detail: { url: location.href } }),
    );
  }, [currentData.currentPath]);
  useEffect(
    () => () => {
      window.__gestorShellAbort?.abort();
    },
    [],
  );
  return (
    <PanelDataContext.Provider value={setCurrentData}>
      <PanelFrame data={currentData} persistent>
        {children}
      </PanelFrame>
    </PanelDataContext.Provider>
  );
}

export function PanelShell({
  data,
  children,
}: {
  data?: any;
  children?: React.ReactNode;
}) {
  const updatePanel = useContext(PanelDataContext);
  useLayoutEffect(() => {
    if (updatePanel) updatePanel(panelShellData(data));
  }, [updatePanel, data]);
  return updatePanel ? (
    children
  ) : (
    <PanelFrame data={data}>{children}</PanelFrame>
  );
}

function PanelFrame({
  data,
  children,
  persistent = false,
}: {
  data: any;
  children?: React.ReactNode;
  persistent?: boolean;
}) {
  const currentPath = data.currentPath || '/clientes';
  const isActive = (href) =>
    currentPath === href || currentPath.startsWith(href + '/');
  const pageTitle = menu.find(([, href]) => isActive(href))?.[0] || data.title;
  return (
    <div
      className="app-shell"
      data-shell=""
      data-ajax-panel=""
      data-persistent-panel={persistent ? '' : undefined}
      data-release-login={data.page.releaseNoticeLoginId || undefined}
      data-session-expires-at={data.page.sessionExpiresAt || undefined}
    >
      <PanelInteractions path={currentPath} />
      <aside className="sidebar" data-sidebar="">
        <a
          className="sidebar-brand sidebar-brand-custom"
          href="/dashboard"
          aria-label="Gestor IXTV - Dashboard"
        >
          <span
            className="sidebar-brand-image"
            style={{
              display: 'block',
              position: 'relative',
              width: 180,
              maxWidth: '100%',
              aspectRatio: '300 / 145',
              overflow: 'hidden',
            }}
          >
            <img
              src="/assets/images/ixlogo.png"
              alt="Gestor IXTV"
              width="243"
              height="243"
            />
          </span>
        </a>
        <nav className="sidebar-nav" aria-label="Menu principal">
          {menu.map(([label, href, icon]) => {
            const content = (
              <>
                <span className="sidebar-ico">
                  <Icon name={icon} />
                </span>
                <span className="sidebar-label">{label}</span>
              </>
            );
            const props = {
              className: `sidebar-link${isActive(href) ? ' active' : ''}`,
              href,
              'aria-current': isActive(href) ? ('page' as const) : undefined,
            };
            return (
              <Link key={href} prefetch={false} {...props}>
                {content}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <form method="post" action="/logout" className="sidebar-logout-form">
            <CsrfInput token={data.page.csrfToken} />
            <button className="sidebar-logout" type="submit" title="Sair">
              <span className="sidebar-ico">
                <Icon name="logout" />
              </span>
              <span className="sidebar-label">Sair</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar2">
          <div className="topbar2-title">
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar2-actions">
            <a
              className="topbar-chip"
              href="/whatsapp"
              data-wa-chip=""
              data-wa-state-key={`gestor:wa-state:${data.user.id}`}
              title="Status do WhatsApp"
            >
              <span className="wa-dot" />
              <span className="wa-ico">
                <Icon name="phone" />
              </span>
            </a>
            <button
              className="theme-toggle"
              type="button"
              data-theme-toggle=""
              aria-label="Alternar tema claro/escuro"
            >
              <span className="ui-theme-sun">
                <Icon name="sun" />
              </span>
              <span className="ui-theme-moon">
                <Icon name="moon" />
              </span>
            </button>
            <div className="notif-wrap" data-notif-wrap="">
              <button
                className="topbar-icon notif-bell-btn"
                type="button"
                data-notif-toggle=""
                aria-label="Notificações"
                aria-expanded="false"
              >
                <svg
                  className="notif-bell-svg"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span
                  className="topbar-badge"
                  data-notif-count=""
                  style={{ display: 'none' }}
                />
              </button>
              <div className="notif-panel" data-notif-panel="" hidden>
                <div className="notif-panel-head">
                  <div className="notif-head-title">
                    <strong>Notificações</strong>
                  </div>
                  <button
                    type="button"
                    className="notif-clear-all"
                    data-notif-clear=""
                  >
                    Limpar tudo
                  </button>
                </div>
                <ul className="notif-list" data-notif-list="">
                  <li className="notif-empty">
                    <span className="notif-empty-title">Tudo em dia</span>
                    <span className="notif-empty-sub">
                      Pagamentos, créditos e alertas de envios aparecem aqui.
                    </span>
                  </li>
                </ul>
                <div className="notif-panel-foot">
                  <a href="/minha-conta">Ajustar notificações</a>
                </div>
              </div>
            </div>
            <div className="account-menu-wrap" data-account-menu-wrap="">
              <button
                className="topbar-avatar"
                type="button"
                data-account-menu-toggle=""
                title="Menu da conta"
                aria-label="Abrir menu da conta"
                aria-expanded="false"
                aria-controls="account-menu"
              >
                {(data.user.name || 'U').slice(0, 1).toUpperCase()}
              </button>
              <nav
                className="account-menu"
                id="account-menu"
                aria-label="Conta"
                data-account-menu=""
                hidden
              >
                <a href="/minha-conta">
                  <Icon name="settings" />
                  <span>Configurações</span>
                </a>
                <a href="/integracao-pagamento">
                  <Icon name="card" />
                  <span>Integração de pagamento</span>
                </a>
              </nav>
            </div>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
      <nav className="mobile-dock" aria-label="Atalhos principais">
        <a href="/dashboard" data-dock-link="">
          <Icon name="chart" />
          <span>Dashboard</span>
        </a>
        <Link
          href="/clientes"
          prefetch={false}
          data-dock-link=""
          className={isActive('/clientes') ? 'is-active' : undefined}
          aria-current={isActive('/clientes') ? 'page' : undefined}
        >
          <Icon name="users" />
          <span>Clientes</span>
        </Link>
        <a href="/automacao" data-dock-link="">
          <Icon name="bolt" />
          <span>Automação</span>
        </a>
        <button
          type="button"
          data-sidebar-mobile=""
          aria-expanded="false"
          aria-label="Abrir menu"
        >
          <Icon name="menu" />
          <span>Menu</span>
        </button>
      </nav>
      <button
        className="sidebar-backdrop"
        type="button"
        data-sidebar-backdrop=""
        aria-label="Fechar menu"
        tabIndex={-1}
      />
    </div>
  );
}

export function SiteNotice({
  success = [],
  error = [],
}: {
  success?: string[];
  error?: string[];
}) {
  return <PanelFlashNotice success={success} error={error} />;
}
