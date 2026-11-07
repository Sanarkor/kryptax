# Kryptax — Germany rules used by the v1 module (estimate)

Kryptax is not tax advice: it gives an estimate that you must check yourself or with a tax adviser.
Scope: an individual holding crypto assets as private assets (not a business). No tax amount is computed: German income tax uses the progressive scale (s. 32a EStG), which depends on the whole income.

## Sources (official), consulted on 2026-11-03, statutes re-read on 2026-11-07

- BMF letter of 6 March 2025, "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte", BStBl I S. 658 (replaces the letter of 10 May 2022): https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte-bmf-schreiben.pdf
- EStG s. 23 (private sales): https://www.gesetze-im-internet.de/estg/__23.html
- EStG s. 22 (other income, no. 3 income from services): https://www.gesetze-im-internet.de/estg/__22.html
- EStG s. 2 (7), s. 25 (calendar year), s. 32a (tax scale), s. 32d, s. 20: https://www.gesetze-im-internet.de/estg/
- AO s. 108 (periods, applies ss. 187-193 BGB): https://www.gesetze-im-internet.de/ao_1977/__108.html
- BGB s. 187 and s. 188 (start and end of a period): https://www.gesetze-im-internet.de/bgb/__187.html , https://www.gesetze-im-internet.de/bgb/__188.html
- ELSTER notes to the 2025 income tax return, Anlage SO: https://www.elster.de/eportal/helpGlobal?themaGlobal=help_est_ufa_10_2025

Not read: the official Anlage SO form itself (PDF), the filing deadlines (AO s. 149).

## Rules applied

| # | Rule | Source | Status |
|---|---|---|---|
| 1 | A disposal of crypto assets is a private sale (taxable) only when acquisition and disposal are not more than one year apart; later disposals are not taxable. | s. 23 (1) no. 2 EStG; BMF Rn. 53, 57 | confirmed |
| 2 | One year is counted with ss. 187 (1), 188 (2)-(3) BGB (s. 108 (1) AO): a disposal on the anniversary day is still within one year; acquired on 29 February, the period ends on 28 February. The weekend rule of s. 108 (3) AO is not applied. | AO s. 108; BGB ss. 187-188 | confirmed (statutes); weekend rule: to verify |
| 3 | No 10-year period for currency tokens, even with staking or lending. | BMF Rn. 63 | confirmed (currency tokens); other tokens: to verify |
| 4 | Exemption limit (all or nothing): gains are not taxable when the total gain of ALL private sales of the calendar year is less than EUR 1,000 (EUR 600 up to 2023). At EUR 1,000 or more, the whole gain is taxable. The limit covers other private sales too, not only crypto: the app reminds you to add them. If some disposals are to verify, "below the limit" is not claimed. | s. 23 (3) sentence 5 EStG; BMF Rn. 53 | confirmed |
| 5 | Every exchange is a disposal (crypto to EUR, to goods, to another crypto); the received token starts a new holding period at the value received. | BMF Rn. 54-55, 58-59 | confirmed |
| 6 | Gain = proceeds - acquisition cost - fees. Fees of a disposal partly within and partly after one year are split by quantity. | BMF Rn. 57, 59 | confirmed; split method: to verify |
| 7 | FIFO per wallet and per token (simplification allowed by the BMF); without a wallet column, one single wallet is used and flagged. | BMF Rn. 61-62 | confirmed |
| 8 | Losses within one year are shown; they can only be set against private-sale gains and carried back or forward (s. 10d). Not computed. Order between the limit and losses: to verify. | s. 23 (3) EStG | confirmed; order: to verify |
| 9 | Passive staking and lending: income from services at the market value when received; the tokens received are an acquisition. | s. 22 no. 3 EStG; BMF Rn. 48, 65 | confirmed |
| 10 | Limit for income from services: not taxable when ALL such income of the year is less than EUR 256 (all or nothing). Only staking and lending are counted; mining (private or commercial), airdrops (income only with something given in return, otherwise possibly a gift) and other rewards are listed apart, out of the total, to verify. With such lines, "below the limit" is not claimed. | s. 22 no. 3 sentence 2 EStG; BMF Rn. 34-45, 67-75 | confirmed; classification of mining and airdrops: to verify |
| 11 | Transactions without cost, date, EUR value or acquisition stay "to verify" and out of the totals; no gain is invented. | — | app rule |
| 12 | Calendar year; days in German time (Europe/Berlin). | s. 2 (7), s. 25 EStG | confirmed |
| 13 | Anlage SO line numbers: the ELSTER notes give lines 43-49 in one place and 45-49 in another (plus 56-57) for crypto assets; income lines 14-21. | ELSTER | to verify |
| 14 | Utility and security tokens, NFTs (not covered by the BMF letter), commercial trading or mining: not covered. | BMF Rn. 5 | to verify |

## v2.46 (zzk) additions
- Language: the Germany page can be shown in English (default) or German (switch at the top of the page, kept in this browser under `kx-de-lang`). Rules, figures and open points are identical in both languages; the PDF is ASCII only (ä -> ae, ö -> oe, ü -> ue, ß -> ss, § -> Par.).
- Binance "Transaction History" (CSV, Excel, PDF) is read with the shared neutral reader (`formats.js` `binanceLedger` / `binancePdfRows`). EUR amounts are kept; other currencies use the existing ECB conversion; exchanges between tokens and rewards have no EUR value in the file and use the existing market price of the minute or stay "to verify". Deposits and withdrawals are transfers, never a purchase or sale: a token deposited from outside has no purchase lot, so its disposal is "no acquisition found - to verify". The file's own UTC offset is used when present. No tax rule was changed.
