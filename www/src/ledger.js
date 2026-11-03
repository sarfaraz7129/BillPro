'use strict';

const roundLedger = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const BILL_KINDS = new Set(['invoice', 'bill', 'sale_return']);
const BILL_CREATION_PAYMENT_NOTE = 'Payment received at bill creation';

function prepareLedgerRows(entries = []) {
  const bills = new Map();
  for (const entry of entries) {
    if (!BILL_KINDS.has(entry.kind)) continue;
    bills.set(String(entry.id), {
      ...entry,
      debit: Number(entry.debit || 0),
      credit: Number(entry.credit || 0),
      initialPayments: []
    });
  }

  const rows = [];
  for (const entry of entries) {
    if (BILL_KINDS.has(entry.kind)) {
      rows.push(bills.get(String(entry.id)));
      continue;
    }

    const isBillCreationPayment = entry.kind === 'txn'
      && String(entry.notes || '').startsWith(BILL_CREATION_PAYMENT_NOTE)
      && entry.document_id != null;
    const bill = isBillCreationPayment ? bills.get(String(entry.document_id)) : null;
    if (bill) {
      bill.debit = roundLedger(bill.debit + Number(entry.debit || 0));
      bill.credit = roundLedger(bill.credit + Number(entry.credit || 0));
      bill.initialPayments.push(entry);
    } else {
      rows.push({ ...entry });
    }
  }

  // Recalculate balances after combining only the amount received at bill creation.
  // Later receipts remain independent entries on their actual transaction dates.
  let running = 0;
  for (const row of rows) {
    if (row.kind === 'opening') running = Number(row.balance || 0);
    else running = roundLedger(running + Number(row.debit || 0) - Number(row.credit || 0));
    row.balance = running;
  }
  return rows;
}

module.exports = { prepareLedgerRows };
