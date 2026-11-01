# Kryptax — U.S.A. rules used by the v1 module

Checked on 2026-11-01. Kryptax is not tax advice: it gives an estimate that you must check yourself.
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

- Tax year selector: sales are grouped by the year of the sale date, income by the year received (default: the latest year; "All years" also available). The year follows the tax dates chosen with the time zone selector (see Time zones, v1.8); near midnight on Dec 31, to verify.
- Short / long term totals, number of sales, and the PDF and CSV buttons right below the totals. The PDF and CSV follow the selected year.

## To be verified (not coded in v1)

- **Wash sales.** Section 1091 is written for "stock or securities". Bill H.R. 9172 (Applying Existing Tax Anti-Abuse Rules to Digital Assets Act) was introduced on June 8, 2026 and referred to the House Committee on Ways and Means; its latest action is dated June 8, 2026, and as of November 1, 2026 it is still at the "introduced" stage, with no vote. Its text would replace "stock or securities" with "specified assets" in section 1091 (digital assets, excluding qualified USD stablecoins). Sources: https://www.congress.gov/bill/119th-congress/house-bill/9172 and https://www.congress.gov/bill/119th-congress/house-bill/9172/text. Kryptax does not apply it; check the current law.
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

## Capital loss carryover entry (v2.4)

Source: IRS, Instructions for Schedule D (Form 1040) (2025), "Capital Loss Carryover Worksheet—Lines 6 and 14" (irs.gov/instructions/i1040sd, checked 2026-11-01): worksheet line 8 goes to Schedule D line 6 (short term) and worksheet line 13 to line 14 (long term).

