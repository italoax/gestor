(function () {
  // Mapas de distribuição do dashboard: Brasil por UF e Mundo por país (coropléticos).
  // A geometria vem de @svg-maps via CDN, carregada sob demanda. Se o CDN falhar,
  // as listas "Top Estados / Top Países" renderizadas no servidor continuam visíveis.

  const geo = window.__geoData || { estados: {}, paises: {} };

  // Escala de cor: teal (baixo) -> vermelho (alto), igual à legenda lateral.
  const STOPS = [
    [45, 212, 191],
    [34, 197, 94],
    [234, 179, 8],
    [249, 115, 22],
    [239, 68, 68],
  ];

  const DIACRITICOS = /\p{Diacritic}/gu;

  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function colorFor(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    const seg = r * (STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(seg));
    const t = seg - i;
    const c0 = STOPS[i];
    const c1 = STOPS[i + 1];
    return `rgb(${lerp(c0[0], c1[0], t)}, ${lerp(c0[1], c1[1], t)}, ${lerp(c0[2], c1[2], t)})`;
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(DIACRITICOS, '')
      .toLowerCase()
      .trim();
  }

  const UF_POR_NOME = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    para: 'PA',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
  };

  function codeUF(loc) {
    const byName = UF_POR_NOME[norm(loc.name)];
    if (byName) return byName;
    const id = norm(loc.id).replace(/[^a-z]/g, '');
    return id.slice(-2).toUpperCase();
  }

  function codePais(loc) {
    const id = norm(loc.id).replace(/[^a-z]/g, '');
    return id.slice(-2).toUpperCase();
  }

  const emptyFill = (
    getComputedStyle(document.documentElement).getPropertyValue(
      '--map-empty',
    ) || 'rgba(148,163,184,.14)'
  ).trim();

  function renderMap(container, mapData, counts, code) {
    const valores = Object.values(counts).map(Number);
    const max = Math.max(1, ...valores);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', mapData.viewBox);
    svg.setAttribute('class', 'map-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    mapData.locations.forEach((loc) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', loc.path);
      const val = Number(counts[code(loc)] || 0);
      path.setAttribute('class', 'map-area' + (val > 0 ? ' on' : ''));
      path.style.fill = val > 0 ? colorFor(val / max) : emptyFill;
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${loc.name}: ${val}`;
      path.appendChild(title);
      svg.appendChild(path);
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function fallback(el) {
    if (el && !el.childElementCount) {
      el.innerHTML = `<div class="map-fallback">${el.dataset.empty || 'Mapa indisponível'}</div>`;
    }
  }

  async function boot() {
    const elBR = document.getElementById('mapaBrasil');
    const elW = document.getElementById('mapaMundi');
    if (!elBR && !elW) return;

    if (elBR) {
      try {
        const mod =
          await import('https://cdn.jsdelivr.net/npm/@svg-maps/brazil/+esm');
        renderMap(elBR, mod.default, geo.estados || {}, codeUF);
      } catch (e) {
        fallback(elBR);
      }
    }
    if (elW) {
      try {
        const mod =
          await import('https://cdn.jsdelivr.net/npm/@svg-maps/world/+esm');
        renderMap(elW, mod.default, geo.paises || {}, codePais);
      } catch (e) {
        fallback(elW);
      }
    }
  }

  boot();
})();
