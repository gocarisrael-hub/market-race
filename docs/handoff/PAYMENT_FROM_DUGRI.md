# Payment: copy Tranzila from Dugri

The Dugri codebase already has a working Tranzila integration. Copy it; do not import from Dugri at runtime.

Source (Dugri repo, `gocarisrael-hub/dugri`, folder `server/`):
- `tranzila.js`: the client. Auth headers, `init` (opens a hosted payment), `parseNotify`, `listTransactions`, `verifyTransaction`, session tokens tagged with the environment.
- `tranzila-sweep.js`: settles payments from the terminal's own transaction list (so a lost notify never leaves a paid order unpaid), with alerting.
- `TRANZILA.md`: setup, every Railway variable, go-live checklist. Read it fully.
- In `index.js`, the routes that use it: pay init, the notify endpoint `/api/payment/tranzila/notify`, `tranzilaMatch` / `tranzilaPurchasePaid`, the used-transaction check, and the rate limits on pay init.

What to change when copying:
- Remove everything PeleCard-specific and the `PAYMENT_PROVIDER` switch: this product uses Tranzila only.
- Replace Dugri's collections/orders with this product's `orders` table. Keep: a pay session per attempt, amount verified against the transaction, a transaction can settle only one order, the environment tag on tokens.
- Payment description: the brand's name, not "משחק דוגרי".
- Its own terminal and keys from My Tranzila (ask the owner), its own `PUBLIC_BASE_URL`, and Apple Pay / Google Pay only once activated for the new domain.
- Company orders: the owner creates a payment link for a quoted amount from the admin; it uses the same init path with the order already created.

Copy the related tests too and adapt them; payment is the one area where tests are mandatory before staging.
