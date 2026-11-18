# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fierdauzbussiness-cyber/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fierdauzbussiness-cyber/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — a dashboard that ranks pre-token DeFi protocols by what their token would be worth if the record stood as it is, and shows how to farm each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## The model (radar-2)

Implied value follows only from the sealed snapshot's own figures, through comparables the snapshot itself supplies:

```
implied value = TVL × category multiple × growth × maturity × chains
```

- **Category multiple** — the median market-cap-per-TVL of the snapshot's already-trading protocols in the same category (falling back to the overall live median when a category has fewer than 3 trading protocols). A lending token is worth what the market already pays for lending tokens per dollar of TVL.
- **Growth** — the 7-day TVL change, clamped to −50…+100%, weighted 0.6.
- **Maturity** — how long the protocol has run with no token recorded (0.75–1.0 over 4 years; unknown listing date counts as 1 year).
- **Chains** — a small premium for multichain reach (+3% per extra chain, up to 4).

No protocol name is ever special-cased: one function scores every row. The board ranks all 198 rankable pre-token protocols in the snapshot — the 40-protocol watchlist plus every other pre-token protocol that is not a wrapped, staked or bridged product of a token that already trades (WBTC, staked ETH and USDT0 are Bitcoin, ETH and USDT in another form, not launches of their own). Live-token protocols are kept apart and shown as the market's own values.

## The dashboard

`dashboard/` is a static page with no network and no framework: the ranked board, a per-protocol detail view with the implied-value maths and a six-step farm plan (action, cost, time — derived from the protocol's own category, chain, TVL and age), filters by search / category / chain, sorting, a live-token comparables tab, and a model sandbox that recomputes the ranking live from the same snapshot figures.

## Run it

Node.js 22.18 or later, standard library only. The program reads the sealed snapshot (from the bounty kit's `input/snapshot.json`, or the grader's `/input`) and writes the board, the dashboard data, the dashboard and the dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The entrypoint is `main.ts` at the repository root.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the radar-2 model, the farm plans, the board builder.
- `vendor/makefun-board.ts` — the make.fun dossier library from the bounty kit.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`).
- `screenshots/` — the board, a detail view and a filtered view of the dashboard.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
