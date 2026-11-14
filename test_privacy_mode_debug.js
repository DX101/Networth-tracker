const assert = require('assert');

console.log('====================================================');
console.log('--- STARTING PRIVACY MODE (EYE TOGGLE) DEBUG TEST ---');
console.log('====================================================');

const CURRENCIES = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', CAD: 'C$', SGD: 'S$', JPY: '¥'
};

function isPrivacyActive(settings) {
  if (settings && typeof settings.privacy_mode === 'boolean') {
    return settings.privacy_mode;
  }
  return false;
}

function money(value, settings) {
  const num = Number(value || 0);
  const isNeg = num < 0;
  const absNum = Math.abs(num);
  let sym = '₹';
  if (settings) {
    if (settings.currency_symbol === '') {
      sym = '';
    } else if (settings.currency && CURRENCIES[settings.currency]) {
      sym = CURRENCIES[settings.currency];
    } else if (settings.currency_symbol) {
      sym = settings.currency_symbol;
    } else if (settings.currency) {
      sym = settings.currency + ' ';
    }
  }
  if (isPrivacyActive(settings)) {
    return `${isNeg ? '-' : ''}${sym}••••••`;
  }
  const formatted = absNum.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${isNeg ? '-' : ''}${sym}${formatted}`;
}

// TEST 1: Privacy OFF (Standard money formatting)
console.log('\n[Test 1] Testing money() with Privacy Mode OFF...');
const regularInr = money(7313700.80, { currency: 'INR' });
console.log('  Normal Net Worth:', regularInr);
assert.strictEqual(regularInr, '₹7,313,700.80');
const regularUsd = money(1250.95, { currency: 'USD' });
console.log('  Normal USD:', regularUsd);
assert.strictEqual(regularUsd, '$1,250.95');
console.log('✓ Test 1 Passed: Normal amounts format accurately.');

// TEST 2: Privacy ON (Masked with ••••••)
console.log('\n[Test 2] Testing money() with Privacy Mode ON...');
const maskedInr = money(7313700.80, { currency: 'INR', privacy_mode: true });
console.log('  Masked Net Worth:', maskedInr);
assert.strictEqual(maskedInr, '₹••••••');

const maskedNegInr = money(-281.36, { currency: 'INR', privacy_mode: true });
console.log('  Masked Monthly Cash Flow (negative):', maskedNegInr);
assert.strictEqual(maskedNegInr, '-₹••••••');

const maskedUsd = money(1250.95, { currency: 'USD', privacy_mode: true });
console.log('  Masked USD:', maskedUsd);
assert.strictEqual(maskedUsd, '$••••••');

const maskedNegUsd = money(-61.85, { currency: 'USD', privacy_mode: true });
console.log('  Masked Neg USD:', maskedNegUsd);
assert.strictEqual(maskedNegUsd, '-$••••••');
console.log('✓ Test 2 Passed: Balances and amounts masked correctly with ••••••.');

// TEST 3: Dashboard Recent Transactions Formatting with Privacy ON
console.log('\n[Test 3] Testing Dashboard Recent Activity transaction amounts with Privacy ON...');
function formatTxAmount(row, settings) {
  const prefix = row.type === 'income' ? '+' : row.type === 'transfer' ? '⇄ ' : '-';
  return `${prefix}${money(row.amount, settings)}`;
}

const txIncome = { type: 'income', amount: 50000, description: 'Salary' };
const txExpense = { type: 'expense', amount: 3500, description: 'Grocery' };
const txTransfer = { type: 'transfer', amount: 200000, description: 'Bank Transfer to Broker' };

// With Privacy OFF
assert.strictEqual(formatTxAmount(txIncome, { currency: 'INR', privacy_mode: false }), '+₹50,000.00');
assert.strictEqual(formatTxAmount(txExpense, { currency: 'INR', privacy_mode: false }), '-₹3,500.00');
assert.strictEqual(formatTxAmount(txTransfer, { currency: 'INR', privacy_mode: false }), '⇄ ₹200,000.00');

// With Privacy ON
const maskedIncome = formatTxAmount(txIncome, { currency: 'INR', privacy_mode: true });
const maskedExpense = formatTxAmount(txExpense, { currency: 'INR', privacy_mode: true });
const maskedTransfer = formatTxAmount(txTransfer, { currency: 'INR', privacy_mode: true });

console.log('  Dashboard Income masked:  ', maskedIncome);
console.log('  Dashboard Expense masked: ', maskedExpense);
console.log('  Dashboard Transfer masked:', maskedTransfer);

assert.strictEqual(maskedIncome, '+₹••••••');
assert.strictEqual(maskedExpense, '-₹••••••');
assert.strictEqual(maskedTransfer, '⇄ ₹••••••');
console.log('✓ Test 3 Passed: Dashboard transactions masked with intact directional markers.');

// TEST 4: Y-Axis tick formatting in Privacy Mode
console.log('\n[Test 4] Testing Chart YAxis tick masking...');
function formatYAxisTick(val, settings) {
  if (isPrivacyActive(settings)) return '•••';
  if (val >= 1000000) return `${(val/1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val/1000).toFixed(0)}k`;
  return String(val);
}

assert.strictEqual(formatYAxisTick(3000000, { privacy_mode: false }), '3.0M');
assert.strictEqual(formatYAxisTick(3000000, { privacy_mode: true }), '•••');
console.log('✓ Test 4 Passed: Chart ticks masked when privacy is active.');

console.log('\n====================================================');
console.log('🎉 ALL PRIVACY MODE DEBUG TESTS PASSED! 🎉');
console.log('====================================================');

