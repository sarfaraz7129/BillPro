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
  const receiptGroups = new Map();
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
      continue;
    }

    if (entry.kind === 'txn' && entry.receipt_group) {
      const groupId = String(entry.receipt_group);
      let receipt = receiptGroups.get(groupId);
      if (!receipt) {
        receipt = {
          kind: 'txn', id: `receipt-${groupId}`, receipt_group: groupId,
          date: entry.date, label: 'Payment received', mode: entry.mode,
          debit: 0, credit: 0, receiptAllocations: []
        };
        receiptGroups.set(groupId, receipt);
        rows.push(receipt);
      }
      receipt.debit = roundLedger(receipt.debit + Number(entry.debit || 0));
      receipt.credit = roundLedger(receipt.credit + Number(entry.credit || 0));
      receipt.receiptAllocations.push({
        document_number: entry.document_number || entry.reference || null,
        unallocated: entry.document_id == null,
        amount: Number(entry.credit || entry.debit || 0),
        notes: entry.notes || ''
      });
      continue;
    }

    rows.push({ ...entry });
  }

  for (const receipt of receiptGroups.values()) {
    const billNumbers = [...new Set(receipt.receiptAllocations.map((allocation) => allocation.document_number).filter(Boolean))];
    receipt.label = billNumbers.length > 1
      ? `Receipt · ${billNumbers.length} bills`
      : billNumbers.length === 1 ? `Receipt · ${billNumbers[0]}` : 'Payment received';
  }

  // Recalculate balances after combining bill-creation payments and collapsing
  // the bill allocations from one receipt into one dated ledger row.
  let running = 0;
  for (const row of rows) {
    if (row.kind === 'opening') running = Number(row.balance || 0);
    else running = roundLedger(running + Number(row.debit || 0) - Number(row.credit || 0));
    row.balance = running;
  }
  // Keep historical balances attached to each row, but show the newest entry first.
  return rows.reverse();
}

module.exports = { prepareLedgerRows };
