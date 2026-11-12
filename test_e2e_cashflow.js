const { initDb, getDb } = require('./server/db');

async function runDebugTest() {
  console.log("=== STARTING END-TO-END DEBUG TEST ===");
  await initDb();
  const db = getDb();

  // Test 1: Insert Asset
  console.log("\n[Test 1] Testing Asset Insertion via db.prepare.run...");
  const stmtAsset = db.prepare(
    'INSERT INTO assets (name, category, current_value, currency, date_added, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const assetRes = stmtAsset.run('Debug Sahi Broker Test', 'Trading / Brokerage Account', 0, 'INR', '2026-11-11', 'e2e test');
  console.log("Asset insert result:", assetRes);
  if (!assetRes.lastInsertRowid || assetRes.lastInsertRowid <= 0) {
    throw new Error("FAILED: lastInsertRowid is 0 or invalid!");
  }

  const fetchedAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetRes.lastInsertRowid);
  console.log("Fetched created asset:", fetchedAsset);
  if (!fetchedAsset || fetchedAsset.name !== 'Debug Sahi Broker Test') {
    throw new Error("FAILED: could not fetch created asset by ID!");
  }
  console.log("✓ Test 1 PASSED: Asset created and fetched with ID:", fetchedAsset.id);

  // Test 2: Source Account Balance check
  const sourceAccount = db.prepare('SELECT * FROM assets WHERE id = 6').get(); // Kotak
  console.log("\n[Test 2] Kotak Bank balance before transfer:", sourceAccount.current_value);
  const destAccount = fetchedAsset;
  console.log("Destination balance before transfer:", destAccount.current_value);

  // Test 3: Transfer Transaction Execution
  console.log("\n[Test 3] Recording Transfer of ₹200,000 from Kotak to Debug Sahi Broker...");
  const transferAmount = 200000;

  const insertTx = db.transaction(() => {
    // Deduct source
    db.prepare('UPDATE assets SET current_value = ROUND(current_value - ?, 2), updated_at = datetime("now") WHERE id = ?')
      .run(transferAmount, sourceAccount.id);
    // Credit destination
    db.prepare('UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime("now") WHERE id = ?')
      .run(transferAmount, destAccount.id);
    // Insert cashflow record
    const txStmt = db.prepare(
      'INSERT INTO cashflow (type, amount, category, date, description, account_id, to_account_id, adjust_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const txRes = txStmt.run('transfer', transferAmount, 'Trading Account Fund', '2026-11-11', 'E2E Test Transfer', sourceAccount.id, destAccount.id, 1);
    return txRes.lastInsertRowid;
  });

  const txId = insertTx();
  console.log("Transfer recorded with cashflow ID:", txId);

  const kotakAfter = db.prepare('SELECT * FROM assets WHERE id = ?').get(sourceAccount.id);
  const destAfter = db.prepare('SELECT * FROM assets WHERE id = ?').get(destAccount.id);
  const cashflowRow = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(txId);

  console.log("Kotak balance after:", kotakAfter.current_value, `(expected: ${sourceAccount.current_value - transferAmount})`);
  console.log("Destination balance after:", destAfter.current_value, `(expected: ${transferAmount})`);
  console.log("Cashflow record:", cashflowRow);

  if (kotakAfter.current_value !== Math.round((sourceAccount.current_value - transferAmount) * 100) / 100) {
    throw new Error("FAILED: Kotak balance did not decrease correctly!");
  }
  if (destAfter.current_value !== transferAmount) {
    throw new Error("FAILED: Destination balance did not increase correctly!");
  }
  if (!cashflowRow || cashflowRow.type !== 'transfer') {
    throw new Error("FAILED: Cashflow row was not saved!");
  }
  console.log("✓ Test 3 PASSED: Transfer executed atomically with correct balance updates!");

  // Test 4: Rollback / Delete Test (Undo)
  console.log("\n[Test 4] Testing Transfer Rollback (Delete/Undo)...");
  const deleteTx = db.transaction(() => {
    // Reverse balances
    db.prepare('UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime("now") WHERE id = ?')
      .run(transferAmount, sourceAccount.id);
    db.prepare('UPDATE assets SET current_value = ROUND(current_value - ?, 2), updated_at = datetime("now") WHERE id = ?')
      .run(transferAmount, destAccount.id);
    db.prepare('DELETE FROM cashflow WHERE id = ?').run(txId);
  });
  deleteTx();

  const kotakReverted = db.prepare('SELECT * FROM assets WHERE id = ?').get(sourceAccount.id);
  const destReverted = db.prepare('SELECT * FROM assets WHERE id = ?').get(destAccount.id);
  console.log("Kotak reverted balance:", kotakReverted.current_value);
  console.log("Destination reverted balance:", destReverted.current_value);

  if (kotakReverted.current_value !== sourceAccount.current_value) {
    throw new Error("FAILED: Kotak balance was not reverted!");
  }
  console.log("✓ Test 4 PASSED: Reversal/Undo works cleanly!");

  // Clean up test asset
  db.prepare('DELETE FROM assets WHERE id = ?').run(destAccount.id);
  console.log("\nCleaned up debug test asset.");
  console.log("\n=== ALL DEBUG TESTS PASSED SUCCESSFULLY! ===");
}

runDebugTest().catch(e => {
  console.error("\nTEST FAILED WITH ERROR:", e);
  process.exit(1);
});