- Optional: the user types the two amounts from their own worksheet. Kryptax does not fill the worksheet (it needs last year's Form 1040 and Schedule D).
- Kryptax shows the net short-term and long-term amounts for this file plus the carryover. These equal Schedule D lines 7 and 15 only if there are no other capital items — to verify.
- Shown on screen, and in the CSV and PDF only when entered.
- Not done: the capital loss limit of Schedule D line 21, any tax rate or tax computation, wash sales.

## Schedule D draft (v2.5)

Sources: Schedule D (Form 1040) 2025 (irs.gov/pub/irs-pdf/f1040sd.pdf) and Instructions for Schedule D (Form 1040) 2025 (irs.gov/instructions/i1040sd), checked 2026-11-01.

Filled (plain sums of Kryptax data, "Draft to verify — not tax advice"):
- 1b / 2 / 3: Form 8949 Part I totals with box G / H / I (the box chosen in the selector). 8b / 9 / 10: Part II totals with box J / K / L. Box not chosen: totals shown on "1b / 2 / 3" and "8b / 9 / 10", to verify.
- 6 and 14: carryover typed by the user, shown in parentheses (negative).
- 7: combine lines 1a-6; 15: combine lines 8a-14 (column h). Only Kryptax items — to verify.
- 16: combine lines 7 and 15. Gain → Form 1040 line 7a; loss → skip 17-20, go to 21; zero → skip 17-21 (as printed on the form).
- 17: "Are lines 15 and 16 both gains?" answered Yes/No when line 16 is a gain.

Not computed by Kryptax (shown greyed):
- 1a / 8a (Exception 1 — all sales are listed on Form 8949 instead), 4, 5, 11, 12, 13 (other forms, K-1, distributions).
- 18, 19 (worksheets), 20 and 22 (tax worksheets), 21 (loss limit depends on filing status).

Shown on screen, in the CSV (section) and in the PDF (separate last page).

## v2.6 — CSV summary and Excel (.xlsx) export

- The CSV follows the PDF: title, tax year, time zones, lot method, Form 8949 situation, then sections separated by a blank line: Form 8949 Part I, Part II (each with a TOTAL row and its Schedule D line), lines to verify (grouped, not in the totals), Schedule D (draft), Form 1099-DA comparison and capital loss carryover (only when entered), final note.
- Every row has the same number of columns; amounts are always in the same columns ((d), (e), (g), (h)), so a spreadsheet opens it cleanly. Downloaded with a UTF-8 BOM.
- "Download Excel (.xlsx)" uses the SheetJS build already shipped (xlsx.mini.min.js, Community edition) — no external resource. Sheet "Summary" = same layout as the CSV, with column widths and amounts as numbers in `$#,##0.00` format; sheet "Form 8949 data" = one flat table (Part, Box, columns (a)–(h), status).
- Limit: the Community edition does not write bold text or colours, so the .xlsx has no bold headers or coloured rows.
- File names: kryptax-us-summary.csv / kryptax-us-summary.xlsx.

## v2.7 — Review fixes

- Dates ending with an explicit UTC marker (`2025-01-10 14:00:00 UTC`, `GMT`, `Z`, `+00:00`, `+0000`) are accepted and read as UTC instead of "unreadable date". Other offsets are not converted (unreadable, to verify). Keep "Time zone of your file" on UTC for such files.
- Total / fee convention (unchanged, now stated in the import help): **Total (USD) = amount before fee**. Buy: cost basis = Total + Fee (fees are part of basis, i8949 "Basis and Recordkeeping"). Sell: proceeds = Total − Fee. If your file's Total already includes the fee, leave Fee empty to avoid counting it twice. Without Total, Total = Price × Quantity. Covered by tests.

## v2.8 — Network fees on transfers (option, tax treatment to verify)

No IRS source was verified for crypto network fees paid in the transferred asset on a transfer between the user's own wallets. Everything below is an **option** for the user, not a rule: to verify.

### Audit (before v2.8): where cost basis left without a gain/loss or a carryover
1. Paired Send/Receive: the sent quantity is taken from the lots, only the received quantity moves; the basis of the difference (network fee units) disappeared, with only a note. A Fee in USD was only noted.
2. Paired transfer moving more units than the sending wallet holds: destination lot without basis ("to verify"); no known basis lost.
3. One-line Transfer with To Wallet: the full Quantity moved, Received Quantity ignored (destination overstated when Received < Quantity); Fee in USD only noted.
4. Unpaired Send / Transfer without To Wallet (gift, payment, own wallet?): the whole basis leaves, no gain computed (note "to verify"). Not covered by the option; now counted as "removedUnpaired".
5. Unpaired Receive: lot without basis ("to verify").
6. Sale with missing units: lines "to verify"; no known basis lost.
Buy fee (added to cost) and Sell fee (deducted from proceeds) do not lose basis.

### What is coded
- Option "Network fees on transfers" (U.S.A. mode only, next to the lot method): IGNORE (default), DISPOSE, CAPITALIZE. Shown in the CSV/XLSX/PDF headers and a "Network fees" summary line.
- Fee units = sent quantity minus received quantity (paired Send/Receive; one-line Transfer with Received Quantity below Quantity). The pieces are taken in lot-method order: moved units first, fee units last (MANUAL: transfers follow FIFO, as before).
- Fee USD value: only from the file — the Fee (USD) column, otherwise the line Total pro rata to the fee units. Missing: "to verify", out of the totals, never 0.
- A Fee in USD without fee units (sent = received): reported, not computed.
- IGNORE: results unchanged from v2.7 (except a one-line Transfer with Received Quantity below Quantity, now moving only the received units); the removed basis is shown.
- DISPOSE: one Form 8949 line per fee lot piece, "network fee (to verify)", proceeds = fee USD value, basis from the actual lot, short/long by holding period.
- CAPITALIZE: the basis of the fee units is added to the received units pro rata (finite-cost lots only), acquisition dates kept, no Form 8949 line. If no received lot has a known basis, the amount is counted as removed.
- Ledger in the result: basis in = sold + remaining + removed (fees) + removed (unpaired sends); capitalized basis is part of "remaining".

### Still to verify (not decided here)
- Which treatment applies (ignore, disposal, added to basis), and whether a fee on a self-transfer can be a disposal.
- Holding period of capitalized fee basis.
- Fees paid in another asset than the one transferred (not handled).
- Unpaired sends (gift, payment) and unpaired receives.

## v2.9 — Capital loss limit (Schedule D line 21)
- Source: IRS Topic no. 409, Capital gains and losses — https://www.irs.gov/taxtopics/tc409 (checked 2026-11-01): if capital losses exceed capital gains, the loss you can claim is the lesser of $3,000 ($1,500 if married filing separately) or the total net loss on Schedule D line 16; the rest can be carried forward (Capital Loss Carryover Worksheet, Publication 550 or Instructions for Schedule D).
- Coded: a filing status select (not chosen / $3,000 statuses / married filing separately $1,500). When line 16 is a loss, line 21 = the smaller of the loss or the limit, and the amount left to carry over is shown. Status not chosen: line 21 "to verify", no amount. Line 16 not a loss: line 21 skipped. Shown on screen, in the CSV/XLSX header and Schedule D section, and in the PDF summary.
- Always "to verify": Kryptax only sees the sales in this file (other capital gains or losses change line 16). The carryover worksheet itself is not computed.

## v2.10 — Possible wash sales (flag only)
- No calculation changed: rows, totals, notes and Schedule D are the same with or without the flag.
- Flag: a sale line with a loss (network fee lines excluded) and an acquisition of the same asset (Buy, or the asset received in an exchange) dated within 30 days before or after the sale date. The lot sold itself (same acquisition date as a loss part of the sale) is not counted. Shown in the "to verify" list on screen, in a CSV/XLSX section and in the PDF summary.
- To verify: whether the wash sale rule applies to these digital assets for the tax year (no irs.gov text checked here), what "substantially identical" means for them, and acquisitions outside this file (other platforms, spouse, retirement accounts).

## New import formats and Form 1099-DA import (checked 2026-11-01) — not coded
- No new platform format added: no other official help page documenting the export columns with a USD value per row was found. Bitstamp transaction export: columns only described by third-party sites, not on an official page. Crypto.com Exchange: the official help page explains the download, not the columns. Coinbase, Gemini, Kraken Ledgers: unchanged (see v2.0). A format will be added only from an official column description or a real anonymised export.
- Form 1099-DA file import: not coded. No official file layout for the copy a customer downloads was verified; headers are not guessed. The 1099-DA comparison (boxes 1f and 1g typed by the user, v2.1) remains the way to use it — to verify.

## v2.10 — Schedule D "Other gains" line
- Lines 4, 5 (Part I) and 11, 12, 13 (Part II) — numbers checked on Schedule D (Form 1040) 2025, https://www.irs.gov/pub/irs-pdf/f1040sd.pdf (2026-11-01) — are shown as one line "Other gains (Forms 4797, 2439, 6252, 4684, 6781, 8824, Schedule K-1, capital gain distributions): not computed by Kryptax - leave blank if you only have crypto". Same on screen, CSV, Excel and PDF. No calculation or total changed.

## v2.11 — Export file names
- U.S.A. exports (PDF, CSV, Excel, income CSV) keep their prefix and add the browser's local date and time with seconds, e.g. `kryptax-us-summary_2026-11-01_10-15-32.pdf`, so two exports never share a name. FRANCE mode unchanged. (Replaced in v2.15: to the minute.)

## v2.12 — Guided result and single "to verify" list (v=20261101s)

- **What to copy and where** (top of the U.S. result, selected year): for each Form 8949 Part with sales, the box (G/H/I or J/K/L, from the Options at the top) with totals (d), (e), (h) and the Schedule D line (1b/2/3 or 8b/9/10); then Schedule D lines 7, 15, 16, and line 21 when line 16 is a loss and the filing status is chosen; staking / airdrop / interest income as ordinary income (no tax computed, where to report: to verify). Box not chosen: said, with a link to the Options. Amounts come from `form8949`, `scheduleD` and the income total; nothing new is computed (`guide()`).
- **To verify (N)**: one deduplicated list (`checks()`), sorted by importance: 1 lines not in the totals (missing cost, value, holding period; income without USD value), 2 Form 8949 box / filing status not chosen, 3 possible wash sales, transfer and network-fee notes, USD fees without quantity, 4 costs entered by you, 5 HIFO/manual records. Same list in the CSV/Excel (section `TO VERIFY (N)`, replaces the separate wash-sale section, detail lines below it) and in the PDF (list `To verify (N)` above the details table).
- The detailed Form 8949 table stays below, in a foldable block (open by default).

## v2.13 — Wash sale wording (v=20261101t)

- Trigger and amounts unchanged (flag only, nothing applied in the totals).
- New text (screen list "To verify (N)", CSV/Excel section `TO VERIFY (N)`, PDF list): *Possible wash sale pattern, line N: ASSET sold at a loss ($X) and the same asset bought within 30 days before or after (line M). 26 U.S.C. section 1091 applies to stock or securities; no verified IRS rule extends it to regular crypto assets, and a token that is legally a security could be covered. Not applied in the totals — to verify.*
- Legal text checked: 26 U.S.C. §1091(a) covers losses on "shares of stock or securities" with a 30-day window before and after the sale and the acquisition of "substantially identical" stock or securities; it neither names nor excludes crypto assets.
  - https://uscode.house.gov/us/usc/119-120/t26/s1091/
  - https://www.law.cornell.edu/uscode/text/26/1091
- No IRS guidance on crypto wash sales has been read: none is cited (to verify).

## v2.14 — Highlights (v=20261101u)

- Screen: the "What to copy and where" block has a thin cyan border and a wide layered glow: cyan (accent #22d3ee), then gold, then orange outside (`box-shadow`, three layers). The summary box below is unchanged. The same rule (class `halo`) is used on the main France result box (« Total global plus-value nette … Prélèvement estimé »), v=20261101v.
- PDF: only the amounts to copy are coloured dark amber #A16207 (RGB 161, 98, 7): Form 8949 Part totals (d), (e), (h) and Schedule D lines 7, 15, 16 and 21 (when computed). Text stays black; amounts unchanged. CSV/Excel unchanged.

## v2.15 — Saved option choices and export names (v=20261101w)
- **Saved option choices**: lot method (FIFO/HIFO/MANUAL), Form 8949 box, network fee option (IGNORE/DISPOSE/CAPITALIZE) filing status and the time zone of the file dates (the U.S.A. method/option selectors) are kept in this browser's localStorage (one key, `kryptax.us.settings`) and restored on the next visit. The region (FRANCE/U.S.A.) was already kept (`kx-region`). Not saved because they depend on the file: the year, the manual lot picks per sale (MANUAL), the costs, Form 1099-DA totals and carryover amounts entered. A time zone found in the file still takes priority for that file. Never saved: file data, transactions, amounts. Storage unavailable or value invalid: defaults are used, without error. Link "Reset saved settings" under the Options; "Reset everything" also clears them. Same totals whether a choice comes from the saved value or a click. FRANCE mode: no equivalent setting to save (date/number formats and year are per file), unchanged.
- **Export names** (PDF, CSV, Excel, income CSV): `prefix_YYYY-MM-DD_HH-MM.ext`, local time, to the minute, like the FRANCE mode. If the same name was already given in this session (two exports in the same minute), and only then, a short suffix is added: `_2`, `_3`…
- **Comparison block (FRANCE, v=20261101x)**: "🔎 Comparer avec un autre calcul (facultatif)" is back under the results (visible from v=20261101y, outside the hidden detail), worded neutrally (no tool named): yearly totals from any other calculation, typed or imported as CSV `année;prix de cession;plus-value`, shown next to the Kryptax totals with the difference. Display only, no calculation changed.
