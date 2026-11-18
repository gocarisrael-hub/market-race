# Payment (Tranzila)

Ported from Dugri's `server/tranzila.js` and `server/tranzila-sweep.js` (read on 2026-11-18). Code: `src/server/payments/tranzila.ts`, `src/server/payments/sweep.ts`, `src/server/services/payments.ts`. Tranzila only; nothing from PeleCard.

## How a payment works

1. The buyer finishes the order: `POST /api/orders` prices it on the server (setting `prices`, per occasion: `base + perPerson × people`, in agorot) and creates it as `pending_payment`.
2. `POST /api/orders/:manageToken/pay` opens a pay session (one per attempt) with its own token: `m` + environment letter (`p` production, `s` staging, `l` other) + 16 hex. The token goes into the notify URL and into the terminal's user-defined field. The response is the Tranzila iframe URL.
3. The buyer pays on Tranzila's page. Card data never touches us.
4. Tranzila POSTs to `/api/payment/tranzila/notify?t=<token>`. The notify is unsigned, so it only asks for a sweep.
5. The sweep reads the terminal's rows from the Reports API and settles a row only when it is approved (`000`), a `DEBIT` in mode `A` on plan 1 or 3, in shekels, for exactly the session's amount, carries the session's token, has not paid anything else, and the order is still the same purchase as when the window opened. Then: answers already given → the game is built and sent (or goes to review); otherwise the buyer gets the link to answer.
6. Tranzila returns the window to `/pay/done?o=<manageToken>` by POST. The server bounces it to a GET.

The sweep runs at boot, every minute while a pay window opened in the last half hour, every 10 minutes otherwise, and when a notify asks (at most once per 10 seconds).

Owner alerts (email to `OWNER_EMAIL`, WhatsApp to `OWNER_WHATSAPP` as fallback, the log otherwise): an approved row with our token that did not settle (hold, wrong amount, second charge), a charge for an order that changed after its window opened, sweeps failing for 15 minutes and their recovery, and on production a charge with no session token, plus pay windows that stay unpaid.

Company orders: the owner sets the quoted price on a company order in the admin and sends the payment link `/pay/<manageToken>`. It uses the same pay path.

## Variables

| Variable | Value |
|---|---|
| `TRANZILA_TERMINAL` | The charge terminal name (not the `...tok` one) |
| `TRANZILA_APP_KEY` / `TRANZILA_SECRET` | API keys from My Tranzila |
| `TRANZILA_TOKEN_FIELD` | Optional, default `mr_token` |
| `TRANZILA_HANDSHAKE` | `1` only once Tranzila turns the handshake on for the terminal |
| `TRANZILA_APPLE_PAY` / `TRANZILA_GOOGLE_PAY` | `1` once active for this environment's domain |
| `PUBLIC_BASE_URL` | This environment's own origin |
| `PAYMENT_ENV` | Optional; defaults to `APP_ENV` |
| `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`, `REPLY_TO` | Email (Resend; Railway blocks SMTP) |
| `WHATSAPP_ENABLED`, `WHAPI_TOKEN`, `OWNER_WHATSAPP` | WhatsApp (Whapi). Messages to customers also need the setting `whatsapp_to_customers` = true |

With any Tranzila variable missing, card payment is off (`cardEnabled: false` in `/api/shop`).

## One-time setup in My Tranzila (owner)

1. A terminal for this business (not Dugri's).
2. API app key and secret for it.
3. A user-defined text field whose API name is `mr_token`. Without it no charge can be matched to its order: the charge goes through, the order stays unpaid, and the owner is alerted.
4. Automatic accounting documents for iframe transactions, emailed to the buyer.

## Before going live, per environment

1. Staging: set the variables above on staging with the staging domain. The terminal is live, so a staging payment is a real charge. Set a 1 ₪ price for one occasion in the admin settings and pay with your own card. Check that the order shows paid in the admin within a minute and the game email arrives. Also try a declined card (stays unpaid). Refund the test charge in My Tranzila.
2. Confirm against the real transaction what the docs leave open: `amount` in agorot, `txn_type` `DEBIT` and `tranmode` `A` on a normal charge, the `mr_token` field on the row, what a day with no transactions returns, and what a refund looks like. Anything different fails closed (charged, not marked paid, reported).
3. Production: the owner sets the same variables on production.
