// node test.js — offline check of the parsing/export logic.
const assert = require('assert');
const c = require('./bea-credit-card-export.user.js');

assert.strictEqual(c.parseDateText(' 01/05/2026 '), '2026-05-01');
assert.strictEqual(c.parseDateText('2026年5月3日'), '2026-05-03');
assert.strictEqual(c.parseDateText('2026-05-03'), '2026-05-03');
assert.strictEqual(c.parseDateText('SHOP'), null);

assert.strictEqual(c.parseAmount('1,234.50-'), -1234.5);
assert.strictEqual(c.parseAmount('-12.00'), -12);
assert.strictEqual(c.parseAmount('+8'), 8);

// Second date is the transaction date, not part of the description.
assert.deepStrictEqual(
    c.parseRow(['01/05/2026', '30/04/2026', ' SHOP  A\n HK ', '1,234.00']),
    { bookDate: '2026-05-01', txnDate: '2026-04-30', desc: 'SHOP A HK', amount: 1234 },
);
assert.strictEqual(c.parseRow(['Posting Date', 'Description', 'Amount']), null);

// Old layout (spend +, credit "x-") and new layout (spend -, credit +)
// must normalise to the same result.
const oldRows = [
    { bookDate: '2026-05-01', desc: 'SHOP A', amount: 100 },
    { bookDate: '2026-05-02', desc: 'SHOP B', amount: 50.1 },
    { bookDate: '2026-05-03', desc: 'SHOP A REFUND', amount: -20 },
    { bookDate: '2026-05-04', desc: 'PAYMENT FPS', amount: -500 },
    { bookDate: '2026-05-05', desc: 'ALIPAY PAYMENT SERVICE', amount: 0.2 },
];
const newRows = oldRows.map((t) => ({ ...t, amount: -t.amount }));
const a = c.normalizeSigns(oldRows);
assert.deepStrictEqual(c.normalizeSigns(newRows), a);
assert.deepStrictEqual(a.map((t) => t.type), ['expense', 'expense', 'refund', 'payment', 'expense']);
// A purchase whose name contains PAYMENT still counts as spending.
assert.deepStrictEqual(c.summarize(a), { expense: 150.3, refund: 20, net: 130.3, payment: 500 });

assert.strictEqual(c.safeCell('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
assert.strictEqual(c.safeCell('SHOP'), 'SHOP');
assert.strictEqual(c.toCSVLine(['a,b', 'say "hi"', 3]), '"a,b","say ""hi""",3');
assert.strictEqual(
    c.buildCSV([{ bookDate: '2026-05-01', txnDate: '', desc: '@evil', amount: -20, type: 'refund' }]),
    "Posting Date,Transaction Date,Description,Amount,Type\n2026-05-01,,'@evil,-20.00,refund",
);

// Panel text: every language has every key and the same placeholders.
const keys = Object.keys(c.TEXT.en).sort();
const holes = (str) => (str.match(/\{\w+\}/g) || []).sort().join();
for (const lang of ['zhHans', 'zhHant']) {
    assert.deepStrictEqual(Object.keys(c.TEXT[lang]).sort(), keys, lang);
    keys.forEach((k) => assert.strictEqual(holes(c.TEXT[lang][k]), holes(c.TEXT.en[k]), `${lang}.${k}`));
}
assert.strictEqual(c.pickLang('zh-CN'), 'zhHans');
assert.strictEqual(c.pickLang('zh'), 'zhHans');
assert.strictEqual(c.pickLang('zh-HK'), 'zhHant');
assert.strictEqual(c.pickLang('zh-Hant-TW'), 'zhHant');
assert.strictEqual(c.pickLang('en-GB'), 'en');
assert.strictEqual(c.pickLang(undefined), 'en');
assert.strictEqual(c.format(c.TEXT.zhHans.collected, { n: 2, rows: 20 }), '已收集第 2 页：20 条');

console.log('all tests passed');
