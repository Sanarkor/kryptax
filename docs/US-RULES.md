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
