# Kryptax — U.K. rules used by the v1 module

Checked on 2026-11-03, on gov.uk pages only. Kryptax is not tax advice: it gives an estimate that you must check yourself.
Only individuals (not a trade), Capital Gains Tax on cryptoassets. Scotland/Wales income tax bands are not used (no tax amount is computed).

## Sources (gov.uk), all consulted on 2026-11-03

- HMRC Cryptoassets Manual CRYPTO22100 (disposals): https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22100
- CRYPTO22150 (allowable costs): https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22150
- CRYPTO22200 (pooling, updated 2025-11-17): https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200
- CRYPTO22251 to CRYPTO22256 (worked pooling examples)
- CRYPTO22280 (fees paid in tokens), CRYPTO22350 and CRYPTO21250 (airdrops), CRYPTO21150 and CRYPTO21200 (mining, staking)
- Capital Gains Tax: what you pay it on, rates and allowances: https://www.gov.uk/capital-gains-tax
- Capital Gains Tax rates and allowances (updated 2026-04-13): https://www.gov.uk/guidance/rates-and-allowances-capital-gains-tax
- Check if you need to pay tax when you sell cryptoassets (updated 2026-10-05): https://www.gov.uk/guidance/check-if-you-need-to-pay-tax-when-you-sell-cryptoassets
- Check if you need to pay tax when you receive cryptoassets: https://www.gov.uk/guidance/check-if-you-need-to-pay-tax-when-you-receive-cryptoassets
- SA108 Capital Gains Tax summary 2026 and its notes (tax year 2025-26): https://www.gov.uk/government/publications/self-assessment-capital-gains-summary-sa108

## Confirmed and coded in v1

| Rule | Source |
| --- | --- |
| Tax year runs 6 April to 5 April. | gov.uk/capital-gains-tax |
| Disposal = selling for money, exchanging for another cryptoasset, paying for goods or services, giving away (market value; spouse, civil partner or charity excepted). Moving tokens between your own wallets is not a disposal. | CRYPTO22100 |
| Allowable costs: acquisition cost and incidental fees (s38 TCGA 1992). A fee on a token-to-token swap may be split between the two legs (coded 50/50). | CRYPTO22150 |
| Matching order: same day (s105), then acquisitions in the next 30 days, earliest first (s106A), then the Section 104 pool per token type (s104). A buy 31 days later is not matched. | CRYPTO22200, CRYPTO22251-22256 (example 3) |
| Pool cost of a part disposal = pool cost x units sold / units in pool. | CRYPTO22200, examples 4 and 6 |
| Annual exempt amount: GBP 12,300 (2021-22, 2022-23), GBP 6,000 (2023-24), GBP 3,000 (2024-25 to 2026-27). | Capital Gains Tax rates and allowances |
| SA108 boxes 13.1 number of disposals, 13.2 proceeds, 13.3 allowable costs, 13.4 gains, 13.5 losses. Do not deduct the annual exempt amount in these boxes. | SA108 2026 and notes |
| Reporting needed if proceeds exceed GBP 50,000 (from 2023-24) or gains exceed the allowance. | gov.uk/capital-gains-tax, SA108 notes |
| Staking and mining that are not a trade: miscellaneous income at the GBP value when received; the tokens enter the pool at that value. | CRYPTO21150, CRYPTO21200 |
| Rates shown as text only: 18 % / 24 % from 6 April 2025; 2024-25 split at 30 October 2024 (10/20 % then 18/24 %). | Capital Gains Tax rates and allowances |

## À vérifier (shown as "to verify", not decided by Kryptax)

- Airdrops: pooled at GBP 0; whether Income Tax applies depends on the case (CRYPTO21250, CRYPTO22350).
- Fees paid in tokens (CRYPTO22280) and transfer fees: listed, not computed.
- Disposals with no matching acquisition: listed, left out of the totals.
- Income allowance GBP 1,000 and the GBP 2,500 threshold: displayed, not applied to the gain.
- Losses of earlier years, other assets, spouse transfers, NFTs (not pooled), DeFi lending/liquidity, non-residence, trading status: not handled.
- Rounding: Kryptax keeps pence; HMRC examples round to whole pounds (example 4: 79.50 vs 79).

## Not implemented

- Currency conversion (v2.34): values in another currency (EUR, USD, ...) are converted to GBP with the European Central Bank reference rates published through Frankfurter (api.frankfurter.dev), at the rate of the operation day or, failing that, of the previous working day (up to 7 days back). HMRC does not prescribe the reference point for the rate but expects "a reasonable and consistent method" (Capital Gains Manual CG78310); cryptoassets themselves are not currency (CRYPTO22550). The source and rate date are shown and marked "to verify". A line with no rate found is listed, excluded and flagged; nothing is guessed. A line mixing two currencies is skipped.
- No tax amount is computed (depends on taxable income).
- PDF statements are read in U.K. mode (v2.34) with the same in-browser PDF reader as the French mode: date, type, asset, quantity, value, fee; values are then converted to GBP as above. Only text PDFs are read (no scans); unrecognised lines are listed as skipped. To verify against the statement.
