# Dipto

A simple, serverless market monitoring bot built on **Cloudflare Workers** that helps spot good times to buy stocks and ETFs.

Dipto runs every 5 minutes in the background. It watches the **S&P 500** for market pullbacks using the **14-day RSI** and **drawdown from recent highs**, checks top growth stocks against price targets, and sends quick chart alerts straight to **Telegram**.

Created this so that I dont have to constantly track the stock market and have a bit of assistance where possible.

---

## Pros & Cons

### Pros
* **Completely Serverless**: Runs for free on Cloudflare Workers without needing a dedicated server.
* **Runs Automatically**: Uses cron triggers to wake up and check prices 24/7.
* **Quick Alerts**: Sends chart snapshots and buy signals directly to Telegram.
* **Smart Scoring**: Combines RSI, price drop percentage, and analyst targets into a simple score out of 100.

JUST SENDS ALERTS, DOES NOT ACTUALLY PLACE TRADES.

---

## Features

* **S&P 500 Dip Tracker**: Checks if SPY is oversold or in a pullback.
* **Growth Stock Ranking**: Scores popular stocks (like NVDA, MSFT, AAPL, AMZN, GOOGL, TSLA) to find the best potential setup.
* **Telegram Charts**: Uses QuickChart to generate clean price action graphs in the message.
* **Manual & Auto Modes**: Runs on a 5-minute schedule or manually by visiting the worker URL.

---

## Tech Stack

* **Cloudflare Workers** (Backend runtime)
* **Finnhub API** (Stock data & price targets)
* **QuickChart.io** (Chart generation)
* **Telegram Bot API** (Alerts and messages)
* **Wrangler** (Deployment tool)

---

## Setup & Deployment

1. **Clone the repo**:
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/dipto.git
   cd dipto
