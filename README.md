# BEA Credit Card Statement Exporter

A Tampermonkey userscript for exporting BEA Hong Kong credit-card statement transactions from `https://online.hkbea.com` and calculating monthly card spending in CSV/Excel.

## What It Does

- Opens on BEA Online Banking pages.
- Automatically changes the statement start day to `01` for the currently selected month and clicks the display button once.
- Collects transactions from every server-paginated statement page.
- Exports a UTF-8 CSV file with Excel formulas at the top.
- Excludes `PAYMENT FPS` repayments from spending calculations.
- Treats positive amounts as expenses and trailing-minus amounts such as `6000.00-` as negative values.

## Why v6 Exists

The previous v5 script could stop after the first two pages because it depended on clicking an `arrow_right` image and it retried the date initialization after iframe loads. If BEA now reloads the iframe during pagination, that behavior can reset the statement back to the first page while the collector is running.

v6 fixes this by:

- Calling BEA's own `changePage('N')` function directly when available.
- Waiting until the transaction table actually changes before collecting the next page.
- Running the start-date initialization only once.
- Falling back to clickable `changePage('N')` controls if the function is not directly available.

## Installation

1. Install the Tampermonkey extension in Chrome.
2. Open Tampermonkey and create a new script.
3. Replace the default content with `bea-credit-card-export.user.js`.
4. Save the script.
5. Make sure the script is enabled.

## Usage

1. Sign in to BEA Online Banking in Chrome.
2. Open the credit-card statement page for the target month.
3. Wait for the floating **BEA statement exporter v6** panel in the lower-right corner.
4. Let the script set the start date to the first day of the selected month and click the display button.
5. Set **Page delay** to `3` seconds. Increase it to `5` to `8` seconds if the bank website is slow.
6. Click **Auto collect**.
7. Wait until the status shows that collection has finished.
8. Click **CSV** to download the exported file.

## CSV Layout

Rows 1-5 contain summary formulas:

- Expense total
- Refund total
- Net expense
- `PAYMENT FPS` repayment total, excluded from spending

Row 7 contains raw transaction headers:

- Posting Date
- Transaction Date
- Description
- Amount

Rows 8 onward contain raw transaction data. Amounts are exported as plain positive or negative numbers.

## Spending Rules

- Positive amount: expense, included in expense total.
- Negative amount without `PAYMENT FPS`: refund, deducted from expense total.
- Description containing `PAYMENT FPS`: repayment, excluded from net spending.
- Net expense: expense total minus refund total.

## Troubleshooting

If collection stops early:

- Increase **Page delay** and run again.
- Click **Reset** before a second run.
- Confirm that the statement table has four columns: posting date, transaction date, description, amount.
- Open Chrome DevTools and check the console for messages beginning with `[BEA]`.

If the exported CSV opens with broken formulas, open it with Microsoft Excel or Google Sheets. Some preview tools display formulas as plain text.

## Privacy

The script runs only in your browser on `https://online.hkbea.com/*`. It does not send statement data to any external server.
