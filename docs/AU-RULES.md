# Kryptax Australia (beta) — rules, sources and limits

Status: **beta** (v2.55, Nov 2026). Estimate for an **Australian resident individual investor** holding crypto as an investment. Not for traders, businesses, companies, trusts or SMSFs. No income tax, Medicare levy or tax-rate computation. Output is a CGT summary, **not an ATO form and not a lodgment**. Sources checked on 8 Nov 2026 (Europe/Paris); re-check them before each income year.

## Sources
| Topic | Source |
|---|---|
| CGT events: sale, swap crypto-to-crypto, crypto spent (incl. fees), gifts; own-wallet transfers are not disposals | ATO, *Transactions – acquiring and disposing of crypto assets*: https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/transactions-acquiring-and-disposing-of-crypto-assets |
| Working out and reporting CGT on crypto, record of parcels | ATO, *How to work out and report CGT on crypto*: https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/how-to-work-out-and-report-cgt-on-crypto |
| 50% discount: held at least 12 months excluding the days of acquisition and of the CGT event; residents | ATO, *CGT discount*: https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount |
| Net capital gain method: current-year losses, then prior-year net capital losses, then discount | ITAA 1997 s 102-5 (method statement), Div 115: https://www.legislation.gov.au/C2004A05138/latest/text ; ATO myTax 2026 capital gains instructions |
| Staking rewards = ordinary income at market value when received, cost base = that value; airdrops depend on facts | ATO, *Staking rewards and airdrops*: https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/transactions-acquiring-and-disposing-of-crypto-assets/staking-rewards-and-airdrops ; draft ruling TR 2026/D1 (draft, not final) |
| Wash sales: no automatic 30-day rule, the Commissioner can deny losses (Part IVA) | TR 2008/1 |
| Personal use asset exemption: crypto held as an investment is not a personal use asset | ATO crypto guidance (personal use assets) |
| Exchange rates: RBA daily rates (A$1 = x); any reasonable, consistently used external rate for others | ATO crypto transactions page; RBA table F11.1 https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv |
| CGT reform from 1 July 2027 (cost-base indexation replaces the 50% discount, 30% minimum tax, transitional deemed disposal at 30 June 2027) | Treasury Laws Amendment (Tax Reform No. 1) Act 2026, **Act No. 49 of 2026** (law); ATO page on the CGT changes (updated 13 Oct 2026). |

## Status of the law per income year
| Income year | Status in Kryptax |
|---|---|
| up to 2024-25, 2025-26, 2026-27 | Current rules (50% discount for residents, 12 months). Computed. |
| **2027-28 and later** | **Blocked**: CGT events from 1 July 2027 fall under Act No. 49 of 2026. Indexation, the 30% minimum and the transitional rules are **not coded**; the old discount is **not** applied automatically. |

## What is implemented
- Income year 1 July – 30 June, labelled `2025-26`. The day of each event is taken in the selected **Australian tax zone** (Sydney/Melbourne, Brisbane, Adelaide, Darwin, Perth, Hobart, Lord Howe: DST and half-hour offsets via `Intl`), from an explicit file time zone (or the offset written in the file, e.g. Binance `UTC+1`). Never the machine's zone. Changing a zone clears the results and requires confirming the imports again (recomputed from the raw lines). Date-only rows are never shifted. Excel dates are read as serial numbers.
- Parcels matched **FIFO per token across all files** (conservative default). Specific identification is accepted by the ATO only with records proving which units were sold: not computed, flagged.
- Each sale, swap and fee paid in crypto is a separate CGT event. A fee paid in another token (e.g. BNB) becomes a separate disposal whose AUD value is unknown: **to verify, outside the totals**.
- Swap: disposal at the AUD value of the row; the new parcel's cost base = that value.
- Own transfers (Send/Receive/Transfer): no CGT event; parcels keep date and cost base.
- Unknown cost base (missing history, reward/airdrop without value, stablecoin-valued row): **excluded and listed to verify, never 0**.
- Losses: current-year losses first against gains not eligible for the discount, then the rest; then prior-year net capital losses (amount typed by the user) in the same order; then the 50% discount **only if the user confirms residency for the whole period**. Leftover losses are shown as carried forward.
- 12 months: eligible when the event day ≥ the day after the anniversary; anniversary of 29 Feb = 1 March (conservative).
- Staking/mining/interest rewards: ordinary income, shown separately, cost base = value when known.
- Airdrops: listed to review; cost base = value only if given in the file; never invented, never 0.
- Possible wash sale: loss with an acquisition of the same token within 30 days is **flagged only** (loss kept).
- Exchange rates: (1) the RBA F11.1 CSV imported by the user (official; read locally; rate of the event day or the previous published day, up to 7 days back for weekends/holidays; A$ = amount / rate); (2) otherwise ECB reference rates via Frankfurter (`api.frankfurter.dev`, already in the CSP), labelled **not RBA, to verify**. The RBA endpoint sends no CORS header (checked with curl), so it cannot be fetched from the page: no new CSP origin. Stablecoins (USDT, USDC…) are **never** treated as USD. A bare `$` header is rejected as ambiguous.
- No crypto price API on this page: a missing market value stays missing (to verify).
- Exports: CSV and PDF, file name `kryptax-australia-<income year>_<date>_<time>`; gross gains, losses, discount, income and net separately; rate sources, method and limits. CSV cells starting with `= + - @` are neutralised.

## Open points / to verify
- Residency, part-year residency, temporary/foreign residents (discount not applied, no apportionment).
- Personal use asset exemption (A$10,000): never applied automatically.
- Airdrops: final ruling (TR 2026/D1 is a draft).
- Lost or stolen crypto, DeFi, wrapping, lending, liquidity pools, NFTs, gifts received, inheritance: not handled.
- Trader/business classification: not handled.
- Specific identification of parcels: not handled.
- 2027-28: transitional deemed disposal at 30 June 2027 and indexation: not handled (blocked).
- Prior-year net capital losses: typed by the user, not checked.
