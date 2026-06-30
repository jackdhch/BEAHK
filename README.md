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

This project is still used as a copy-and-paste Tampermonkey script. You do not need to run a local server, install npm packages, or execute this repository as an application.

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

---

# BEA 东亚银行信用卡账单导出工具

这是一个 Tampermonkey 油猴脚本，用于从 `https://online.hkbea.com` 的 BEA 东亚银行信用卡账单页面采集交易记录，并导出带 Excel 统计公式的 CSV 文件，方便统计每月信用卡净消费。

## 功能

- 在 BEA 网银页面自动运行。
- 自动把当前选择月份的账单开始日期改为 `01`，并点击一次“显示/顯示”按钮。
- 自动采集服务端分页账单中的每一页交易。
- 导出 UTF-8 CSV 文件，顶部包含 Excel 统计公式。
- 将 `PAYMENT FPS` 还款完全排除在消费统计之外。
- 正数金额计为消费，类似 `6000.00-` 这种末尾带负号的金额会转换为负数。

## v6 修复了什么

之前的 v5 版本可能只采集前两页，原因通常有两个：

- v5 依赖点击 `arrow_right` 图片翻页，如果 BEA 页面结构变化，就可能找不到正确的下一页按钮。
- v5 会在 iframe 加载后反复尝试初始化日期。如果 BEA 现在翻页时会刷新 iframe，就可能在翻到后续页面时再次点击“顯示”，把页面重置回第一页。

v6 的改进：

- 优先直接调用 BEA 页面自带的 `changePage('N')` 翻页函数。
- 每次翻页后等待交易表格内容真的变化，再采集下一页。
- 开始日期初始化只执行一次。
- 如果不能直接调用 `changePage`，会回退到点击页面里带 `changePage('N')` 的控件。

## 安装

1. 在 Chrome 安装 Tampermonkey 油猴扩展。
2. 打开 Tampermonkey，新建脚本。
3. 删除默认内容，复制 `bea-credit-card-export.user.js` 的全部内容粘贴进去。
4. 保存脚本。
5. 确认脚本处于启用状态。

这个项目仍然是“复制到油猴脚本里运行”的模式。你不需要启动本地服务，不需要安装 npm 包，也不需要把这个仓库当成应用程序运行。

## 使用方法

1. 在 Chrome 登录 BEA 东亚银行网银。
2. 打开目标月份的信用卡账单页面。
3. 等待右下角出现 **BEA statement exporter v6** 控制面板。
4. 脚本会自动把开始日期改成该月 1 日，并点击一次“显示/顯示”。
5. **Page delay** 默认 `3` 秒。如果网银加载慢，可以改成 `5` 到 `8` 秒。
6. 点击 **Auto collect** 开始自动翻页采集。
7. 等状态显示完成后，点击 **CSV** 下载文件。

## CSV 结构

第 1-5 行是统计公式：

- 消费总额
- 退款总额
- 净消费
- `PAYMENT FPS` 还款总额，已从消费统计中排除

第 7 行是原始交易表头：

- 记账日期
- 交易日期
- 账项说明
- 金额

第 8 行开始是原始交易数据。金额会导出为普通正数或负数。

## 统计规则

- 正数金额：消费，计入消费总额。
- 负数金额且说明不包含 `PAYMENT FPS`：退款，从消费中扣除。
- 说明包含 `PAYMENT FPS`：还款，完全排除。
- 净消费：消费总额减去退款总额。

## 排查问题

如果采集提前停止：

- 增大 **Page delay** 后重新运行。
- 第二次运行前先点击 **Reset**。
- 确认账单表格仍然是四列：记账日期、交易日期、账项说明、金额。
- 打开 Chrome DevTools，查看 Console 中以 `[BEA]` 开头的日志。

如果 CSV 里的公式显示异常，请用 Microsoft Excel 或 Google Sheets 打开。部分预览工具会把公式当普通文本显示。

## 隐私

脚本只在你的浏览器中、`https://online.hkbea.com/*` 页面上运行，不会把账单数据发送到任何外部服务器。
