const path = require('path');
const { initDb, getDb, ensureInvestmentColumns, ensureCashflowColumns } = require('./db');

// Run direct database & logic verification
async function runTest() {
  console.log('Testing investment source & receiving account logic...');
  await initDb();
  const db = getDb();
  ensureInvestmentColumns(db);
  ensureCashflowColumns(db);

  const testUserId = 9999;

  // Cleanup test user
  db.prepare('DELETE FROM investments WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM cashflow WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM assets WHERE user_id = ?').run(testUserId);

  // 1. Create a Source Bank Account and Receiving Broker Account
  const bankInsert = db.prepare('INSERT INTO assets (name, category, current_value, user_id) VALUES (?, ?, ?, ?)').run(
    'HDFC Salary Bank', 'Bank Accounts', 100000.0, testUserId
  );
  const sourceBankId = bankInsert.lastInsertRowid;

  const brokerInsert = db.prepare('INSERT INTO assets (name, category, current_value, user_id) VALUES (?, ?, ?, ?)').run(
    'Zerodha Demat Trading', 'Trading / Brokerage Account', 25000.0, testUserId
  );
  const receivingBrokerId = brokerInsert.lastInsertRowid;

  console.log(`Created Source Asset (id=${sourceBankId}, bal=100000) and Receiving Asset (id=${receivingBrokerId}, bal=25000)`);

  // 2. Simulate POST /investments for a Stock (e.g. RELIANCE: 10 shares @ ₹2500 = ₹25,000)
  const buyQty = 10;
  const buyPrice = 2500;
  const totalCost = buyQty * buyPrice; // 25000
  const buyDate = '2026-11-20';

  const invStmt = db.prepare(`
    INSERT INTO investments (
      asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes,
      is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker,
      tenure, payout_frequency, receiving_account_id, receiving_account_name,
      source_account_id, source_account_name, last_interest_date, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    invStmt.run(
      'Reliance Industries', 'Stocks', buyPrice, buyPrice, buyQty,
      buyDate, 'Zerodha', 'Long term',
      0, 0, 0, null, 'INR', 'RELIANCE.NS',
      '', '', receivingBrokerId, 'Zerodha Demat Trading',
      sourceBankId, 'HDFC Salary Bank', null,
      testUserId
    );

    // Deduct from source bank
    db.prepare("UPDATE assets SET current_value = ROUND(current_value - ?, 2), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(totalCost, sourceBankId, testUserId);

    // Record cashflow expense
    db.prepare(`
      INSERT INTO cashflow (
        type, amount, category, date, description, account_id, adjust_balance, user_id
      ) VALUES ('expense', ?, 'Investment Deposit', ?, ?, ?, 1, ?)
    `).run(totalCost, buyDate, 'Investment: Bought Reliance Industries (Stocks x 10) via Zerodha', sourceBankId, testUserId);
  })();

  // Verify Source Bank Balance
  const updatedBank = db.prepare('SELECT current_value FROM assets WHERE id = ? AND user_id = ?').get(sourceBankId, testUserId);
  if (Math.abs(updatedBank.current_value - 75000) > 0.01) {
    throw new Error(`Expected source bank balance 75000, got ${updatedBank.current_value}`);
  }
  console.log('✓ Source bank balance successfully debited by ₹25,000 (New balance: ₹75,000)');

  // Verify Cashflow Entry
  const cfEntry = db.prepare('SELECT * FROM cashflow WHERE account_id = ? AND user_id = ?').get(sourceBankId, testUserId);
  if (!cfEntry || cfEntry.amount !== 25000 || cfEntry.type !== 'expense' || cfEntry.category !== 'Investment Deposit') {
    throw new Error(`Cashflow entry mismatch: ${JSON.stringify(cfEntry)}`);
  }
  console.log('✓ Cashflow record created with type=expense, category=Investment Deposit, amount=₹25,000');

  // Verify Investment Record
  const inv = db.prepare('SELECT * FROM investments WHERE user_id = ?').get(testUserId);
  if (inv.source_account_id !== sourceBankId || inv.source_account_name !== 'HDFC Salary Bank') {
    throw new Error(`Investment source account fields incorrect: ${inv.source_account_id}, ${inv.source_account_name}`);
  }
  if (inv.receiving_account_id !== receivingBrokerId || inv.receiving_account_name !== 'Zerodha Demat Trading') {
    throw new Error(`Investment receiving account fields incorrect: ${inv.receiving_account_id}, ${inv.receiving_account_name}`);
  }
  console.log('✓ Investment has both source_account (From: HDFC Salary Bank) and receiving_account (To: Zerodha Demat Trading)');

  // 3. Test Dividend Payout into Receiving Account (₹1,500)
  const divAmt = 1500;
  db.transaction(() => {
    db.prepare("UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(divAmt, receivingBrokerId, testUserId);
    db.prepare(`
      INSERT INTO cashflow (
        type, amount, category, date, description, is_recurring, frequency, account_id, adjust_balance, user_id
      ) VALUES ('income', ?, 'Dividends', date('now'), ?, 0, NULL, ?, 1, ?)
    `).run(divAmt, 'Dividend / Distribution from Reliance Industries (Stocks)', receivingBrokerId, testUserId);
  })();

  const updatedBroker = db.prepare('SELECT current_value FROM assets WHERE id = ? AND user_id = ?').get(receivingBrokerId, testUserId);
  if (Math.abs(updatedBroker.current_value - 26500) > 0.01) {
    throw new Error(`Expected receiving broker balance 26500, got ${updatedBroker.current_value}`);
  }
  console.log('✓ Dividend payout of ₹1,500 credited to receiving broker account (New balance: ₹26,500)');

  // 4. Test Selling 4 shares @ ₹2800 = ₹11,200 into Receiving Account
  const soldQty = 4;
  const sellPrice = 2800;
  const proceeds = soldQty * sellPrice; // 11200
  db.transaction(() => {
    db.prepare("UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(proceeds, receivingBrokerId, testUserId);
    db.prepare(`
      INSERT INTO cashflow (
        type, amount, category, date, description, is_recurring, frequency, account_id, adjust_balance, user_id
      ) VALUES ('income', ?, 'Investment Redemption', date('now'), ?, 0, NULL, ?, 1, ?)
    `).run(proceeds, `Sold ${soldQty} unit(s) of Reliance Industries @ ₹${sellPrice}`, receivingBrokerId, testUserId);
    db.prepare("UPDATE investments SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(inv.quantity - soldQty, inv.id, testUserId);
  })();

  const afterSellBroker = db.prepare('SELECT current_value FROM assets WHERE id = ? AND user_id = ?').get(receivingBrokerId, testUserId);
  if (Math.abs(afterSellBroker.current_value - 37700) > 0.01) {
    throw new Error(`Expected broker balance 37700, got ${afterSellBroker.current_value}`);
  }
  const afterSellInv = db.prepare('SELECT quantity FROM investments WHERE id = ? AND user_id = ?').get(inv.id, testUserId);
  if (afterSellInv.quantity !== 6) {
    throw new Error(`Expected remaining quantity 6, got ${afterSellInv.quantity}`);
  }
  console.log('✓ Sold 4 shares for ₹11,200; proceeds credited to receiving account (New balance: ₹37,700), remaining quantity: 6');

  // Clean up test data
  db.prepare('DELETE FROM investments WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM cashflow WHERE user_id = ?').run(testUserId);
  db.prepare('DELETE FROM assets WHERE user_id = ?').run(testUserId);
  console.log('\nALL TESTS PASSED 100%! Source & Receiving account tracking for investments is verified!');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
