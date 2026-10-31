# Kryptax — U.S.A. rules used by the v1 module

Checked on 2026-10-31. Kryptax is not tax advice: it gives an estimate that you must check yourself.
State taxes are not included.

## Sources (irs.gov)

- Instructions for Form 8949 (2025): https://www.irs.gov/instructions/i8949
- IRS Virtual Currency FAQs: https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions
  (the IRS says they apply to transactions before Jan. 1, 2025; the same principles are restated in the i8949 "Digital Assets" section)
- Notice 2026-20: https://www.irs.gov/pub/irs-drop/n-26-20.pdf
- Rev. Proc. 2024-28 (listed on https://www.irs.gov/filing/digital-assets)
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
| Rewards: staking rewards are income at their USD fair market value when you gain control of them, and that value becomes your basis. | Rev. Rul. 2023-14; FAQ Q24–Q25 |

## To be verified (not coded in v1)

- **Wash sales.** Section 1091 is written for "stock or securities". Bill H.R. 9172 (introduced June 8, 2026) would extend it to digital assets, but it was still only introduced in October 2026. Kryptax does not apply it; check the current law.
- **Specific identification and several wallets.** The rules are Treas. Reg. 1.1012-1(j), Rev. Proc. 2024-28 (wallet-by-wallet basis from Jan. 1, 2025) and Notice 2026-20 (books-and-records identification for broker-held units, through Dec. 31, 2026). v1 handles one wallet with FIFO only.
- **Form 1099-DA.** If you received one, use its proceeds and basis, plus adjustments in columns (f) and (g) (codes B, E, and so on). v1 does not read 1099-DA, so the box letter is only a hint.
- **Income.** Staking, airdrops and rewards are added as lots at their USD value, but the income itself is not computed or reported by v1.
- **Fees on crypto-to-crypto exchanges.** These are digital asset transaction costs (Treas. Reg. 1.1001-7). v1 subtracts them from proceeds; check the exact allocation.
- **Leap days.** For an acquisition on Feb 29, the anniversary is computed as Mar 1.
- **Other limits.** Capital loss limits, carryovers, tax rates, NIIT and state taxes are not computed.
