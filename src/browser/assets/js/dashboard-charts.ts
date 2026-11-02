(function () {
  if (typeof Chart === 'undefined' || !window.__dashData) return;
  const charts = [];
  document.addEventListener(
    'gestor:before-swap',
    () => {
      document.removeEventListener('gestor:theme-change', updateTheme);
      charts.forEach((chart) => chart.destroy());
    },
    { once: true },
  );
  var d = window.__dashData;

  var css = getComputedStyle(document.body);
  var muted = (css.getPropertyValue('--muted') || '#97a3b4').trim();
  var border = (css.getPropertyValue('--chart-grid') || '#303036').trim();
  var COR = {
    receita: css.getPropertyValue('--chart-1').trim() || '#cba0ec',
    custo: css.getPropertyValue('--chart-2').trim() || '#ff98a4',
    lucro: css.getPropertyValue('--chart-3').trim() || '#6adea4',
    novos: css.getPropertyValue('--chart-4').trim() || '#f3c66c',
  };

  Chart.defaults.color = muted;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

  function brl(v) {
    try {
      return Number(v).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    } catch (e) {
      return 'R$ ' + v;
    }
  }

  function fill(ctx, hex) {
    var g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, hex + '55');
    g.addColorStop(1, hex + '00');
    return g;
  }

  function lineDataset(label, data, hex, ctx) {
    return {
      label: label,
      data: data,
      borderColor: hex,
      backgroundColor: fill(ctx, hex),
      borderWidth: 2,
      tension: 0.35,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointBackgroundColor: hex,
    };
  }

  var gridCfg = { color: border, drawBorder: false };
  function baseOpts(moneyTip) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: moneyTip
            ? {
                label: function (c) {
                  return c.dataset.label + ': ' + brl(c.parsed.y);
                },
              }
            : {},
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        },
        y: { grid: gridCfg, ticks: { precision: 0 }, beginAtZero: true },
      },
    };
  }

  var elFin = document.getElementById('chartFinanceiro') as HTMLCanvasElement;
  if (elFin) {
    var ctxFin = elFin.getContext('2d');
    charts.push(
      new Chart(ctxFin, {
        type: 'line',
        data: {
          labels: d.labels,
          datasets: [
            lineDataset('Faturamento', d.receita, COR.receita, ctxFin),
            lineDataset('Custo', d.custo, COR.custo, ctxFin),
            lineDataset('Lucro', d.lucro, COR.lucro, ctxFin),
          ],
        },
        options: baseOpts(true),
      }),
    );
  }

  var elNovos = document.getElementById('chartNovos') as HTMLCanvasElement;
  if (elNovos) {
    var ctxNovos = elNovos.getContext('2d');
    charts.push(
      new Chart(ctxNovos, {
        type: 'line',
        data: {
          labels: d.labels,
          datasets: [
            lineDataset('Novos clientes', d.novos, COR.novos, ctxNovos),
          ],
        },
        options: baseOpts(false),
      }),
    );
  }
  function updateTheme() {
    const tokens = getComputedStyle(document.body);
    const colors = [1, 2, 3, 4].map((index) =>
      tokens.getPropertyValue('--chart-' + index).trim(),
    );
    const text = tokens.getPropertyValue('--muted').trim();
    Chart.defaults.color = text;
    charts.forEach((chart) => {
      chart.options.color = text;
      chart.options.scales.y.grid.color = tokens
        .getPropertyValue('--chart-grid')
        .trim();
      for (const axis of ['x', 'y'])
        chart.options.scales[axis].ticks.color = text;
      chart.data.datasets.forEach((dataset, index) => {
        const color = colors[chart.canvas.id === 'chartNovos' ? 3 : index];
        dataset.borderColor = color;
        dataset.pointBackgroundColor = color;
        dataset.backgroundColor = fill(chart.ctx, color);
      });
      chart.update('none');
    });
  }
  document.addEventListener('gestor:theme-change', updateTheme);
})();
