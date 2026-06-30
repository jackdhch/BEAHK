// ==UserScript==
// @name         BEA Credit Card Statement Exporter
// @namespace    https://github.com/jack/bea-credit-card-exporter
// @version      6.0.0
// @description  Collect all BEA credit-card statement pages and export a CSV with Excel summary formulas.
// @author       Jack
// @match        https://online.hkbea.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window !== window.top) return;

    const STATE = {
        collected: [],
        pageKeysSeen: new Set(),
        running: false,
        delayMs: 3000,
        lastMessage: 'Waiting...',
        dateInitialized: false,
    };

    window._beaCollected = STATE.collected;
    window._beaPagesSeen = STATE.pageKeysSeen;

    function getFrameDocument() {
        const iframe = document.querySelector('iframe');
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

    function normalizeText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function parseAmount(value) {
        const raw = normalizeText(value).replace(/,/g, '');
        if (!raw) return NaN;

        if (raw.endsWith('-')) {
            return -Number.parseFloat(raw.slice(0, -1));
        }

        return Number.parseFloat(raw);
    }

    function getTransactionRows() {
        const doc = getFrameDocument();
        const rows = [];

        doc.querySelectorAll('table tr').forEach((row) => {
            if (row.offsetParent === null && row.offsetHeight === 0) return;

            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length !== 4) return;

            const bookDate = normalizeText(cells[0].textContent);
            const txnDate = normalizeText(cells[1].textContent);
            const desc = normalizeText(cells[2].textContent);
            const amount = parseAmount(cells[3].textContent);

            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(bookDate)) return;
            if (!Number.isFinite(amount)) return;

            rows.push({ bookDate, txnDate, desc, amount });
        });

        return rows;
    }

    function getPageSignature() {
        const rows = getTransactionRows();
        if (rows.length === 0) return '';

        return rows
            .map((row) => [row.bookDate, row.txnDate, row.desc, row.amount].join('|'))
            .join('\n');
    }

    function collectCurrentPage(pageIndex) {
        const rows = getTransactionRows();
        if (rows.length === 0) {
            STATE.lastMessage = `Page ${pageIndex + 1}: no transaction rows found`;
            updateUI();
            return false;
        }

        const pageKey = [
            pageIndex,
            rows.length,
            rows[0].bookDate,
            rows[0].txnDate,
            rows[0].desc,
            rows[0].amount,
            rows[rows.length - 1].bookDate,
            rows[rows.length - 1].txnDate,
            rows[rows.length - 1].desc,
            rows[rows.length - 1].amount,
        ].join('|');

        if (STATE.pageKeysSeen.has(pageKey)) {
            STATE.lastMessage = `Page ${pageIndex + 1}: already collected`;
            updateUI();
            return false;
        }

        STATE.pageKeysSeen.add(pageKey);
        STATE.collected.push(...rows);
        window._beaCollected = STATE.collected;
        window._beaPagesSeen = STATE.pageKeysSeen;
        STATE.lastMessage = `Collected page ${pageIndex + 1}: ${rows.length} rows`;
        updateUI();
        return true;
    }

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

    function goToPage(pageIndex) {
        const frameWindow = getFrameWindow();

        if (typeof frameWindow.changePage === 'function') {
            frameWindow.changePage(String(pageIndex));
            return true;
        }

        const target = findChangePageTarget(pageIndex);
        if (target) {
            target.click();
            return true;
        }

        return false;
    }

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
        window._beaCollected = STATE.collected;
        window._beaPagesSeen = STATE.pageKeysSeen;
        STATE.lastMessage = 'Collection reset';
        updateUI();
    }

    async function autoLoop() {
        if (STATE.running) return;

        STATE.running = true;
        STATE.lastMessage = 'Starting collection...';
        updateUI();

        await waitForTransactions(Math.max(STATE.delayMs, 5000));

        let pageIndex = 0;
        let previousSignature = '';

        while (STATE.running) {
            await waitForTransactions(Math.max(STATE.delayMs, 5000));
            previousSignature = getPageSignature();
            collectCurrentPage(pageIndex);

            const nextPageIndex = pageIndex + 1;
            STATE.lastMessage = `Opening page ${nextPageIndex + 1}...`;
            updateUI();

            if (!goToPage(nextPageIndex)) {
                STATE.running = false;
                STATE.lastMessage = 'Finished: no next page control found';
                updateUI(true);
                break;
            }

            const changed = await waitForPageChange(previousSignature, Math.max(STATE.delayMs * 2, 6000));
            if (!changed) {
                STATE.running = false;
                STATE.lastMessage = 'Finished: page did not change after next-page request';
                updateUI(true);
                break;
            }

            pageIndex = nextPageIndex;
            await sleep(STATE.delayMs);
        }
    }

    function stopAuto() {
        STATE.running = false;
        STATE.lastMessage = 'Stopped';
        updateUI();
    }

    function exportCSV() {
        const all = STATE.collected;
        if (!all || all.length === 0) {
            alert('No data collected yet.');
            return;
        }

        const dataStart = 8;
        const dataEnd = dataStart + all.length - 1;
        const amountRange = `D${dataStart}:D${dataEnd}`;
        const descRange = `C${dataStart}:C${dataEnd}`;

        const formulaExpense = `=SUMPRODUCT((${amountRange}>0)*(ISERROR(SEARCH("PAYMENT FPS",${descRange})))*${amountRange})`;
        const formulaRefund = `=SUMPRODUCT((${amountRange}<0)*(ISERROR(SEARCH("PAYMENT FPS",${descRange})))*${amountRange})*-1`;
        const formulaNet = '=B2-B3';
        const formulaRepayment = `=SUMPRODUCT((ISNUMBER(SEARCH("PAYMENT FPS",${descRange})))*(${amountRange}<0)*${amountRange})*-1`;

        const rows = [
            ['Item', 'Amount (auto-calculated)', '', ''],
            ['Expense total', formulaExpense, '', ''],
            ['Refund total', formulaRefund, '', ''],
            ['Net expense', formulaNet, '', ''],
            ['PAYMENT FPS repayment (excluded)', formulaRepayment, '', ''],
            ['', '', '', ''],
            ['Posting Date', 'Transaction Date', 'Description', 'Amount'],
            ...all.map((txn) => [txn.bookDate, txn.txnDate, txn.desc, txn.amount]),
        ];

        const csv = rows.map(toCSVLine).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `BEA_statement_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function toCSVLine(values) {
        return values.map((value) => {
            const text = String(value === undefined || value === null ? '' : value);
            if (text.includes(',') || text.includes('"') || text.includes('\n') || text.startsWith('=')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        }).join(',');
    }

    function setButtonState(button, enabled, activeColor, disabledColor) {
        button.disabled = !enabled;
        button.style.background = enabled ? activeColor : disabledColor;
        button.style.color = enabled ? 'white' : '#aaa';
        button.style.cursor = enabled ? 'pointer' : 'default';
    }

    function updateUI(done) {
        const status = document.getElementById('_beaStatus');
        const startBtn = document.getElementById('_beaStartBtn');
        const stopBtn = document.getElementById('_beaStopBtn');
        const exportBtn = document.getElementById('_beaExportBtn');
        const resetBtn = document.getElementById('_beaResetBtn');
        if (!status || !startBtn || !stopBtn || !exportBtn || !resetBtn) return;

        const rows = STATE.collected.length;
        const pages = STATE.pageKeysSeen.size;
        const running = STATE.running;

        status.innerHTML = done
            ? `<span style="color:#2ecc71">${escapeHTML(STATE.lastMessage)} (${pages} pages / ${rows} rows)</span>`
            : running
                ? `<span style="color:#f39c12">${escapeHTML(STATE.lastMessage)} (${pages} pages / ${rows} rows)</span>`
                : `${escapeHTML(STATE.lastMessage)}<br><b style="color:white">${rows}</b> rows from ${pages} pages`;

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
                BEA statement exporter v6
            </div>
            <div id="_beaStatus" style="margin-bottom:8px;color:#aaa;min-height:32px;">
                Waiting...
            </div>
            <label style="display:block;margin-bottom:10px;font-size:11px;">
                Page delay:
                <input id="_beaDelayInput" type="number" value="3" min="2" max="20"
                    style="width:42px;background:#333;color:white;border:1px solid #555;border-radius:3px;padding:2px 4px;">
                seconds
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button id="_beaStartBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;font-weight:bold;">
                    Auto collect
                </button>
                <button id="_beaStopBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    Stop
                </button>
                <button id="_beaExportBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    CSV
                </button>
                <button id="_beaResetBtn" style="border:none;border-radius:5px;padding:7px 10px;font-size:12px;">
                    Reset
                </button>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('_beaStartBtn').addEventListener('click', () => {
            STATE.delayMs = Math.max(2, Number.parseInt(document.getElementById('_beaDelayInput').value, 10) || 3) * 1000;
            autoLoop();
        });

        document.getElementById('_beaStopBtn').addEventListener('click', stopAuto);
        document.getElementById('_beaExportBtn').addEventListener('click', exportCSV);
        document.getElementById('_beaResetBtn').addEventListener('click', resetCollection);
        document.getElementById('_beaDelayInput').addEventListener('change', (event) => {
            STATE.delayMs = Math.max(2, Number.parseInt(event.target.value, 10) || 3) * 1000;
        });

        updateUI();
    }

    function autoInitDateOnce() {
        if (STATE.dateInitialized) return false;

        const doc = getFrameDocument();
        const startInput = doc.getElementById('STARTDATE');
        const showBtn = doc.getElementById('showBtn');
        if (!startInput || !showBtn) return false;

        const parts = normalizeText(startInput.value).split('/');
        if (parts.length !== 3) return false;

        const newValue = `01/${parts[1]}/${parts[2]}`;
        if (startInput.value !== newValue) {
            const EventCtor = (doc.defaultView && doc.defaultView.Event) || Event;
            startInput.value = newValue;
            startInput.dispatchEvent(new EventCtor('input', { bubbles: true }));
            startInput.dispatchEvent(new EventCtor('change', { bubbles: true }));
        }

        STATE.dateInitialized = true;
        showBtn.click();
        STATE.lastMessage = `Start date set to ${newValue}`;
        updateUI();
        console.log('[BEA] Auto-init completed once:', newValue);
        return true;
    }

    function waitAndInit() {
        const iframe = document.querySelector('iframe');
        if (!iframe) {
            setTimeout(waitAndInit, 500);
            return;
        }

        const tryInit = () => {
            if (STATE.dateInitialized) return;
            if (!autoInitDateOnce()) setTimeout(tryInit, 500);
        };

        iframe.addEventListener('load', () => {
            if (!STATE.dateInitialized) setTimeout(tryInit, 800);
        });

        setTimeout(tryInit, 800);
    }

    setTimeout(injectUI, 1500);
    waitAndInit();
}());
