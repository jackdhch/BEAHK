// ==UserScript==
// @name         BEA Credit Card Statement Exporter
// @name:zh-CN   东亚银行信用卡账单导出
// @name:zh-HK   東亞銀行信用卡賬單匯出
// @name:zh-TW   東亞銀行信用卡賬單匯出
// @namespace    https://github.com/jackdhch/BEAHK
// @version      9.1.0
// @description  Unofficial. Collect every page of a BEA (Bank of East Asia) credit-card transaction enquiry and export a clean CSV. Runs locally; sends nothing anywhere.
// @description:zh-CN  非官方。一键收集东亚银行网银信用卡交易记录的所有分页，导出干净的 CSV，并显示消费合计。只在本地运行，不上传任何数据。
// @description:zh-HK  非官方。一次過收集東亞銀行網上銀行信用卡交易紀錄嘅所有分頁，匯出乾淨嘅 CSV 同顯示消費總數。只喺本機運行，唔會上載任何資料。
// @description:zh-TW  非官方。一次收集東亞銀行網上銀行信用卡交易紀錄的所有分頁，匯出乾淨的 CSV 並顯示消費合計。只在本機執行，不會上傳任何資料。
// @author       Jack
// @license      MIT
// @homepageURL  https://github.com/jackdhch/BEAHK
// @supportURL   https://github.com/jackdhch/BEAHK/issues
// @downloadURL  https://github.com/jackdhch/BEAHK/raw/main/bea-credit-card-export.user.js
// @updateURL    https://github.com/jackdhch/BEAHK/raw/main/bea-credit-card-export.user.js
// @match        https://online.hkbea.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------- pure parsing (no DOM; covered by test.js) ----------

    function normalizeText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    // Accepts DD/MM/YYYY, YYYY年M月D日, YYYY-MM-DD. Returns YYYY-MM-DD or null.
    // ISO output so Excel never swaps day and month.
    function parseDateText(value) {
        const text = normalizeText(value);
        let m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        m = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return m[0];
        return null;
    }

    function parseAmount(value) {
        let raw = normalizeText(value).replace(/,/g, '');
        if (!raw) return NaN;

        let negative = false;
        if (raw.endsWith('-')) {
            negative = true;
            raw = raw.slice(0, -1);
        }
        raw = raw.replace(/^\+/, '');

        const num = Number.parseFloat(raw);
        if (!Number.isFinite(num)) return NaN;
        return negative ? -num : num;
    }

    const AMOUNT_PATTERN = /^[+-]?[\d,]+(?:\.\d{1,2})?-?$/;

    // texts: the text of each cell in one table row.
    // First date = posting date, second date (if any) = transaction date,
    // last amount-looking cell = amount, everything else = description.
    function parseRow(texts) {
        const dateIdx = [];
        texts.forEach((t, i) => { if (parseDateText(t)) dateIdx.push(i); });
        if (dateIdx.length === 0) return null;

        let amountIndex = -1;
        for (let i = texts.length - 1; i > dateIdx[0]; i--) {
            if (dateIdx.includes(i)) continue;
            const text = normalizeText(texts[i]);
            if (text && AMOUNT_PATTERN.test(text) && Number.isFinite(parseAmount(text))) {
                amountIndex = i;
                break;
            }
        }
        if (amountIndex === -1) return null;

        const used = new Set([dateIdx[0], dateIdx[1], amountIndex]);
        return {
            bookDate: parseDateText(texts[dateIdx[0]]),
            txnDate: dateIdx.length > 1 ? parseDateText(texts[dateIdx[1]]) : '',
            desc: texts.filter((_, i) => !used.has(i)).map(normalizeText).filter(Boolean).join(' '),
            amount: parseAmount(texts[amountIndex]),
        };
    }

    const isPayment = (desc) => /\bPAYMENT\b/i.test(desc);

    // BEA has shown both conventions: spending positive with "123.00-" credits
    // (May 2026 layout) and spending negative (later layout). Output is always
    // spending positive, credits negative, plus a type column.
    // ponytail: majority vote — breaks only if credits outnumber purchases in
    // the collected range; switch to a manual toggle if that ever happens.
    function normalizeSigns(txns) {
        const negatives = txns.filter((t) => t.amount < 0).length;
        const spendSign = negatives > txns.length / 2 ? -1 : 1;
        return txns.map((t) => {
            const amount = spendSign * t.amount || 0;
            const type = amount >= 0 ? 'expense' : isPayment(t.desc) ? 'payment' : 'refund';
            return { ...t, amount, type };
        });
    }

    // Sum in cents to avoid float drift.
    function summarize(rows) {
        const cents = { expense: 0, refund: 0, payment: 0 };
        rows.forEach((t) => { cents[t.type] += Math.round(Math.abs(t.amount) * 100); });
        return {
            expense: cents.expense / 100,
            refund: cents.refund / 100,
            net: (cents.expense - cents.refund) / 100,
            payment: cents.payment / 100,
        };
    }

    // Stop spreadsheet apps from executing a description as a formula.
    function safeCell(text) {
        return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    }

    function toCSVLine(values) {
        return values.map((value) => {
            const text = String(value ?? '');
            return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        }).join(',');
    }

    function buildCSV(rows) {
        return [
            ['Posting Date', 'Transaction Date', 'Description', 'Amount', 'Type'],
            ...rows.map((t) => [t.bookDate, t.txnDate, safeCell(t.desc), t.amount.toFixed(2), t.type]),
        ].map(toCSVLine).join('\n');
    }


    // ---------- panel text ----------

    const TEXT = {
        en: {
            title: 'BEA statement exporter v9',
            waiting: 'Waiting...',
            noRows: 'Page {n}: no transaction rows found',
            already: 'Page {n}: already collected',
            collected: 'Collected page {n}: {rows} rows',
            reset: 'Collection reset',
            starting: 'Starting collection...',
            lastPage: 'Finished: reached the last page',
            opening: 'Opening page {n}...',
            manual: 'Auto-click failed. Please click page {n} yourself; watching for the change (or press Stop to finish)...',
            noChange: 'Finished: no further page change detected',
            stopped: 'Stopped',
            noData: 'No data collected yet.',
            exported: 'Exported {rows} rows for {label}',
            exportedSkipped: 'Exported {rows} rows for {label} (skipped {skipped} rows from other months)',
            noForm: 'Date form not found on this page',
            startSet: 'Start date set to {date}',
            progress: '{pages} pages / {rows} rows',
            expense: 'Expense',
            refund: 'Refund',
            net: 'Net',
            payment: 'Payments (excluded): ',
            delay: 'Page delay: ',
            seconds: 'seconds',
            latestMonth: 'Latest month only',
            start: 'Auto collect',
            stop: 'Stop',
            csv: 'CSV',
            clear: 'Reset',
            first: 'From 1st',
            firstTip: 'Set start date to the 1st of the month and search again',
        },
        zhHans: {
            title: '东亚信用卡账单导出 v9',
            waiting: '等待中…',
            noRows: '第 {n} 页：没找到交易记录',
            already: '第 {n} 页：已经收集过',
            collected: '已收集第 {n} 页：{rows} 条',
            reset: '已清空',
            starting: '开始收集…',
            lastPage: '完成：已到最后一页',
            opening: '正在打开第 {n} 页…',
            manual: '自动翻页失败，请手动点第 {n} 页。脚本正在等页面变化（点「停止」可结束）…',
            noChange: '完成：没有等到新的一页',
            stopped: '已停止',
            noData: '还没有收集到数据。',
            exported: '已导出 {label}，共 {rows} 条',
            exportedSkipped: '已导出 {label}，共 {rows} 条（跳过其他月份 {skipped} 条）',
            noForm: '这个页面上找不到日期栏',
            startSet: '开始日期已改为 {date}',
            progress: '{pages} 页 / {rows} 条',
            expense: '消费',
            refund: '退款',
            net: '净消费',
            payment: '还款（不计入）：',
            delay: '每页间隔：',
            seconds: '秒',
            latestMonth: '只要最近一个月',
            start: '自动收集',
            stop: '停止',
            csv: '导出 CSV',
            clear: '清空',
            first: '从 1 号查',
            firstTip: '把开始日期改成本月 1 号并重新查询',
        },
        zhHant: {
            title: '東亞信用卡賬單匯出 v9',
            waiting: '等待中…',
            noRows: '第 {n} 頁：找不到交易紀錄',
            already: '第 {n} 頁：已經收集過',
            collected: '已收集第 {n} 頁：{rows} 筆',
            reset: '已清空',
            starting: '開始收集…',
            lastPage: '完成：已到最後一頁',
            opening: '正在開啟第 {n} 頁…',
            manual: '自動翻頁失敗，請手動按第 {n} 頁。腳本正在等待頁面變化（按「停止」可結束）…',
            noChange: '完成：沒有等到新的一頁',
            stopped: '已停止',
            noData: '尚未收集到資料。',
            exported: '已匯出 {label}，共 {rows} 筆',
            exportedSkipped: '已匯出 {label}，共 {rows} 筆（略過其他月份 {skipped} 筆）',
            noForm: '此頁面找不到日期欄位',
            startSet: '開始日期已改為 {date}',
            progress: '{pages} 頁 / {rows} 筆',
            expense: '消費',
            refund: '退款',
            net: '淨消費',
            payment: '還款（不計入）：',
            delay: '每頁間隔：',
            seconds: '秒',
            latestMonth: '只要最近一個月',
            start: '自動收集',
            stop: '停止',
            csv: '匯出 CSV',
            clear: '清空',
            first: '由 1 號查',
            firstTip: '把開始日期改為本月 1 號並重新查詢',
        },
    };

    // zh-HK / zh-TW / zh-MO / zh-Hant → Traditional; other zh → Simplified.
    function pickLang(language) {
        const l = String(language || '').toLowerCase();
        if (!l.startsWith('zh')) return 'en';
        return /hant|hk|tw|mo/.test(l) ? 'zhHant' : 'zhHans';
    }

    function format(template, vars = {}) {
        return template.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
    }

    if (typeof window === 'undefined') {
        module.exports = { parseDateText, parseAmount, parseRow, normalizeSigns, summarize, safeCell, toCSVLine, buildCSV, TEXT, pickLang, format };
        return;
    }

    // ---------- browser ----------

    if (window !== window.top) return;

    const LANG = pickLang(navigator.language);
    const t = (key, vars) => format(TEXT[LANG][key], vars);

    const STATE = {
        collected: [],
        pageKeysSeen: new Set(),
        running: false,
        delayMs: 3000,
        latestMonthOnly: true,
        lastMessage: t('waiting'),
    };

    function getFrameDocument() {
        const iframe = document.querySelector('iframe.bea_ifame') || document.querySelector('iframe');
        if (!iframe) return document;

        try {
            return iframe.contentDocument || iframe.contentWindow.document || document;
        } catch (error) {
            console.warn('[BEA] Cannot access iframe document:', error);
            return document;
        }
    }

    function getFrameWindow() {
        const doc = getFrameDocument();
        return doc.defaultView || window;
    }

    function getTransactionRows() {
        const doc = getFrameDocument();
        const rows = [];

        doc.querySelectorAll('table tr').forEach((row) => {
            if (row.offsetParent === null && row.offsetHeight === 0) return;
            // A layout row wrapping a nested table would otherwise swallow all
            // inner rows into one bogus transaction.
            if (row.querySelector('table')) return;

            const cells = Array.from(row.cells);
            if (cells.length < 2) return;

            const txn = parseRow(cells.map((cell) => cell.textContent));
            if (txn) rows.push(txn);
        });

        return rows;
    }

    function getPageSignature() {
        return getTransactionRows()
            .map((row) => [row.bookDate, row.txnDate, row.desc, row.amount].join('|'))
            .join('\n');
    }

    // Dedupe by page content, not page number: in manual mode the user may
    // click back to a page already collected.
    function collectCurrentPage(pageIndex) {
        const rows = getTransactionRows();
        if (rows.length === 0) {
            STATE.lastMessage = t('noRows', { n: pageIndex + 1 });
            updateUI();
            return false;
        }

        const pageKey = getPageSignature();
        if (STATE.pageKeysSeen.has(pageKey)) {
            STATE.lastMessage = t('already', { n: pageIndex + 1 });
            updateUI();
            return false;
        }

        STATE.pageKeysSeen.add(pageKey);
        STATE.collected.push(...rows);
        STATE.lastMessage = t('collected', { n: pageIndex + 1, rows: rows.length });
        updateUI();
        return true;
    }

    // ---------- pagination ----------

    function isVisible(el) {
        return !!(el.offsetParent || el.offsetHeight || el.getClientRects().length);
    }

    function isDisabled(el) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
        let node = el;
        for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
            const cls = String(node.className || '').toLowerCase();
            if (/\bdisabled\b/.test(cls)) return true;
        }
        return false;
    }

    // Dispatch a full pointer/mouse event sequence so frameworks that ignore
    // bare .click() (or listen to mousedown/touch) still react.
    function realClick(el) {
        const win = el.ownerDocument.defaultView || window;
        const opts = { bubbles: true, cancelable: true, view: win };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
            try {
                const Ctor = type.startsWith('pointer') && win.PointerEvent
                    ? win.PointerEvent
                    : win.MouseEvent;
                el.dispatchEvent(new Ctor(type, opts));
            } catch (error) {
                console.warn('[BEA] realClick failed for', type, error);
            }
        });
    }

    // Legacy: elements calling changePage(n) via onclick / href.
    function findChangePageTarget(pageIndex) {
        const doc = getFrameDocument();
        const quoted = String(pageIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`changePage\\s*\\(\\s*['"]?${quoted}['"]?\\s*\\)`);
        const candidates = Array.from(doc.querySelectorAll('[onclick], a[href], area[href]'));

        return candidates.find((element) => {
            const onclick = element.getAttribute('onclick') || '';
            const href = element.getAttribute('href') || '';
            return pattern.test(onclick) || pattern.test(href);
        }) || null;
    }

    // New layout: a numbered button inside the pagination bar.
    // pageNumber is 1-based (what is printed on the button).
    function findPageNumberButton(pageNumber) {
        const doc = getFrameDocument();
        const wanted = String(pageNumber);
        const all = Array.from(doc.querySelectorAll('a, button, li, span, div'));

        const matches = all.filter((el) => {
            if (!isVisible(el) || isDisabled(el)) return false;
            if (normalizeText(el.textContent) !== wanted) return false;
            const nums = el.textContent.match(/\d+/g) || [];
            return nums.length === 1;
        });
        if (matches.length === 0) return null;

        const scored = matches.map((el) => {
            let score = 0;
            let node = el;
            for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
                const ident = `${node.className || ''} ${node.id || ''}`.toLowerCase();
                if (/pag|page-item|page-link/.test(ident)) score += 2;
            }
            if (['A', 'BUTTON', 'LI'].includes(el.tagName)) score += 1;
            if (el.tagName === 'DIV') score -= 1;
            return { el, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0].el;
    }

    // Fallback: the "next" arrow (>, ›, », 下一页 ...).
    function findNextArrow() {
        const doc = getFrameDocument();
        const all = Array.from(doc.querySelectorAll('a, button, li, span'));

        return all.find((el) => {
            if (!isVisible(el) || isDisabled(el)) return false;
            const text = normalizeText(el.textContent);
            const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.className || ''}`.toLowerCase();
            if (/next|下一页|下页/.test(label) && !/prev|上一页/.test(label)) return true;
            return ['>', '›', '»', '→', '下一页'].includes(text);
        }) || null;
    }

    // Inspect the pagination bar: highest visible page number and the
    // currently active one. Used to detect the last page.
    function getPaginationState() {
        const doc = getFrameDocument();
        const all = Array.from(doc.querySelectorAll('a, button, li, span'));
        const nums = [];
        let active = null;

        all.forEach((el) => {
            if (!isVisible(el)) return;
            const text = normalizeText(el.textContent);
            if (!/^\d{1,3}$/.test(text)) return;

            const ownCls = String(el.className || '').toLowerCase();
            const parentCls = String((el.parentElement && el.parentElement.className) || '').toLowerCase();
            if (!/pag|page/.test(ownCls + ' ' + parentCls)) return;

            const n = Number.parseInt(text, 10);
            nums.push(n);
            if (/active|current|selected/.test(ownCls) || /active|current|selected/.test(parentCls)) {
                active = n;
            }
        });

        if (nums.length === 0) return null;
        return { max: Math.max(...nums), active };
    }

    function goToPage(pageIndex) {
        const frameWindow = getFrameWindow();

        // 1. legacy JS hook
        if (typeof frameWindow.changePage === 'function') {
            console.log('[BEA] goToPage via changePage()', pageIndex);
            frameWindow.changePage(String(pageIndex));
            return true;
        }

        // 2. legacy onclick / href target
        const legacy = findChangePageTarget(pageIndex);
        if (legacy) {
            console.log('[BEA] goToPage via legacy target', legacy.outerHTML.slice(0, 200));
            realClick(legacy);
            return true;
        }

        // 3. new pagination bar: click the numbered button (1-based label)
        const numBtn = findPageNumberButton(pageIndex + 1);
        if (numBtn) {
            console.log('[BEA] goToPage via number button', numBtn.outerHTML.slice(0, 200));
            realClick(numBtn);
            return true;
        }

        // 4. fallback: next-page arrow
        const arrow = findNextArrow();
        if (arrow) {
            console.log('[BEA] goToPage via next arrow', arrow.outerHTML.slice(0, 200));
            realClick(arrow);
            return true;
        }

        console.log('[BEA] goToPage: no control found for page', pageIndex + 1);
        return false;
    }

    // ---------- loop ----------

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function waitForTransactions(timeoutMs) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            if (getTransactionRows().length > 0) return true;
            await sleep(250);
        }

        return getTransactionRows().length > 0;
    }

    async function waitForPageChange(previousSignature, timeoutMs) {
        const startedAt = Date.now();
        let changedSignature = '';

        while (Date.now() - startedAt < timeoutMs) {
            if (!STATE.running) return false;
            await sleep(300);
            const currentSignature = getPageSignature();

            if (currentSignature && currentSignature !== previousSignature) {
                changedSignature = currentSignature;
                await sleep(300);

                if (getPageSignature() === changedSignature) {
                    return true;
                }
            }
        }

        return false;
    }

    function resetCollection() {
        STATE.collected = [];
        STATE.pageKeysSeen = new Set();
        STATE.lastMessage = t('reset');
        updateUI();
    }

    function finishLoop(message) {
        STATE.running = false;
        STATE.lastMessage = message;
        updateUI(true);
    }

    async function autoLoop() {
        if (STATE.running) return;

        STATE.running = true;
        STATE.lastMessage = t('starting');
        updateUI();

        await waitForTransactions(Math.max(STATE.delayMs, 5000));

        let pageIndex = 0;
        let previousSignature = '';

        while (STATE.running) {
            await waitForTransactions(Math.max(STATE.delayMs, 5000));
            previousSignature = getPageSignature();
            collectCurrentPage(pageIndex);

            const nextPageIndex = pageIndex + 1;

            // Last-page check: current page is the highest number in the bar.
            const pag = getPaginationState();
            if (pag && pag.active !== null && pag.active >= pag.max) {
                finishLoop(t('lastPage'));
                break;
            }

            STATE.lastMessage = t('opening', { n: nextPageIndex + 1 });
            updateUI();

            const clicked = goToPage(nextPageIndex);
            let changed = false;

            if (clicked) {
                changed = await waitForPageChange(
                    previousSignature,
                    Math.max(STATE.delayMs * 3, 12000)
                );
            }

            if (!STATE.running) break;

            if (!clicked || !changed) {
                // Semi-auto fallback: let the user click the page number by
                // hand while we watch for the table to change.
                STATE.lastMessage = t('manual', { n: nextPageIndex + 1 });
                updateUI();
                console.log('[BEA] Waiting for manual page change. clicked =', clicked);

                changed = await waitForPageChange(previousSignature, 300000);

                if (!changed) {
                    if (STATE.running) finishLoop(t('noChange'));
                    break;
                }
            }

            pageIndex = nextPageIndex;
            await sleep(STATE.delayMs);
        }
    }

    function stopAuto() {
        STATE.running = false;
        STATE.lastMessage = t('stopped');
        updateUI();
    }

    // ---------- export ----------

    // Signs are detected on everything collected, then optionally narrowed to
    // the latest calendar month (the enquiry can return rows across a month
    // boundary).
    function selectRows() {
        const all = normalizeSigns(STATE.collected);
        if (all.length === 0) return { rows: all, label: '', skipped: 0 };

        const dates = all.map((t) => t.bookDate).sort();
        if (!STATE.latestMonthOnly) {
            return { rows: all, label: `${dates[0]}_to_${dates[dates.length - 1]}`, skipped: 0 };
        }

        const latest = dates[dates.length - 1].slice(0, 7);
        const rows = all.filter((t) => t.bookDate.startsWith(latest));
        return { rows, label: latest, skipped: all.length - rows.length };
    }

    function exportCSV() {
        const { rows, label, skipped } = selectRows();
        if (rows.length === 0) {
            alert(t('noData'));
            return;
        }

        const blob = new Blob(['﻿' + buildCSV(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `BEA_statement_${label}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        STATE.lastMessage = t(skipped > 0 ? 'exportedSkipped' : 'exported', { rows: rows.length, label, skipped });
        updateUI(true);
    }

    // Legacy enquiry form: set the start date to day 01 and re-run the query.
    function setStartToFirst() {
        const doc = getFrameDocument();
        const startInput = doc.getElementById('STARTDATE');
        const showBtn = doc.getElementById('showBtn');
        const parts = startInput ? normalizeText(startInput.value).split('/') : [];
        if (!showBtn || parts.length !== 3) {
            STATE.lastMessage = t('noForm');
            updateUI();
            return;
        }

        const EventCtor = (doc.defaultView && doc.defaultView.Event) || Event;
        startInput.value = `01/${parts[1]}/${parts[2]}`;
        startInput.dispatchEvent(new EventCtor('input', { bubbles: true }));
        startInput.dispatchEvent(new EventCtor('change', { bubbles: true }));
        showBtn.click();
        STATE.lastMessage = t('startSet', { date: startInput.value });
        updateUI();
    }

    // ---------- UI ----------

    function setButtonState(button, enabled, activeColor, disabledColor) {
        button.disabled = !enabled;
        button.style.background = enabled ? activeColor : disabledColor;
        button.style.color = enabled ? 'white' : '#aaa';
        button.style.cursor = enabled ? 'pointer' : 'default';
    }

    function updateUI(done) {
        const status = document.getElementById('_beaStatus');
        const summary = document.getElementById('_beaSummary');
        const startBtn = document.getElementById('_beaStartBtn');
        const stopBtn = document.getElementById('_beaStopBtn');
        const exportBtn = document.getElementById('_beaExportBtn');
        const resetBtn = document.getElementById('_beaResetBtn');
        if (!status || !summary || !startBtn || !stopBtn || !exportBtn || !resetBtn) return;

        const rows = STATE.collected.length;
        const pages = STATE.pageKeysSeen.size;
        const running = STATE.running;

        const color = done ? '#2ecc71' : running ? '#f39c12' : '#aaa';
        status.innerHTML = `<span style="color:${color}">${escapeHTML(STATE.lastMessage)}</span><br>`
            + `<b style="color:white">${escapeHTML(t('progress', { pages, rows }))}</b>`;

        const sel = selectRows();
        const s = summarize(sel.rows);
        const fmt = (n) => n.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        summary.innerHTML = sel.rows.length === 0 ? '' : `
            <div style="color:#aaa;margin-bottom:2px;">${escapeHTML(sel.label)}</div>
            ${t('expense')} <b>${fmt(s.expense)}</b> − ${t('refund')} <b>${fmt(s.refund)}</b>
            = ${t('net')} <b style="color:#2ecc71">${fmt(s.net)}</b><br>
            <span style="color:#aaa">${t('payment')}${fmt(s.payment)}</span>`;

        setButtonState(startBtn, !running, '#c0392b', '#555');
        setButtonState(stopBtn, running, '#888', '#555');
        setButtonState(exportBtn, rows > 0, '#27ae60', '#555');
        setButtonState(resetBtn, !running && rows > 0, '#666', '#444');
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char]));
    }

    function injectUI() {
        if (document.getElementById('_beaPanel')) return;

        const panel = document.createElement('div');
        panel.id = '_beaPanel';
        panel.style.cssText = [
            'position:fixed',
            'bottom:20px',
            'right:20px',
            'z-index:2147483647',
            'background:#1a1a1a',
            'color:white',
            'border-radius:8px',
            'padding:14px 16px',
            'font-family:Arial, sans-serif',
            'font-size:12px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.45)',
            'min-width:270px',
        ].join(';');

        panel.innerHTML = `
            <div style="font-weight:bold;font-size:13px;margin-bottom:8px;color:#e74c3c;">
                ${t('title')}
            </div>
            <div id="_beaStatus" style="margin-bottom:8px;color:#aaa;min-height:32px;">
                ${t('waiting')}
            </div>
            <div id="_beaSummary" style="margin-bottom:8px;line-height:1.5;"></div>
            <label style="display:block;margin-bottom:6px;font-size:11px;">
                ${t('delay')}
                <input id="_beaDelayInput" type="number" value="3" min="2" max="20"
                    style="width:42px;background:#333;color:white;border:1px solid #555;border-radius:3px;padding:2px 4px;">
                ${t('seconds')}
            </label>
            <label style="display:block;margin-bottom:10px;font-size:11px;">
                <input id="_beaMonthInput" type="checkbox" checked> ${t('latestMonth')}
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button id="_beaStartBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;font-weight:bold;">
                    ${t('start')}
                </button>
                <button id="_beaStopBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    ${t('stop')}
                </button>
                <button id="_beaExportBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    ${t('csv')}
                </button>
                <button id="_beaResetBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    ${t('clear')}
                </button>
                <button id="_beaFirstBtn" title="${t('firstTip')}"
                    style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;background:#34495e;color:white;cursor:pointer;">
                    ${t('first')}
                </button>
            </div>
        `;

        document.body.appendChild(panel);

        const readDelay = () => {
            STATE.delayMs = Math.max(2, Number.parseInt(document.getElementById('_beaDelayInput').value, 10) || 3) * 1000;
        };
        document.getElementById('_beaStartBtn').addEventListener('click', () => { readDelay(); autoLoop(); });
        document.getElementById('_beaStopBtn').addEventListener('click', stopAuto);
        document.getElementById('_beaExportBtn').addEventListener('click', exportCSV);
        document.getElementById('_beaResetBtn').addEventListener('click', resetCollection);
        document.getElementById('_beaFirstBtn').addEventListener('click', setStartToFirst);
        document.getElementById('_beaDelayInput').addEventListener('change', readDelay);
        document.getElementById('_beaMonthInput').addEventListener('change', (event) => {
            STATE.latestMonthOnly = event.target.checked;
            updateUI();
        });

        updateUI();
    }

    setTimeout(injectUI, 1500);
}());
