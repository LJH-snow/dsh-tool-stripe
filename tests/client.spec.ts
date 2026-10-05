import { describe, expect, it, vi } from 'vitest'
import { StripeClient, StripeError } from '../src/client.js'

/** Deterministic DNS so the suite never depends on resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }) }
function parts(call: unknown[]): [string, RequestInit] { return [String(call[0]), (call[1] ?? {}) as RequestInit] }
describe('StripeClient', () => {
  it('uses Basic authentication and maps account fields', async () => {
    const fetchImpl = vi.fn(async () => response(200, { id: 'acct_1', country: 'US', default_currency: 'usd', business_profile: { name: 'Acme' }, charges_enabled: true, payouts_enabled: false, external_accounts: { data: [{ secret: 'omit' }] } }))
    const client = new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test_secret', fetchImpl })
    await expect(client.authTest()).resolves.toEqual({ id: 'acct_1', country: 'US', defaultCurrency: 'usd', businessName: 'Acme', chargesEnabled: true, payoutsEnabled: false })
    const [, init] = parts(fetchImpl.mock.calls[0]); expect(new Headers(init.headers).get('authorization')).toBe('Basic ' + Buffer.from('rk_test_secret:').toString('base64'))
  })
  it('maps cursor lists and clamps limits', async () => {
    const fetchImpl = vi.fn(async () => response(200, { object: 'list', data: [{ id: 'cus_1', email: 'a@example.com', name: 'Alice', created: 10 }], has_more: true }))
    const client = new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test', fetchImpl })
    const result = await client.listCustomers({ email: 'a@example.com', limit: 999, startingAfter: 'cus_0' })
    expect(result).toMatchObject({ items: [{ id: 'cus_1', email: 'a@example.com' }], hasMore: true, nextCursor: 'cus_1' })
    const [url] = parts(fetchImpl.mock.calls[0]); expect(url).toContain('/v1/customers?'); expect(url).toContain('limit=100'); expect(url).toContain('starting_after=cus_0')
  })
  it('maps products, subscriptions, invoices, and payment intents without raw fields', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(200, { data: [{ id: 'prod_1', name: 'Pro', active: true, default_price: 'price_1', metadata: { secret: 'omit' } }], has_more: false }))
      .mockResolvedValueOnce(response(200, { data: [{ id: 'sub_1', status: 'active', customer: 'cus_1', current_period_start: 1, current_period_end: 2, cancel_at_period_end: false, collection_method: 'charge_automatically', items: { data: [{ price: { currency: 'usd' } }] }, latest_invoice: { client_secret: 'omit' } }], has_more: false }))
      .mockResolvedValueOnce(response(200, { data: [{ id: 'in_1', number: 'INV-1', status: 'open', customer: 'cus_1', amount_due: 100, amount_paid: 0, currency: 'usd', created: 1, due_date: 2, hosted_invoice_url: 'omit' }], has_more: false }))
      .mockResolvedValueOnce(response(200, { data: [{ id: 'pi_1', status: 'succeeded', amount: 100, currency: 'usd', customer: 'cus_1', created: 1, description: 'ok', client_secret: 'omit' }], has_more: false }))
    const client = new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test', fetchImpl })
    await expect(client.listProducts()).resolves.toMatchObject({ items: [{ id: 'prod_1', defaultPriceId: 'price_1' }] })
    await expect(client.listSubscriptions()).resolves.toMatchObject({ items: [{ id: 'sub_1', currency: 'usd' }] })
    await expect(client.listInvoices()).resolves.toMatchObject({ items: [{ id: 'in_1', amountDue: 100 }] })
    await expect(client.listPaymentIntents()).resolves.toMatchObject({ items: [{ id: 'pi_1', amount: 100 }] })
  })
  it('maps prices with safe recurring fields and forwards product filters', async () => {
    const fetchImpl = vi.fn(async () => response(200, {
      data: [{
        id: 'price_1', active: true, currency: 'usd', unit_amount: 1200, unit_amount_decimal: '1200',
        type: 'recurring', product: 'prod_1', nickname: 'Pro monthly', created: 10,
        recurring: { interval: 'month', interval_count: 1 }, billing_scheme: 'per_unit', tax_behavior: 'exclusive', metadata: { secret: 'omit' },
      }], has_more: true,
    }))
    const client = new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test', fetchImpl })
    await expect(client.listPrices({ productId: 'prod_1', active: true, type: 'recurring', currency: 'usd', limit: 999, startingAfter: 'price_0' })).resolves.toMatchObject({
      items: [{ id: 'price_1', productId: 'prod_1', unitAmount: 1200, recurringInterval: 'month', recurringIntervalCount: 1 }], hasMore: true, nextCursor: 'price_1',
    })
    const [url] = parts(fetchImpl.mock.calls[0])
    expect(url).toContain('/v1/prices?')
    expect(url).toContain('product=prod_1')
    expect(url).toContain('active=true')
    expect(url).toContain('currency=usd')
    expect(url).toContain('limit=100')
    expect(url).not.toContain('metadata')
  })
  it('surfaces Stripe errors and Retry-After without leaking the key', async () => {
    const fetchImpl = vi.fn(async () => response(429, { error: { message: 'rate limited', payment_method: 'omit' } }, { 'retry-after': '2', 'request-id': 'req_1' }))
    const client = new StripeClient({ lookupImpl: publicLookup, apiKey: 'rk_test_secret', fetchImpl })
    await expect(client.listProducts()).rejects.toThrow('rate limited')
    await expect(client.listProducts()).rejects.not.toThrow('rk_test_secret')
  })
})

describe('Stripe endpoint security', () => {
  const valid = { apiKey: 'rk_test' }

  it('rejects invalid base URLs without exposing their contents', () => {
    for (const baseUrl of [
      'api.stripe.com',
      'ftp://api.stripe.com',
      'https://key:secret@api.stripe.com',
      'https://api.stripe.com?token=secret',
      'https://api.stripe.com#fragment',
    ]) {
      let error: unknown
      try { new StripeClient({ ...valid, baseUrl }) } catch (thrown) { error = thrown }
      expect(error).toBeInstanceOf(StripeError)
      expect(String(error)).not.toContain('secret')
    }
  })

  it('rejects literal local, private, and reserved addresses before fetch', async () => {
    for (const baseUrl of [
      'http://localhost',
      'http://service.localhost',
      'http://service.local',
      'http://127.0.0.1',
      'http://169.254.169.254',
      'http://0.0.0.0',
      'http://10.0.0.1',
      'http://192.168.1.1',
      'http://192.0.2.1',
      'http://198.18.0.1',
      'http://224.0.0.1',
      'http://192.175.48.1',
      'http://[::1]',
      'http://[::]',
      'http://[fc00::1]',
      'http://[fe80::1]',
      'http://[fec0::1]',
      'http://[2001:db8::1]',
      'http://[2001:3::1]',
      'http://[2001:4:112::1]',
      'http://[2001:30::1]',
      'http://[5f00::1]',
      'http://[100:0:0:1::1]',
      'http://[2620:4f:8000::1]',
      'http://[64:ff9b::7f00:1]',
      'http://[ff02::1]',
    ]) {
      const fetchImpl = vi.fn()
      await expect(new StripeClient({ ...valid, baseUrl, fetchImpl }).authTest()).rejects.toBeInstanceOf(StripeError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('fails closed on blocked, failed, empty, or inconsistent DNS results', async () => {
    for (const lookupImpl of [
      async () => [{ address: '192.168.1.10', family: 4 as const }],
      async () => [{ address: '93.184.216.34', family: 4 as const }, { address: '169.254.169.254', family: 4 as const }],
      async () => { throw new Error('dns failure') },
      async () => [],
      async () => [{ address: '2001:db8::1', family: 4 as const }],
    ]) {
      const fetchImpl = vi.fn()
      await expect(new StripeClient({ ...valid, baseUrl: 'https://stripe.example.test', fetchImpl, lookupImpl }).authTest()).rejects.toBeInstanceOf(StripeError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('allows a public endpoint that resolves to a public address', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await new StripeClient({ ...valid, baseUrl: 'https://stripe.example.test', fetchImpl, lookupImpl: publicLookup }).authTest().catch(() => undefined)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
