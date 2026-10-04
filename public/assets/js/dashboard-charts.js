(function () {
  if (typeof Chart === 'undefined' || !window.__dashData) return;
  const charts = [];
  document.addEventListener('gestor:before-swap', () => charts.forEach(chart => chart.destroy()), { once: true });
  var d = window.__dashData;

  var css = getComputedStyle(document.documentElement);
  var muted = (css.getPropertyValue('--muted') || '#97a3b4').trim();
  var border = (css.getPropertyValue('--border') || '#2c333c').trim();
  // Cores alinhadas aos tokens indigo do painel.
  var COR = { receita: '#6366f1', custo: '#ef4444', lucro: '#22c55e', novos: '#eab308' };

  Chart.defaults.color = muted;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

  function brl(v) {
    try { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    catch (e) { return 'R$ ' + v; }
  }

  function fill(ctx, hex) {
    var g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, hex + '55');
    g.addColorStop(1, hex + '00');
    return g;
  }

  function lineDataset(label, data, hex, ctx) {
    return {
      label: label, data: data, borderColor: hex, backgroundColor: fill(ctx, hex),
      borderWidth: 2, tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 4,
      pointBackgroundColor: hex,
    };
  }

  var gridCfg = { color: border + '66', drawBorder: false };
  function baseOpts(moneyTip) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: moneyTip ? { label: function (c) { return c.dataset.label + ': ' + brl(c.parsed.y); } } : {},
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: gridCfg, ticks: { precision: 0 }, beginAtZero: true },
      },
    };
  }

  var elFin = document.getElementById('chartFinanceiro');
  if (elFin) {
    var ctxFin = elFin.getContext('2d');
    charts.push(new Chart(ctxFin, {
      type: 'line',
      data: { labels: d.labels, datasets: [
        lineDataset('Faturamento', d.receita, COR.receita, ctxFin),
        lineDataset('Custo', d.custo, COR.custo, ctxFin),
        lineDataset('Lucro', d.lucro, COR.lucro, ctxFin),
      ] },
      options: baseOpts(true),
    }));
  }

  var elNovos = document.getElementById('chartNovos');
  if (elNovos) {
    var ctxNovos = elNovos.getContext('2d');
    charts.push(new Chart(ctxNovos, {
      type: 'line',
      data: { labels: d.labels, datasets: [lineDataset('Novos clientes', d.novos, COR.novos, ctxNovos)] },
      options: baseOpts(false),
    }));
  }
})();
