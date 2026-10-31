# Kryptax — U.S.A. rules used by the v1 module

Checked on 2026-10-31. Kryptax is not tax advice: it gives an estimate that you must check yourself.
State taxes are not included.

## Sources (irs.gov)

- Instructions for Form 8949 (2025): https://www.irs.gov/instructions/i8949
- IRS Virtual Currency FAQs: https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions
  (the IRS says they apply to transactions before Jan. 1, 2025; the same principles are restated in the i8949 "Digital Assets" section)
- Notice 2026-20: https://www.irs.gov/pub/irs-drop/n-26-20.pdf
- Rev. Proc. 2024-28: https://www.irs.gov/pub/irs-drop/rp-24-28.pdf
- Rev. Rul. 2023-14 (staking): https://www.irs.gov/pub/irs-drop/rr-23-14.pdf
- FAQ Q23–Q25 and Rev. Rul. 2019-24 (airdrop after a hard fork)

## Confirmed and coded in v1

| Rule | Source |
| --- | --- |
| Digital assets are property; selling them, or exchanging them for another digital asset, is a taxable disposal. | FAQ Q4, Q16–Q17; i8949 "Digital Assets", Example 5 |
| Basis = cost including fees, commissions and other acquisition costs. | FAQ Q8; i8949 "Basis and Recordkeeping" |
| Without a Form 1099-DA, column (d) = net proceeds (gross minus selling expenses). | i8949 "Column (d)" |
| The basis of an asset received in an exchange = its fair market value. | FAQ Q18, Q21 |
| Holding period starts the day after acquisition and includes the disposal day. 1 year or less = short term (Part I). More than 1 year = long term (Part II). | FAQ Q6; i8949 "Short-Term or Long-Term" |
| FIFO when units are not specifically identified. | FAQ Q41; Treas. Reg. 1.1012-1(j)(3)(i), quoted in Notice 2026-20 |
| Columns (a) description with units, (b) date acquired, (c) date sold, (d) proceeds, (e) basis, (h) gain or loss. | i8949 "Column (a)" to "Column (h)" |
| Digital assets use boxes G/H/I (short) and J/K/L (long), not C/F. Without a 1099-DA: box I or box L. | i8949 2025 "What's New", "Box C or Box I", "Box F or Box L" |
| Several wallets (v1.2): for acquisitions and dispositions on or after January 1, 2025, the specific identification or FIFO rules apply to the units held in a single wallet or account (wallet-by-wallet, not a "universal" multi-wallet approach). Kryptax runs FIFO separately in each wallet. | Rev. Proc. 2024-28, sections 1-2 (Treas. Reg. 1.1012-1(j)) |
| Income (v1.4): staking rewards are included in gross income at their fair market value in the year the taxpayer gains dominion and control; the value is determined at that date and time. | Rev. Rul. 2023-14 (https://www.irs.gov/pub/irs-drop/rr-23-14.pdf) |
| Airdrop after a hard fork: ordinary income equal to the fair market value when received; the basis is that amount of income. | FAQ Q24-Q25 (https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions) |
| Lot methods (v1.3): if units are not adequately identified, they are treated as sold first in, first out (FIFO). An adequate identification is made no later than the date and time of the sale; a standing order such as highest basis first is treated as an identification. | Treas. Reg. 1.1012-1(j)(3)(i)-(ii), as summarized in Notice 2026-20, section 2 (https://www.irs.gov/pub/irs-drop/n-26-20.pdf) |
| Notice 2026-20 extends the temporary relief of Notice 2025-7 for making an adequate identification: relief period January 1, 2025 to December 31, 2026. | Notice 2026-20, sections 1 and 3.03 |
| A transfer between your own wallets or accounts is not taxable. | FAQ Q38 |
| Rewards: staking rewards are income at their USD fair market value when you gain control of them, and that value becomes your basis. | Rev. Rul. 2023-14; FAQ Q24–Q25 |

## Import (v1.1)

- CSV, Excel (.xlsx/.xls, read with the SheetJS shipped with the app) and PDF.
- PDF import is **best effort, to verify**. Text is read in the browser with the same pdf.js (`isEvalSupported: false`), and only lines like `MM/DD/YYYY Type ASSET quantity $total [$fee] [-> qty ASSET]` are used. If no line matches, nothing is computed.

## PDF summary (v1.5)

`us-export.js` builds a PDF with jsPDF (already shipped; `export.js` is not used): title, generation date (UTC), lot method, wallets, short / long / total, income total if any, then all Form 8949-style lines on as many pages as needed. Lines "to verify" are highlighted and marked "TO VERIFY". Every page has the footer "Estimate - not tax advice - to be verified - state taxes not included". The box letter (G/H/I short term, J/K/L long term; I or L without a Form 1099-DA, see i8949 above) is printed only as an indication, to verify (Form 1099-DA not read).

## Time zones (v1.8)

- Holding period: "start counting on the day following the day you acquired the property. The day you disposed of the property is part of your holding period." Example: bought June 17, 2024; sold June 17, 2025 = not longer than 1 year; sold June 19, 2025 = longer than 1 year (Pub. 544, "Holding period", https://www.irs.gov/publications/p544). Kryptax treats a sale the day after the anniversary (June 18, 2025 in this example) as long term; the example does not cover that day: to verify.
- These are calendar days. Kryptax reads the file times in the zone you choose ("Time zone of your file": this browser's zone by default, UTC, or a U.S. zone) and computes dates, tax year and short/long term on calendar days in this browser's time zone (Intl, no network). Which zone applies to you (for example your residence): to verify. Daylight saving time is handled by the browser's time zone data.
- The two zones are shown on the result screen, in the CSV (first line) and in the PDF.

## Title (v1.7)

"Form 8949 & Schedule D for U.S. crypto taxes": i8949 "Purpose of Form" (use Form 8949 to report sales and exchanges of capital assets, including digital assets reported on Form 1099-DA) and "Schedule D" (use Schedule D to figure the overall gain or loss from transactions reported on Form 8949). The Form 1040 digital asset question is not mentioned (not checked).

## Result screen (v1.6)

- Tax year selector: sales are grouped by the year of the sale date, income by the year received (default: the latest year; "All years" also available). Dates are read in UTC, like the rest of the module; if your local date differs near midnight on Dec 31, to verify.
- Short / long term totals, number of sales, and the PDF and CSV buttons right below the totals. The PDF and CSV follow the selected year.

## To be verified (not coded in v1)

- **Wash sales.** Section 1091 is written for "stock or securities". Bill H.R. 9172 (introduced June 8, 2026) would extend it to digital assets, but it was still only introduced in October 2026. Kryptax does not apply it; check the current law.
- **Transfers between your own wallets.** Kryptax pairs a send with a receive of the same asset, within 3 days, with 98–100% of the quantity received. The received units keep their original acquisition date and cost. This follows from the transfer not being taxable (FAQ Q38); it is not an explicit IRS text, so it is to verify. Network fees on transfers (units not received, or a fee) are flagged and not counted as a sale; their tax treatment is to verify. An unpaired send or receive is always listed "to verify". An unpaired send removes the units with no gain computed; an unpaired receive adds a lot with an unknown cost.
- **Before 2025.** Kryptax applies wallet-by-wallet tracking to all dates. Before 2025, a universal (multi-wallet) approach was possible, and Rev. Proc. 2024-28 gives a safe harbor to allocate unused basis to wallets as of January 1, 2025. Kryptax does not do this allocation: to verify.
- **Income in Kryptax.** Types read: Staking, Reward, Airdrop, Interest, Income (also Earn, Mining, Learn). Kryptax shows the USD value given in the file as ordinary income and uses it as the cost of the new lot. It does not check that this is the value at the date and time of control, applies no tax rate and computes no tax. A missing USD value is "to verify" and left out of the total (never $0). Interest, "learn" rewards and airdrops not linked to a hard fork are not covered by the texts above: to verify. Where the income goes on the return: to verify.
- **Lot methods in Kryptax.** FIFO (default), HIFO (highest unit cost first) or a manual lot choice per sale (the rest of the sale uses FIFO; not enough units in the chosen lot → "to verify"). Kryptax cannot check that the identification was made and recorded at the time of sale, or communicated to a custodial broker: to verify. The exact conditions of the Notice 2026-20 relief (who is eligible, how to record it) and what applies after December 31, 2026 (default rules unless extended): to verify. Transfers between wallets use the selected method (FIFO or HIFO); this is a Kryptax choice, to verify.
- **Specific identification and several wallets.** The rules are Treas. Reg. 1.1012-1(j), Rev. Proc. 2024-28 (wallet-by-wallet basis from Jan. 1, 2025) and Notice 2026-20 (books-and-records identification for broker-held units, through Dec. 31, 2026). Kryptax applies them per wallet (v1.2) with the lot methods above (v1.3).
- **Form 1099-DA.** If you received one, use its proceeds and basis, plus adjustments in columns (f) and (g) (codes B, E, and so on). v1 does not read 1099-DA, so the box letter is only a hint.
- **Fees on crypto-to-crypto exchanges.** These are digital asset transaction costs (Treas. Reg. 1.1001-7). v1 subtracts them from proceeds; check the exact allocation.
- **Leap days.** For an acquisition on Feb 29, the anniversary is computed as Mar 1.
- **Other limits.** Capital loss limits, carryovers, tax rates, NIIT and state taxes are not computed.

## Missing purchases entered by the user (v1.9)

When a sale needs more units than the purchases in the file, the extra units are flagged « to verify: no purchase found » and left out of the totals. The result offers an optional form, one line per such sale: total cost in USD and date acquired. When both are filled (and the date is not after the sale), the units are included with that cost, the term is computed with the same holding-period rule (Pub. 544), and the line is marked « entered by you (to verify) » in the result, the CSV and the PDF. Without input, nothing changes. The user remains responsible for these values (to verify against their records).

## Platform export formats (v2.0)

Recognised automatically only when the header matches a structure published on the platform's own help pages; any other file goes through the generic import (Date, Type, Asset, Quantity, Total or Price, Fee).

- **Kraken — Trades export** (support.kraken.com, "How to interpret Trades history fields", checked 2026-11-01): `txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers`. `time` is UTC (the time zone selector is set to UTC); `cost` is in the quote currency and excludes fees; `fee` is in the quote currency. Only USD-quoted pairs (e.g. XXBTZUSD, SOLUSD) and non-margin trades are read; other rows are skipped and listed (to verify). Kraken asset codes XXBT/XBT → BTC, XXDG/XDG → DOGE, other 4-letter X-codes in Z-quoted pairs drop the leading X (to verify for unusual assets).

Not added (structure not verifiable on the platform's official help pages, or no USD value per row):
- Coinbase transaction history CSV: the official help page explains how to download statements but does not document the columns.
- Gemini transaction history (.xlsx): the official help page explains the download only.
- Kraken Ledgers export: documented officially, but rows carry amounts in the asset only, with no USD value, so a cost basis cannot be computed from it alone.

## Form 1099-DA comparison (v2.1)

Source: IRS, Instructions for Form 1099-DA (irs.gov/instructions/i1099da, checked 2026-11-01).

- Box 1f = gross proceeds, reduced by transaction costs. Kryptax proceeds are also net of fees, so the two are compared.
- Box 1g = cost or other basis. Brokers must report it only for covered securities (digital assets acquired after 2025 and kept in the same custodial account). It may be blank otherwise.
- Rewards and staking payments are not reported on Form 1099-DA.
- The user types the box 1f and box 1g totals for the year. Kryptax shows its own totals (sales marked to verify excluded) and the difference. Any difference of $0.01 or more is flagged "to verify". No tax is computed.
- Not done: per-transaction matching, import of the 1099-DA file, box 2 / box 9 / 8949 checkbox codes (G, H, J, K, Y) logic, wash sales.

## Form 8949 layout (v2.2)

Sources: IRS, Instructions for Form 8949 (2025), irs.gov/instructions/i8949, and Schedule D (Form 1040) 2025, irs.gov/pub/irs-pdf/f1040sd.pdf (both checked 2026-11-01).

- Columns (a) to (h) as on the form. Column (a) for a digital asset: name or symbol and exact units.
- Part I = short term (held 1 year or less), Part II = long term (more than 1 year).
- Digital assets never use boxes A to F ("Do not use box C / box F to report digital asset transactions"). They use:
  - G (Part I) / J (Part II): Form 1099-DA showing basis reported to the IRS.
  - H / K: Form 1099-DA without basis, or basis not reported to the IRS.
  - I / L: no Form 1099-DA.
- The user picks the situation in a small selector. If not chosen, the box shows "to verify". One choice applies to all sales; if only some sales are on a Form 1099-DA, each kind needs its own Part (to verify).
- Part totals go to Schedule D: G → line 1b, H → line 2, I → line 3, J → line 8b, K → line 9, L → line 10.
- Columns (f) and (g) are left blank (no adjustment computed). With a Form 1099-DA, column (d) and (e) should match the form and corrections go in (f)/(g) — to verify.
- Exception 1 (reporting directly on Schedule D lines 1a/8a) is not handled.
- Lines to verify (missing cost or value) are listed apart and are not in the Part totals.

## Form 1099-DA comparison in the exports (v2.3)

- When the user typed a box 1f and/or box 1g total, the CSV gets a "Form 1099-DA comparison" section and the PDF summary gets one line per entered box: Form 1099-DA amount, Kryptax amount, difference, "to verify" or "matches", plus the same caveats as on screen.
- Nothing is added when nothing was entered. Same IRS source as v2.1.
