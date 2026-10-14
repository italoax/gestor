import { LandingPortal } from './LandingPortal.tsx';
export function LandingContent({ data }: { data?: any }) {
  return (
    <div data-react-page="inicio">
      <a className={'skip-link'} href={'#conteudo'}>
        {'Pular para o conteúdo'}
      </a>

      <svg
        width={'0'}
        height={'0'}
        aria-hidden={'true'}
        style={{ position: 'absolute', pointerEvents: 'none' }}
      >
        <defs>
          <filter id={'logo-remove-black'} colorInterpolationFilters={'sRGB'}>
            <feColorMatrix
              type={'matrix'}
              values={'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 0'}
            ></feColorMatrix>
          </filter>
        </defs>
      </svg>

      <header className={'site-header wrap'}>
        <a className={'brand'} href={'/'} aria-label={'ixstreaming, início'}>
          <span className={'brand-image'}>
            <img
              src={'/assets/images/ixlogo.png'}
              alt={'ixstreaming'}
              width={'1280'}
              height={'1280'}
              fetchPriority={'high'}
            />
          </span>
        </a>
        <nav aria-label={'Menu principal'}>
          <a href={'#como-funciona'}>{'Como funciona'}</a>
          <a href={'#planos'}>{'Planos'}</a>
          <a href={'#duvidas'}>{'Dúvidas'}</a>
        </nav>
        <LandingPortal />
      </header>

      <main id={'conteudo'}>
        <section className={'hero wrap'}>
          <div className={'hero-copy'}>
            <p className={'eyebrow'}>
              <span className={'live-dot'}></span>
              {' SEU MOMENTO DE DESLIGAR DO RESTO'}
            </p>
            <h1>
              {'Aperte o play.'}
              <br />
              {'O momento'}
              <br />
              {'é '}
              <em>{'seu.'}</em>
            </h1>
            <p className={'intro'}>
              {
                'Conheça a IX Streaming: planos de IPTV e TV online para o seu momento de entretenimento. Confira os aparelhos compatíveis e escolha como assistir.'
              }
            </p>
            <div className={'hero-actions'}>
              <a className={'button button-purple'} href={'#planos'}>
                {'Conhecer os planos'}
              </a>
              <span className={'starting'}>
                {'A partir de '}
                <strong>
                  {'R$ 25'}
                  <span>{'/mês'}</span>
                </strong>
              </span>
            </div>
            <p className={'hero-note'}>
              {'Dois planos mensais. Você escolhe como começar.'}
            </p>
          </div>
          <aside className={'hero-offer'} aria-labelledby={'hero-offer-title'}>
            <div className={'offer-heading'}>
              <span className={'offer-overline'}>{'ENCONTRE SEU PLANO'}</span>
              <span className={'offer-pill'}>{'TV por assinatura'}</span>
            </div>
            <h2 id={'hero-offer-title'}>
              {'Seu aparelho.'}
              <br />
              {'Seu jeito de assistir.'}
            </h2>
            <p className={'offer-intro'}>{'Duas opções para você escolher.'}</p>
            <a
              className={'offer-option'}
              href={data.contacts['25']}
              aria-label={'Conhecer o plano Android de 25 reais por mês'}
            >
              <span className={'offer-device'} aria-hidden={'true'}>
                <svg
                  width={'26'}
                  height={'26'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'1.6'}
                  strokeLinecap={'round'}
                >
                  <rect
                    x={'6'}
                    y={'2'}
                    width={'12'}
                    height={'20'}
                    rx={'3'}
                  ></rect>
                  <path d={'M10 5h4M11 19h2'}></path>
                </svg>
              </span>
              <span className={'offer-info'}>
                <strong>{'Android e Android TV'}</strong>
                <span>{'Mais estabilidade'}</span>
              </span>
              <span className={'offer-price'}>
                <span>
                  {'R$ '}
                  <strong>{'25'}</strong>
                </span>
                <small>{'por mês'}</small>
              </span>
            </a>
            <a
              className={'offer-option offer-option-wide'}
              href={data.contacts['30']}
              aria-label={
                'Conhecer o plano de todos os dispositivos por 30 reais por mês'
              }
            >
              <span className={'offer-device'} aria-hidden={'true'}>
                <svg
                  width={'26'}
                  height={'26'}
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'1.6'}
                  strokeLinecap={'round'}
                >
                  <rect
                    x={'2'}
                    y={'3'}
                    width={'20'}
                    height={'14'}
                    rx={'2'}
                  ></rect>
                  <path d={'M8 21h8M12 17v4'}></path>
                </svg>
              </span>
              <span className={'offer-info'}>
                <strong>{'Todos os dispositivos'}</strong>
                <span>{'Mais possibilidades'}</span>
              </span>
              <span className={'offer-price'}>
                <span>
                  {'R$ '}
                  <strong>{'30'}</strong>
                </span>
                <small>{'por mês'}</small>
              </span>
            </a>
            <div
              className={'offer-platforms'}
              aria-label={'Dispositivos do plano de 30 reais'}
            >
              <span>{'Android'}</span>
              <span>{'iPhone'}</span>
              <span>{'Samsung'}</span>
              <span>{'LG'}</span>
              <span>{'Roku'}</span>
              <span>{'Xbox'}</span>
            </div>
            <div className={'offer-bottom'}>
              <span className={'offer-check'} aria-hidden={'true'}>
                {'✓'}
              </span>
              <p>
                {'Precisa de ajuda para escolher?'}
                <br />
                <a href={data.contacts['none']}>
                  {'Converse com a gente no WhatsApp.'}
                </a>
              </p>
            </div>
          </aside>
        </section>
        <div className={'statement-strip'}>
          <div className={'wrap'}>
            <span>{'CANAIS DE TV'}</span>
            <span aria-hidden={'true'}>{'✳'}</span>
            <span>{'PLANOS MENSAIS'}</span>
            <span aria-hidden={'true'}>{'✳'}</span>
            <span>{'DO SEU JEITO'}</span>
            <span aria-hidden={'true'}>{'✳'}</span>
            <span>{'ixstreaming'}</span>
          </div>
        </div>
        <section className={'section wrap experience'}>
          <div>
            <p className={'eyebrow'}>{'UM ESPAÇO NA SUA ROTINA'}</p>
            <h2>
              {'Tem hora que tudo'}
              <br />
              {'o que você quer'}
              <br />
              {'é '}
              <em>{'dar um play.'}</em>
            </h2>
          </div>
          <div className={'experience-copy'}>
            <p>
              {
                'Depois de um dia cheio. Na pausa entre uma tarefa e outra. Naquele tempo que você reservou só para você.'
              }
            </p>
            <p>
              {
                'A ixstreaming oferece planos mensais de canais de TV para fazer parte desses momentos. Conheça as opções e tire suas dúvidas antes de escolher.'
              }
            </p>
            <a className={'text-link'} href={'#planos'}>
              {'Encontre seu plano'}
            </a>
          </div>
        </section>
        <section className={'section steps-section'} id={'como-funciona'}>
          <div className={'wrap'}>
            <div className={'section-heading'}>
              <div>
                <p className={'eyebrow'}>{'DO INTERESSE AO PRIMEIRO PLAY'}</p>
                <h2>{'Vamos começar?'}</h2>
              </div>
              <p>
                {'Conheça as opções e combine'}
                <br />
                {'os detalhes com nosso atendimento.'}
              </p>
            </div>
            <div className={'steps'}>
              <article>
                <span className={'step-number'}>{'01 /'}</span>
                <h3>{'Escolha seu plano'}</h3>
                <p>
                  {
                    'Veja as opções de R$ 25 e R$ 30 por mês e escolha qual você quer conhecer melhor.'
                  }
                </p>
              </article>
              <article>
                <span className={'step-number'}>{'02 /'}</span>
                <h3>{'Tire suas dúvidas'}</h3>
                <p>
                  {
                    'Consulte a programação, os aparelhos compatíveis e as condições do plano antes de contratar.'
                  }
                </p>
              </article>
              <article>
                <span className={'step-number'}>{'03 /'}</span>
                <h3>{'Combine sua ativação'}</h3>
                <p>
                  {
                    'Fale com o atendimento sobre o pagamento e receba as orientações para começar a assistir.'
                  }
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className={'section wrap plans-section'} id={'planos'}>
          <div className={'section-heading'}>
            <div>
              <p className={'eyebrow'}>{'ESCOLHA SEU PRÓXIMO PLAY'}</p>
              <h2>
                {'Seu entretenimento.'}
                <br />
                {'Seu plano.'}
              </h2>
            </div>
            <p>
              {'Mensalidades simples de entender.'}
              <br />
              {'Conheça os detalhes de cada opção.'}
            </p>
          </div>
          <div className={'plans'}>
            <article className={'plan '}>
              <div className={'plan-top'}>
                <span className={'plan-label'}>{'PLANO 01'}</span>
                <span className={'plan-cycle'}>{'Mensal'}</span>
              </div>
              <h3>{'ixstreaming Android'}</h3>
              <p className={'plan-description'}>
                {'Mais estabilidade para assistir no Android.'}
              </p>
              <div className={'price'}>
                <span>{'R$'}</span>
                <strong>{'25'}</strong>
                <span>
                  {',00 '}
                  <small>{'/mês'}</small>
                </span>
              </div>
              <div className={'plan-divider'}></div>
              <ul>
                <li>{'Plano de canais de TV'}</li>
                <li>{'1 crédito = 1 tela'}</li>
                <li>{'Teste de 3 dias, se nunca foi instalado no aparelho'}</li>
                <li>{'Compatível com Android e Android TV'}</li>
                <li>{'Mi TV Stick, Xiaomi TV Stick e Mi Box'}</li>
                <li>{'TV Box com sistema Android'}</li>
                <li>
                  {
                    'Fire TV e Fire TV Stick com Fire OS, compatíveis com o aplicativo (veja o aviso abaixo)'
                  }
                </li>
                <li>{'Celulares e tablets Android'}</li>
                <li>
                  {
                    'TVs TCL, Philips, Sony, AOC, Philco e Toshiba: apenas os modelos com sistema Android TV'
                  }
                </li>
                <li>{'Mais estabilidade na transmissão'}</li>
                <li>{'Mensalidade de R$ 25,00'}</li>
              </ul>
              <a className={'button button-outline'} href={data.contacts['25']}>
                <svg
                  xmlns={'http://www.w3.org/2000/svg'}
                  width={'20'}
                  height={'20'}
                  fill={'currentColor'}
                  className={'contact-icon'}
                  aria-hidden={'true'}
                  focusable={'false'}
                  viewBox={'0 0 16 16'}
                >
                  <path
                    d={
                      'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232'
                    }
                  ></path>
                </svg>
                {' Quero conhecer este plano '}
              </a>
            </article>
            <article className={'plan plan-highlight'}>
              <div className={'plan-top'}>
                <span className={'plan-label'}>{'PLANO 02'}</span>
                <span className={'plan-cycle'}>{'Mensal'}</span>
              </div>
              <h3>{'ixstreaming Todos os dispositivos'}</h3>
              <p className={'plan-description'}>
                {'Para quem quer assistir em todos os dispositivos.'}
              </p>
              <div className={'price'}>
                <span>{'R$'}</span>
                <strong>{'30'}</strong>
                <span>
                  {',00 '}
                  <small>{'/mês'}</small>
                </span>
              </div>
              <div className={'plan-divider'}></div>
              <ul>
                <li>{'Plano de canais de TV'}</li>
                <li>{'1 crédito = 1 tela'}</li>
                <li>{'Teste de 4 horas'}</li>
                <li>{'Compatível com todos os dispositivos'}</li>
                <li>{'Android e iPhone (iOS)'}</li>
                <li>{'Xbox'}</li>
                <li>
                  {
                    'Fire TV com Vega OS: Fire TV Stick 4K Select (2025) e Fire TV Stick HD (2026)'
                  }
                </li>
                <li>
                  {
                    'Smart TVs Samsung, LG, TCL, Philips, Sony, AOC, Philco e Toshiba, além de Roku TV, Android TV e Google TV'
                  }
                </li>
                <li>{'Mensalidade de R$ 30,00'}</li>
              </ul>
              <a className={'button button-purple'} href={data.contacts['30']}>
                <svg
                  xmlns={'http://www.w3.org/2000/svg'}
                  width={'20'}
                  height={'20'}
                  fill={'currentColor'}
                  className={'contact-icon'}
                  aria-hidden={'true'}
                  focusable={'false'}
                  viewBox={'0 0 16 16'}
                >
                  <path
                    d={
                      'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232'
                    }
                  ></path>
                </svg>
                {' Quero conhecer este plano '}
              </a>
            </article>
          </div>
          <aside
            className={'plan-warning'}
            aria-label={'Atenção à compatibilidade do Fire TV'}
          >
            <strong>
              {
                'Atenção ao plano de R$ 25: Fire TV com Vega OS não é compatível'
              }
            </strong>
            <p>
              {'O plano de R$ 25 não funciona no '}
              <b>{'Fire TV Stick 4K Select (2025)'}</b>
              {' nem no '}
              <b>{'Fire TV Stick HD (2026)'}</b>
              {', que usam Vega OS. '}
              <b>
                {'Esses dois modelos são compatíveis com o plano de R$ 30.'}
              </b>
              {
                ' Para outros modelos com Vega OS, escolha o plano de R$ 30 e confirme o aparelho com o atendimento.'
              }
            </p>
          </aside>
          <p className={'plans-note'}>
            {
              'R$ 25/mês: mais estabilidade para aparelhos Android e Android TV, como Mi TV Stick, Mi Box, TV Box Android, celulares e tablets, além de modelos Fire TV compatíveis com o aplicativo. Para Smart TVs, a marca por si só não garante compatibilidade: o modelo precisa usar Android TV. R$ 30/mês: compatibilidade com todos os dispositivos. Confirme o modelo e a quantidade de telas com o atendimento.'
            }
          </p>
        </section>
        <section
          className={'section wrap faq-section'}
          id={'duvidas'}
          aria-labelledby={'faq-title'}
        >
          <div className={'faq-intro'}>
            <span className={'faq-symbol'} aria-hidden={'true'}>
              <svg
                width={'28'}
                height={'28'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'1.8'}
                strokeLinecap={'round'}
                strokeLinejoin={'round'}
              >
                <circle cx={'12'} cy={'12'} r={'9'}></circle>
                <path
                  d={'M9.5 9a2.5 2.5 0 0 1 5 .25c0 1.75-2.5 2-2.5 3.75'}
                ></path>
                <circle
                  cx={'12'}
                  cy={'16.5'}
                  r={'.9'}
                  fill={'currentColor'}
                  stroke={'none'}
                ></circle>
              </svg>
            </span>
            <p className={'eyebrow'}>{'ANTES DO PLAY'}</p>
            <h2 id={'faq-title'}>
              {'Tudo pronto'}
              <br />
              {'para começar?'}
            </h2>
            <p className={'faq-description'}>
              {
                'Do teste ao primeiro play: encontre as respostas sobre planos, aparelhos e ativação.'
              }
            </p>
            <div className={'faq-help'}>
              <strong>{'Ficou alguma dúvida?'}</strong>
              <p>
                {
                  'Conte qual é o seu aparelho. A gente ajuda você a escolher o plano.'
                }
              </p>
              <a className={'text-link'} href={data.contacts['none']}>
                {' Falar com o atendimento '}
                <svg
                  xmlns={'http://www.w3.org/2000/svg'}
                  width={'20'}
                  height={'20'}
                  fill={'currentColor'}
                  className={'contact-icon'}
                  aria-hidden={'true'}
                  focusable={'false'}
                  viewBox={'0 0 16 16'}
                >
                  <path
                    d={
                      'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232'
                    }
                  ></path>
                </svg>
              </a>
            </div>
          </div>
          <div className={'faq-list'}>
            <details name={'faq'} open={true}>
              <summary>
                {'Posso testar antes de contratar?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'No plano de R$ 25, o teste é de 3 dias, desde que nunca tenha sido instalado no aparelho. No plano de R$ 30, o teste é de 4 horas. Solicite seu teste pelo WhatsApp.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Quantas telas posso usar por crédito?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'Cada crédito equivale a 1 tela. Para mais telas, consulte o atendimento sobre os créditos necessários.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Quanto custam os planos?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'O plano ixstreaming Android custa R$ 25,00 por mês. O plano ixstreaming Todos os dispositivos custa R$ 30,00 por mês.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Qual é a diferença entre os planos?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'O plano de R$ 25 oferece mais estabilidade para aparelhos Android e Android TV: Mi TV Stick, Xiaomi TV Stick, Mi Box, TV Box Android, celulares e tablets. Também atende modelos Fire TV e Fire TV Stick compatíveis com o aplicativo. Em TVs TCL, Philips, Sony, AOC, Philco e Toshiba, é necessário que o modelo tenha sistema Android TV. O diferencial do plano de R$ 30 é a compatibilidade com todos os dispositivos, incluindo iPhone (iOS), Xbox, TVs Samsung, LG e Roku. Confirme seu modelo com o atendimento.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Em quais aparelhos posso assistir?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'Para aparelhos Android, você pode escolher qualquer um dos planos. O plano de R$ 30 também atende Fire TV Stick 4K Select (2025) e Fire TV Stick HD (2026), com Vega OS, que não funcionam no plano de R$ 25. Além deles, atende iPhone, Xbox e Smart TVs de marcas como Samsung, LG, TCL, Philips, Sony, AOC, Philco e Toshiba, além de Roku TV, Android TV e Google TV. A compatibilidade depende do modelo, do sistema e do aplicativo disponível. Informe o modelo do seu aparelho ao atendimento para confirmar e receber as orientações de configuração.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Como faço para contratar?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'Escolha um plano nesta página e entre em contato. Você poderá tirar suas dúvidas e combinar o pagamento e a ativação.'
                }
              </p>
            </details>
            <details name={'faq'}>
              <summary>
                {'Posso consultar os canais antes?'}
                <span className={'faq-toggle-icon'} aria-hidden={'true'}></span>
              </summary>
              <p>
                {
                  'Sim, peça ao atendimento informações sobre a programação disponível no plano que você está considerando.'
                }
              </p>
            </details>
          </div>
        </section>
        <section className={'wrap contact-section'} id={'contato'}>
          <div className={'contact-card'}>
            <p className={'eyebrow'}>{'O PRÓXIMO PLAY É SEU'}</p>
            <h2>
              {'Pronto para conhecer'}
              <br />
              {'a ixstreaming?'}
            </h2>
            <p>
              {'Escolha seu plano. Tire suas dúvidas.'}
              <br />
              {'Encontre a programação para o seu momento.'}
            </p>
            {data.contactReady ? (
              <>
                <a
                  className={'button button-dark'}
                  href={data.contacts['none']}
                >
                  <svg
                    xmlns={'http://www.w3.org/2000/svg'}
                    width={'20'}
                    height={'20'}
                    fill={'currentColor'}
                    className={'contact-icon'}
                    aria-hidden={'true'}
                    focusable={'false'}
                    viewBox={'0 0 16 16'}
                  >
                    <path
                      d={
                        'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232'
                      }
                    ></path>
                  </svg>
                  {' Conversar no WhatsApp '}
                </a>
              </>
            ) : (
              <>
                <p className={'contact-pending'}>
                  {
                    'Nosso contato para novas assinaturas estará disponível em breve.'
                  }
                </p>
              </>
            )}
            <a
              className={'instagram-contact'}
              href={'https://www.instagram.com/ixstreaming/'}
              target={'_blank'}
              rel={'noopener noreferrer'}
              aria-label={'Instagram @ixstreaming, abre em nova aba'}
            >
              <svg
                width={'20'}
                height={'20'}
                viewBox={'0 0 24 24'}
                fill={'none'}
                stroke={'currentColor'}
                strokeWidth={'1.8'}
                aria-hidden={'true'}
              >
                <rect
                  x={'3'}
                  y={'3'}
                  width={'18'}
                  height={'18'}
                  rx={'5'}
                ></rect>
                <circle cx={'12'} cy={'12'} r={'4'}></circle>
                <circle
                  cx={'17.5'}
                  cy={'6.5'}
                  r={'1'}
                  fill={'currentColor'}
                  stroke={'none'}
                ></circle>
              </svg>
              {' Siga no Instagram · @ixstreaming '}
            </a>
          </div>
        </section>
      </main>

      <footer className={'wrap site-footer'}>
        <p>
          {'© 2025–'}
          {data.year}
          {' ixstreaming'}
        </p>
      </footer>

      <a
        className={'whatsapp-float'}
        href={data.contacts['none']}
        aria-label={'Falar com a gente pelo WhatsApp'}
        title={'Falar pelo WhatsApp'}
      >
        <svg
          xmlns={'http://www.w3.org/2000/svg'}
          width={'20'}
          height={'20'}
          fill={'currentColor'}
          className={'contact-icon'}
          aria-hidden={'true'}
          focusable={'false'}
          viewBox={'0 0 16 16'}
        >
          <path
            d={
              'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232'
            }
          ></path>
        </svg>
      </a>
    </div>
  );
}
