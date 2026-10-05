# dsh-tool-stripe

[English](README.md) | [中文](README.zh.md)

A read-only Stripe billing and customer plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). It gives agents bounded visibility into account status, customers, products, subscriptions, invoices, and payment intent outcomes.

The plugin is deliberately read-only. It never creates, updates, cancels, refunds, or deletes Stripe resources, and it does not return card, payment method, client secret, raw metadata, invoice PDF, or hosted invoice URL fields.

## Install

~~~sh
npm install @libai168/dsh-tool-stripe
~~~

Use a Stripe Restricted API Key with read-only permissions, preferably an rk_test or rk_live key scoped to only the resources this deployment needs. Do not use a full secret key when a restricted key is sufficient, and never commit a key.

## Configuration

~~~yaml
- name: '@libai168/dsh-tool-stripe'
  config:
    apiKey: 'rk_test_replace_with_a_read_only_key'
    # baseUrl: 'https://api.stripe.com'
    # apiVersion: '2025-06-30.basil'
    # timeoutMs: 15000
~~~

The client uses Stripe's Basic authentication and cursor pagination. Full example: [examples/cordis.yml](examples/cordis.yml).

The `baseUrl` override must be an absolute `http://` or `https://` root URL. Only publicly reachable hosts are allowed: localhost, loopback, private, link-local, CGNAT, multicast, reserved/documentation/benchmark ranges, and every IANA special-purpose block are rejected, and a hostname whose DNS results contain any such address fails closed before the request is sent. Credentials, query strings, fragments, and non-root paths are not allowed.

## Tools

| Tool | Description | Access |
|---|---|---|
| stripe_auth_test | Verify the key and return safe account status fields | read |
| stripe_list_customers | List customers with an optional email filter | read |
| stripe_list_products | List active/inactive products without raw metadata | read |
| stripe_list_prices | List prices by product, active state, type, or currency without raw metadata | read |
| stripe_list_subscriptions | List subscriptions by customer, status, or price | read |
| stripe_list_invoices | List invoices and bounded amount/status fields | read |
| stripe_list_payment_intents | List payment outcomes without card or client-secret fields | read |

Every list uses Stripe cursor pagination with limit, starting_after, and ending_before. Limits are clamped to 1-100.

stripe_list_prices returns only an allowlisted view of each Price: ID, product, currency, integer/decimal unit amount, active state, type, recurring interval, billing scheme, tax behavior, nickname, and creation time. It does not return metadata, tiers, transform quantities, payment links, or secret fields.

## Security contract

- The API key is sent only in the Basic Authorization header and never appears in tool output, rendering, presentation cards, or error text.
- Read-only Restricted API Key permissions are the deployment boundary. The plugin does not attempt to enforce permissions by sending write requests.
- Canonical outputs use explicit field allowlists. Payment methods, cards, client secrets, source tokens, raw metadata, invoice PDFs, and hosted invoice links are excluded.
- Requests honor timeoutMs and the tool execution AbortSignal. 401/403/429 and server failures remain infrastructure errors so callers can stop or retry deliberately; there is no automatic financial-request retry.
- Customer names/emails and billing fields are external data. Treat them as untrusted context and share only when the task requires it.


# Inspect price and recurring plan options
stripe_list_prices({ productId: 'prod_id', active: true, type: 'recurring', currency: 'usd', limit: 20 })

## Model Experience

The model can start with stripe_auth_test, then use list tools with a small limit. It should pass the nextCursor returned by the previous page as starting_after. List outputs contain identifiers, statuses, timestamps, amounts, and currencies; they do not contain payment credentials or raw Stripe objects.

## Known Limitations and Deferred Work

- This release is read-only and does not create or mutate billing resources.
- It does not retrieve individual payment methods, card details, invoice PDFs, hosted invoice URLs, or raw event payloads.
- Cursor pagination is one page per tool call; callers must explicitly request the next cursor.
- A Restricted API Key may not have access to every resource; Stripe permissions and account scope are configured outside the plugin.

## Development

~~~sh
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

See [DEVELOPMENT.md](DEVELOPMENT.md) for endpoint mapping and release checks.

## License

[MIT](LICENSE)
