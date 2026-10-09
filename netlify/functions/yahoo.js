// Fetches Yahoo Finance chart data on the server so the browser doesn't hit Yahoo's CORS block.
// Called by the page like: /.netlify/functions/yahoo?symbols=AAPL,MSFT&range=5d
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const syms = (q.symbols || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z0-9.\-^]{1,10}$/.test(s))
    .slice(0, 12);
  const range = ['5d', '6mo'].includes(q.range) ? q.range : '5d';
  const out = {};

  await Promise.all(syms.map(async (s) => {
    const ysym = s.replace('.', '-'); // Yahoo uses "-" for share classes, e.g. BRK-B
    const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    for (const host of hosts) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ysym)}?range=${range}&interval=1d&includePrePost=false`;
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
        if (!r.ok) { out[s] = { error: 'HTTP ' + r.status }; continue; }
        const j = await r.json();
        const res = j.chart && j.chart.result && j.chart.result[0];
        if (!res) { out[s] = { error: 'no data' }; continue; }
        const m = res.meta || {};
        out[s] = {
          meta: {
            regularMarketPrice: m.regularMarketPrice,
            regularMarketTime: m.regularMarketTime,
            gmtoffset: m.gmtoffset,
            chartPreviousClose: m.chartPreviousClose
          },
          t: res.timestamp || [],
          c: ((res.indicators && res.indicators.quote && res.indicators.quote[0]) || {}).close || []
        };
        return;
      } catch (e) {
        out[s] = { error: String(e.message || e) };
      }
    }
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20' },
    body: JSON.stringify(out)
  };
};
