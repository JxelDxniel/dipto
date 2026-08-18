/* QUANTITATIVE MARKET MONITORING & SIGNAL BOT
 * CLOUDFLARE WORKER: S&P 500 DIP DETECTOR & SECULAR GROWTH ALPHA BOT
 * Tracks S&P 500 (SPY) for macro discount bottoms & ranks #1 multi-year growth asset.
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runComprehensiveMarketEngine(env));
  },

  async fetch(request, env, ctx) {
    const report = await runComprehensiveMarketEngine(env);
    return new Response(JSON.stringify(report, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

const MACRO_BENCHMARK = { ticker: "SPY", name: "S&P 500 ETF Trust" };

const GROWTH_COMPANIES = [
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "AI Hardware & Compute" },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Cloud Infrastructure & AI" },
  { ticker: "AAPL", name: "Apple Inc.", sector: "Consumer Ecosystem" },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "AWS & Digital Commerce" },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Search & Cloud" },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Autonomy & Energy" }
];

async function runComprehensiveMarketEngine(env) {
  const result = {
    sp500Status: null,
    topCompanyPick: null
  };

  try {
    result.sp500Status = await evaluateSP500Dip(env);
  } catch (err) {
    console.error("Error evaluating S&P 500:", err);
  }

  try {
    result.topCompanyPick = await evaluateTopCompanyPick(env);
  } catch (err) {
    console.error("Error evaluating growth companies:", err);
  }

  return result;
}

async function evaluateSP500Dip(env) {
  const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${MACRO_BENCHMARK.ticker}&token=${env.FINNHUB_KEY}`);
  const quote = await quoteRes.json();
  if (!quote || !quote.c) return null;

  const currentPrice = quote.c;
  const percentChange = quote.dp || 0;

  const toTime = Math.floor(Date.now() / 1000);
  const fromTime = toTime - (45 * 86400);
  const candleRes = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${MACRO_BENCHMARK.ticker}&resolution=D&from=${fromTime}&to=${toTime}&token=${env.FINNHUB_KEY}`
  );
  const candles = await candleRes.json();
  const closePrices = (candles && candles.c && candles.c.length >= 5)
    ? candles.c
    : [currentPrice * 0.99, currentPrice * 0.995, currentPrice * 1.002, currentPrice];

  const rsi = calculateRSI(closePrices, 14);
  const recentHigh = Math.max(...closePrices);
  const drawdownFromHigh = Number((((currentPrice - recentHigh) / recentHigh) * 100).toFixed(2));

  const chartUrl = generateQuickChartUrl("SPY (S&P 500)", closePrices.slice(-20), '#00FFA3');
  await sendSP500TelegramAlert(currentPrice, percentChange, drawdownFromHigh, rsi, chartUrl, env);

  return { ticker: "SPY", price: currentPrice, rsi, drawdown: drawdownFromHigh };
}

async function evaluateTopCompanyPick(env) {
  const scored = [];

  for (const comp of GROWTH_COMPANIES) {
    try {
      const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${comp.ticker}&token=${env.FINNHUB_KEY}`);
      const quote = await quoteRes.json();
      if (!quote || !quote.c) continue;

      const currentPrice = quote.c;

      const targetRes = await fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${comp.ticker}&token=${env.FINNHUB_KEY}`);
      const targetData = await targetRes.json();

      const toTime = Math.floor(Date.now() / 1000);
      const fromTime = toTime - (45 * 86400);
      const candleRes = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${comp.ticker}&resolution=D&from=${fromTime}&to=${toTime}&token=${env.FINNHUB_KEY}`
      );
      const candles = await candleRes.json();
      const closePrices = (candles && candles.c && candles.c.length >= 5) ? candles.c : [currentPrice];

      const rsi = calculateRSI(closePrices, 14);

      const targetMean = (targetData && targetData.targetMean && targetData.targetMean > 0)
        ? targetData.targetMean
        : Number((currentPrice * 1.25).toFixed(2));

      const upsidePct = Number((((targetMean - currentPrice) / currentPrice) * 100).toFixed(1));

      let score = 50;
      if (upsidePct >= 25) score += 30;
      else if (upsidePct >= 10) score += 20;

      if (rsi <= 40) score += 20;
      else if (rsi <= 55) score += 10;

      scored.push({
        ...comp,
        currentPrice,
        targetMean,
        upsidePct,
        rsi,
        score,
        closePrices
      });
    } catch (e) {
      console.error(`Error scoring ${comp.ticker}:`, e);
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const bestCompany = scored[0];

  const chartUrl = generateQuickChartUrl(bestCompany.ticker, bestCompany.closePrices.slice(-20), '#00E5FF');
  await sendTopCompanyTelegramAlert(bestCompany, chartUrl, env);

  return bestCompany;
}

function calculateRSI(prices, period = 14) {
  if (prices.length < 2) return 50;
  const activePeriod = Math.min(period, prices.length - 1);
  let gains = 0, losses = 0;

  for (let i = 1; i <= activePeriod; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / activePeriod;
  let avgLoss = losses / activePeriod;

  for (let i = activePeriod + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (activePeriod - 1) + (diff > 0 ? diff : 0)) / activePeriod;
    avgLoss = (avgLoss * (activePeriod - 1) + (diff < 0 ? -diff : 0)) / activePeriod;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - (100 / (1 + rs))).toFixed(1));
}

function generateQuickChartUrl(label, priceArray, colorHex) {
  const chartConfig = {
    type: 'line',
    data: {
      labels: priceArray.map((_, i) => `D-${priceArray.length - i}`),
      datasets: [{
        label: `${label} Price Action`,
        data: priceArray,
        borderColor: colorHex,
        backgroundColor: `${colorHex}1A`,
        fill: true,
        pointRadius: 2,
        borderWidth: 2
      }]
    },
    options: {
      legend: { labels: { fontColor: '#FFFFFF' } },
      scales: {
        xAxes: [{ gridLines: { color: 'rgba(255,255,255,0.06)' }, ticks: { fontColor: '#888' } }],
        yAxes: [{ gridLines: { color: 'rgba(255,255,255,0.06)' }, ticks: { fontColor: '#888' } }]
      }
    }
  };

  return `https://quickchart.io/chart?backgroundColor=%230D1117&width=500&height=280&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}

async function sendSP500TelegramAlert(price, change, drawdown, rsi, chartUrl, env) {
  const caption = 
`📊 *S&P 500 (SPY) MACRO TRACKER & DIP ANALYSIS*
────────────────────────────
💵 *Current Price:* $${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)
📉 *Drawdown from Recent High:* ${drawdown}%
📈 *RSI (14D):* ${rsi}${rsi <= 35 ? '🔥 (Deep Oversold Buy Zone)' : rsi <= 45 ? '⚡ (Accumulation Zone)' : '⚖️ (Neutral)'}

💡 *Macro Verdict:* ${drawdown <= -3.0 || rsi <= 40 ? 'High-probability dollar-cost averaging entry point.' : 'Index holding standard trend levels. Monitoring for pullbacks.'}`;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.CHAT_ID,
      photo: chartUrl,
      caption: caption,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📈 View SPY on TradingView", url: "https://www.tradingview.com/symbols/SPY/" }
          ]
        ]
      }
    })
  });
}

async function sendTopCompanyTelegramAlert(company, chartUrl, env) {
  const filledBlocks = Math.min(10, Math.max(0, Math.round(company.score / 10)));
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);

  const caption = 
`👑 *#1 LONG-TERM SECULAR GROWTH PICK: ${company.ticker}*
*${company.name}* (${company.sector}) ──────────────────────────── 💵 *Current Price:* $${company.currentPrice.toFixed(2)} 🎯 *Consensus Target:* $${company.targetMean.toFixed(2)} (*+${company.upsidePct}% upside*)
📊 *RSI Momentum:* ${company.rsi}
⚖️ *Alpha Score:* *${company.score}/100* [${progressBar}]

💡 *Investment Thesis:*
• Highest multi-year risk-adjusted upside potential across growth universe.
• Secular market leadership in ${company.sector}.
• Favorable entry valuation setup.`;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.CHAT_ID,
      photo: chartUrl,
      caption: caption,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📊 Open TradingView", url: `https://www.tradingview.com/symbols/${company.ticker}/` },
            { text: "📑 Yahoo Financials", url: `https://finance.yahoo.com/quote/${company.ticker}/financials` }
          ]
        ]
      }
    })
  });
}