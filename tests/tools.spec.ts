import { describe, expect, it, vi } from 'vitest'
import { StripeClient } from '../src/client.js'
import { createTools } from '../src/index.js'

/** Deterministic DNS so the suite never depends on resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function exec() { return { signal: new AbortController().signal } as never }
function map(client = new StripeClient({ lookupImpl: publicLookup, fetchImpl: globalThis.fetch })) { return Object.fromEntries(createTools(client).map(tool => [tool.name, tool])) as Record<string, any> }
describe('Stripe tools', () => {
  it('registers seven read-only tools', () => { expect(Object.keys(map()).sort()).toEqual(['stripe_auth_test', 'stripe_list_customers', 'stripe_list_invoices', 'stripe_list_payment_intents', 'stripe_list_prices', 'stripe_list_products', 'stripe_list_subscriptions']) })
  it('returns structured missing-key values without fetching', async () => { const tools = map(); expect(await tools.stripe_auth_test.execute({}, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('key') }); expect(await tools.stripe_list_customers.execute({}, exec())).toMatchObject({ found: false, reason: expect.stringContaining('key') }); expect(await tools.stripe_list_payment_intents.execute({}, exec())).toMatchObject({ found: false, reason: expect.stringContaining('key') }) })
  it('uses read presentation and renders bounded customer results', async () => { const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'cus_1', email: 'a@example.com', name: 'Alice' }], has_more: false }), { status: 200, headers: { 'content-type': 'application/json' } })); const tools = map(new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test', fetchImpl })); const value = await tools.stripe_list_customers.execute({ limit: 10 }, exec()); expect(value).toMatchObject({ found: true, items: [{ id: 'cus_1' }] }); expect(tools.stripe_list_customers.presentCall!({})).toMatchObject({ card: 'generic', kind: 'read' }); expect(JSON.stringify(tools.stripe_list_customers.output.render({}, { found: true, items: [{ id: 'cus_1', email: 'a@example.com', name: 'Alice' }], hasMore: false, nextCursor: '' }))).toContain('Alice') })
  it('executes and renders bounded price fields', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'price_1', active: true, currency: 'usd', unit_amount: 1200, product: 'prod_1', recurring: { interval: 'month' }, metadata: { secret: 'omit' } }], has_more: false }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const tools = map(new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test', fetchImpl }))
    const value = await tools.stripe_list_prices.execute({ productId: 'prod_1', limit: 10 }, exec())
    expect(value).toMatchObject({ found: true, items: [{ id: 'price_1', productId: 'prod_1', unitAmount: 1200 }] })
    expect(tools.stripe_list_prices.presentCall!({})).toMatchObject({ card: 'generic', kind: 'read' })
    expect(JSON.stringify(tools.stripe_list_prices.output.render({}, value))).toContain('price_1')
  })
})
