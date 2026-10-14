'use client';
import { Icon } from '../../../src/frontend/clients/ui.tsx';
import { formatMoney } from '../../../src/services/format.ts';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { GeographyMap, SeriesChart } from './DashboardCharts.tsx';

const width = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
function Distribution({
  title,
  items,
  money = false,
  empty,
}: {
  title?: React.ReactNode;
  items?: any;
  money?: boolean;
  empty?: any;
}) {
  return (
    <div className="dist-card">
      <div className="dist-head spread">
        <span>{title}</span>
        <span className="dist-total">
          Total:{' '}
          <strong>
            {money
              ? formatMoney(
                  items.reduce((sum, item) => sum + Number(item.valor || 0), 0),
                )
              : items.reduce((sum, item) => sum + Number(item.total || 0), 0)}
          </strong>
        </span>
      </div>
      {items.length ? (
        <div className="bar-list">
          {items.map((item, index) => (
            <div className="bar-item" key={index}>
              <div className="bar-item-head">
                <span>{item.rotulo}</span>
                <strong>
                  {money ? formatMoney(item.valor) : item.total}{' '}
                  <em>{item.percent}%</em>
                </strong>
              </div>
              <div className="meter">
                <i className="c-blue" style={{ width: width(item.percent) }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dist-empty tall">{empty}</div>
      )}
    </div>
  );
}
export function DashboardScreen({ data }: { data?: any }) {
  const { stats, acessos, chart, performance } = data;
  return (
    <NativePanel data={data} path="/dashboard">
      <link rel="stylesheet" href="/assets/css/native-dashboard.css" />
      <div className="container dash" data-react-page="dashboard">
        <div className="ui-summary ui-summary-4">
          {[
            [
              'Ativos',
              stats.ativos,
              `${data.ativosPercent}% da base`,
              'green',
              'users',
            ],
            [
              'Vencidos',
              stats.vencidos,
              `${data.vencidosPercent}% da carteira`,
              'red',
              'warning',
            ],
            [
              'Total de Clientes',
              stats.clientesTotal,
              'Cada cadastro conta uma vez',
              'blue',
              'users',
            ],
            [
              'Servidores',
              stats.servidoresCount,
              'Painéis cadastrados',
              'purple',
              'server',
            ],
          ].map(([label, value, foot, color, icon]) => (
            <div className={`stat-box accent-${color}`} key={label}>
              <div>
                <span className="stat-label">{label}</span>
                <strong className="stat-value">{value}</strong>
                <small className="stat-foot">{foot}</small>
              </div>
              <div className="stat-icon">
                <Icon name={icon} />
              </div>
            </div>
          ))}
        </div>
        {acessos && (
          <section className="dash-access">
            <div className="dash-access-heading">
              <h3>
                <Icon name="server" /> Acessos por servidor
              </h3>
              <span>Clientes não arquivados</span>
            </div>
            <div className="dash-access-overview">
              <div className="dash-access-main">
                <span>Clientes cadastrados</span>
                <strong>{acessos.clientes}</strong>
                <small>
                  <b>{acessos.comUm}</b> com 1 acesso <span>·</span>{' '}
                  <b>{acessos.comDois}</b> com 2 acessos
                </small>
              </div>
              <div className="dash-access-main">
                <span>Total de acessos</span>
                <strong className="dash-access-total">{acessos.total}</strong>
                <small>
                  {acessos.clientes} principais + {acessos.comDois} adicionais
                </small>
              </div>
            </div>
            <div className="dash-access-status">
              <span className="is-active">
                <i />
                <b>{acessos.ativos}</b> ativos
              </span>
              <span className="is-expired">
                <i />
                <b>{acessos.vencidos}</b> vencidos
              </span>
              <span>
                <i />
                <b>{acessos.inativos}</b> inativos
              </span>
            </div>
            <div className="dash-access-servers">
              <div className="dash-access-row dash-access-labels">
                <span>Servidor</span>
                <span>Acessos</span>
                <span>Ativos</span>
                <span>Vencidos</span>
                <span>Inativos</span>
              </div>
              {acessos.servidores.map((server, index) => (
                <div className="dash-access-row" key={index}>
                  <strong className="dash-access-name">{server.nome}</strong>
                  {[
                    ['total', 'Acessos', ''],
                    ['ativos', 'Ativos', 'pos'],
                    ['vencidos', 'Vencidos', 'neg'],
                    ['inativos', 'Inativos', ''],
                  ].map(([key, label, color]) => (
                    <span key={key} data-label={label} className={color}>
                      <b>{server[key]}</b>
                    </span>
                  ))}
                </div>
              ))}
              {!acessos.servidores.length && (
                <p className="muted dash-access-empty">
                  Nenhum acesso cadastrado.
                </p>
              )}
            </div>
            <p className="dash-access-note">
              Cada cliente conta uma vez. Cada acesso tem seu próprio
              vencimento.
            </p>
          </section>
        )}
        <section className="dash-section">
          <h3 className="dash-section-title">
            <Icon name="money" /> Receita x Custo
          </h3>
          <div className="rc-grid">
            {[
              ['Hoje', 'hoje'],
              ['Mensal', 'mes'],
              ['Mês Anterior', 'mesAnterior'],
            ].map(([label, key]) => (
              <div className="rc-card" key={key}>
                <div className="rc-head">
                  <Icon name="money" /> {label}
                </div>
                {[
                  ['receita', '↗ Receita', 'pos'],
                  ['custo', '↘ Custo', 'neg'],
                  ['lucro', '↗ Lucro', 'info'],
                ].map(([field, title, color]) => (
                  <div
                    className={`rc-row ${field === 'lucro' ? 'total' : ''}`}
                    key={field}
                  >
                    <span>{title}</span>
                    <strong className={color}>
                      {formatMoney(stats.receitaCusto[key][field])}
                    </strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="dash-section">
          <h3 className="dash-section-title">
            <Icon name="clock" /> Vencimentos
          </h3>
          <div className="venc-grid">
            {[
              ['Vence Hoje', 'hoje', 'yellow'],
              ['Vence Amanhã', 'amanha', 'blue'],
              ['Venceu Ontem', 'ontem', 'red'],
            ].map(([label, key, color]) => (
              <div className={`venc-card accent-${color}`} key={key}>
                <span className="venc-label">
                  <Icon name="calendar" /> {label}
                </span>
                <strong className="venc-value">
                  {stats.vencimentos[key].total}
                </strong>
                <small>{formatMoney(stats.vencimentos[key].valor)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="dash-section">
          <h3 className="dash-section-title">
            <Icon name="money" /> Financeiro
          </h3>
          <div className="fin-grid">
            {[
              ['Recebido Hoje', 'recebidoHoje'],
              ['Recebido no Mês', 'recebidoMes'],
              ['Mês Anterior', 'recebidoMesAnterior'],
              ['Projeção Mensal', 'projecao'],
            ].map(([label, key]) => (
              <div className="fin-card" key={key}>
                <span className="fin-label">{label}</span>
                <strong className="fin-value">
                  {formatMoney(stats.financeiro[key])}
                </strong>
                {key === 'recebidoMes' && (
                  <small
                    className={
                      stats.financeiro.variacaoMes >= 0 ? 'pos' : 'neg'
                    }
                  >
                    {stats.financeiro.variacaoMes >= 0 ? '↗' : '↘'}{' '}
                    {stats.financeiro.variacaoMes}% vs mês anterior
                  </small>
                )}
                {key === 'projecao' && (
                  <small className="muted">Baseada no recebido até hoje</small>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="dash-section">
          <h3 className="dash-section-title">
            <Icon name="chart" /> Gráficos
          </h3>
          <div className="chart-grid">
            <div className="chart-card">
              <div className="chart-head">
                <strong>↗ Faturamento x Custo x Lucro</strong>
              </div>
              <SeriesChart
                title="Faturamento, custo e lucro por dia"
                money
                labels={chart.labels}
                series={[
                  {
                    label: 'Faturamento',
                    values: chart.receita,
                    color: '#6366f1',
                  },
                  { label: 'Custo', values: chart.custo, color: '#ef4444' },
                  { label: 'Lucro', values: chart.lucro, color: '#22c55e' },
                ]}
              />
            </div>
            <div className="chart-card">
              <div className="chart-head">
                <strong>
                  <Icon name="users" /> Novos Clientes
                </strong>
                <span className="chart-tag">{data.novosNoMes} este mês</span>
              </div>
              <SeriesChart
                title="Novos clientes por dia"
                labels={chart.labels}
                series={[
                  {
                    label: 'Novos clientes',
                    values: chart.novos,
                    color: '#eab308',
                  },
                ]}
              />
            </div>
          </div>
        </section>
        <section className="dash-section dist-section">
          <div className="dist-section-head">
            <h3 className="dash-section-title">
              <Icon name="package" /> Distribuição
            </h3>
            <form method="get" action="/dashboard" className="dist-period">
              <span className="dist-period-label">⛛ Período</span>
              <select
                name="periodo"
                defaultValue={data.periodo}
                aria-label="Período"
                onChange={(event) => event.currentTarget.form.requestSubmit()}
              >
                <option value="mes">Este Mês</option>
                <option value="anterior">Mês Anterior</option>
                <option value="todos">Todos</option>
              </select>
            </form>
          </div>
          <div className="dist-grid">
            <Distribution
              title="Top Aplicativos"
              items={data.topAplicativos}
              empty="Sem dados de aplicativos"
            />
            <Distribution
              title="Top Dispositivos"
              items={data.topDispositivos}
              empty="Sem dados de dispositivos"
            />
            <Distribution
              title="Formas de Pagamento"
              items={data.formasPagamento}
              money
              empty="Sem transações registradas"
            />
            <Distribution
              title="Distribuição de Planos"
              items={data.planosDist}
              empty="Sem dados de planos"
            />
            <div className="dist-card">
              <div className="dist-head spread">
                <span>Performance por Servidor</span>
                <span className="dist-total">
                  {performance.itens.reduce(
                    (sum, item) => sum + Number(item.total || 0),
                    0,
                  )}{' '}
                  clientes
                </span>
              </div>
              {performance.itens.length ? (
                <>
                  <div className="perf-cards">
                    {[
                      ['Faturamento', 'faturamento', 'fat'],
                      ['Custo', 'custo', 'cost'],
                      ['Lucro', 'lucro', 'profit'],
                    ].map(([label, key, color]) => (
                      <div className={`perf-card ${color}`} key={key}>
                        <span>{label}</span>
                        <strong>{formatMoney(performance[key])}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="perf-list">
                    {performance.itens.map((item, index) => (
                      <div className="perf-row" key={index}>
                        <div className="perf-row-head">
                          <span className="perf-name">
                            <Icon name="monitor" /> {item.servidor}{' '}
                            <em>{item.total} cli.</em>
                          </span>
                          <span className="perf-vals">
                            <b>Fat.</b> {formatMoney(item.faturamento)}{' '}
                            <b>Custo</b> {formatMoney(item.custo)} <b>Lucro</b>{' '}
                            {formatMoney(item.lucro)}{' '}
                            <span
                              className={`perf-margin ${item.margem >= 0 ? 'pos' : 'neg'}`}
                            >
                              {item.margem >= 0 ? '↗' : '↘'} {item.margem}%
                            </span>
                          </span>
                        </div>
                        <div className="meter split">
                          <i
                            className="c-green"
                            style={{ width: width(item.lucroPercent) }}
                          />
                          <i
                            className="c-red"
                            style={{ width: width(item.custoPercent) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="perf-legend">
                    <span>
                      <i className="dot c-green" /> Lucro
                    </span>
                    <span>
                      <i className="dot c-red" /> Custo
                    </span>
                  </div>
                </>
              ) : (
                <div className="dist-empty tall">Sem dados de servidores</div>
              )}
            </div>
            <Distribution
              title="Top Indicações"
              items={data.indicacoes}
              empty="Nenhuma indicação registrada"
            />
            <GeographyMap kind="estados" data={data.estados} />
            <GeographyMap kind="paises" data={data.paises} />
            <div className="dist-card span-2">
              <div className="dist-head">
                <Icon name="clock" /> Próximos vencimentos
              </div>
              {data.proximos.length ? (
                <div className="dist-list">
                  {data.proximos.map((item) => (
                    <a key={item.id} className="dist-row link" href="/clientes">
                      <span>
                        {item.nome}{' '}
                        <em className="muted">{item.plano || 'Sem plano'}</em>
                      </span>
                      <span
                        className={`dash-pill ${Number(item.dias) <= 1 ? 'today' : ''}`}
                      >
                        {Number(item.dias) === 0
                          ? 'Hoje'
                          : Number(item.dias) === 1
                            ? 'Amanhã'
                            : `em ${item.dias} dias`}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="dist-empty">Nenhum vencimento futuro</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </NativePanel>
  );
}
