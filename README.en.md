# BEA Credit Card Statement Exporter

[简体中文](README.md) | [粤语（繁體）](README.zh-HK.md) | **English**

An **unofficial** userscript that collects every page of a BEA (Bank of East Asia, Hong Kong) credit-card transaction enquiry, exports one clean CSV, and shows this month's spending, refunds and net spending right on the page. No more copying page after page by hand.

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Edge, Firefox, Safari). If it asks you to enable user scripts or developer mode, follow its prompt.
2. Click **[install the script](https://github.com/jackdhch/BEAHK/raw/main/bea-credit-card-export.user.js)**. Tampermonkey opens an install page; click **Install**.

New versions are picked up automatically.

## Use

1. Log in to BEA Cyberbanking, open the credit-card transaction enquiry, pick the date range and press 顯示 / Show.
   **From 1st** on the panel sets the start date to the 1st of the month and searches again.
2. Press **Auto collect** on the panel in the bottom-right corner. It walks through every page.
   If an automatic page turn fails, the panel asks you to click the next page yourself and keeps collecting.
3. Press **CSV**.

Other controls: **Stop**, **Reset** (start over), **Page delay** (seconds between pages; raise it if the site is slow), and **Latest month only** (on by default: keep only the most recent calendar month).

The panel follows your browser language: English, Simplified Chinese or Traditional Chinese.

## Output

| Posting Date | Transaction Date | Description | Amount | Type |
|---|---|---|---|---|
| 2026-05-01 | 2026-04-30 | SHOP A HK | 1234.00 | expense |
| 2026-05-03 | 2026-05-02 | SHOP A HK | -20.00 | refund |
| 2026-05-04 | 2026-05-04 | PAYMENT FPS | -500.00 | payment |

- **Spending is positive; refunds and repayments are negative**, whichever sign convention the bank page happens to use. The script detects it.
- Dates are ISO (`YYYY-MM-DD`), so Excel never swaps day and month.
- Headers and Type values are always English, so imports and the formulas below work in any language.
- Totals in Excel: `=SUMIF(E:E,"expense",D:D)` for spending, `=-SUMIF(E:E,"refund",D:D)` for refunds, or a pivot table on the Type column.

## Privacy

The script runs only on `online.hkbea.com`, inside your own browser. It requests no special permissions (`@grant none`) and makes **no network requests**. The CSV is generated locally. It is one readable file, so please read it before installing.

## Upgrading from v6

Delete the old script in Tampermonkey, then install again using the link above. (v6 was installed by copy and paste and cannot update itself; v9 onward updates automatically.) What changed in v9:

- No formulas at the top of the CSV, just data, so it imports cleanly into budgeting apps. Totals are shown on the panel instead.
- New Transaction Date and Type columns; dates are `YYYY-MM-DD`.
- Purchases whose merchant name contains "PAYMENT" are no longer mistaken for repayments.
- The panel speaks Chinese as well as English, following the browser language.
- The page no longer changes the date and searches on load. Press **From 1st** instead.

## When it breaks

Bank pages change. Please open an [issue](https://github.com/jackdhch/BEAHK/issues) with your browser, what the panel said, and the browser console lines (F12) starting with `[BEA]`. **Never paste real transactions or card numbers.** Mask them first.

## Development

```bash
node test.js
```

Not affiliated with or endorsed by The Bank of East Asia, Limited. MIT licensed.
