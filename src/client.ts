/** Read-only Stripe REST client with injected fetch for deterministic tests. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface StripeClientOptions { apiKey?: string; baseUrl?: string; apiVersion?: string; timeoutMs?: number; fetchImpl?: typeof fetch; /** Test-only DNS lookup override; production uses node:dns/promises. */ lookupImpl?: LookupImpl }
export interface StripeAccountInfo { id: string; country: string; defaultCurrency: string; businessName: string; chargesEnabled: boolean; payoutsEnabled: boolean }
export interface StripeCustomerInfo { id: string; email: string; name: string; description: string; created: number; currency: string; delinquent: boolean }
export interface StripeProductInfo { id: string; name: string; active: boolean; description: string; defaultPriceId: string; created: number }
export interface StripePriceInfo { id: string; active: boolean; currency: string; unitAmount: number; unitAmountDecimal: string; type: string; productId: string; nickname: string; recurringInterval: string; recurringIntervalCount: number; billingScheme: string; taxBehavior: string; created: number }
export interface StripeSubscriptionInfo { id: string; status: string; customerId: string; currentPeriodStart: number; currentPeriodEnd: number; cancelAtPeriodEnd: boolean; collectionMethod: string; currency: string }
export interface StripeInvoiceInfo { id: string; number: string; status: string; customerId: string; amountDue: number; amountPaid: number; currency: string; created: number; dueDate: number }
export interface StripePaymentIntentInfo { id: string; status: string; amount: number; currency: string; customerId: string; created: number; description: string }
export interface StripeListResult<T> { items: T[]; hasMore: boolean; nextCursor: string }

export class StripeError extends Error { constructor(message: string, public readonly status: number, public readonly requestId?: string, public readonly retryAfter?: number) { super(message); this.name = 'StripeError' } }

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value) }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0 }
function boolValue(value: unknown): boolean { return value === true }
function clamp(value: number | undefined, min: number, max: number, fallback: number): number { return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback }
function mapPage<T>(body: unknown, mapper: (value: unknown) => T): StripeListResult<T> { const raw = record(body); const items = array(raw.data).map(mapper); return { items, hasMore: boolValue(raw.has_more), nextCursor: items.at(-1) && typeof items.at(-1) === 'object' ? stringValue(record(items.at(-1)).id) : '' } }
function mapCustomer(value: unknown): StripeCustomerInfo { const r = record(value); return { id: stringValue(r.id), email: stringValue(r.email), name: stringValue(r.name), description: stringValue(r.description), created: numberValue(r.created), currency: stringValue(r.currency), delinquent: boolValue(r.delinquent) } }
function mapProduct(value: unknown): StripeProductInfo { const r = record(value); const price = record(r.default_price); return { id: stringValue(r.id), name: stringValue(r.name), active: boolValue(r.active), description: stringValue(r.description), defaultPriceId: stringValue(r.default_price) || stringValue(price.id), created: numberValue(r.created) || numberValue(price.created) } }
function mapPrice(value: unknown): StripePriceInfo {
  const r = record(value)
  const recurring = record(r.recurring)
  const product = record(r.product)
  return {
    id: stringValue(r.id),
    active: boolValue(r.active),
    currency: stringValue(r.currency),
    unitAmount: numberValue(r.unit_amount),
    unitAmountDecimal: stringValue(r.unit_amount_decimal),
    type: stringValue(r.type),
    productId: stringValue(r.product) || stringValue(product.id),
    nickname: stringValue(r.nickname),
    recurringInterval: stringValue(recurring.interval),
    recurringIntervalCount: numberValue(recurring.interval_count),
    billingScheme: stringValue(r.billing_scheme),
    taxBehavior: stringValue(r.tax_behavior),
    created: numberValue(r.created),
  }
}
function mapSubscription(value: unknown): StripeSubscriptionInfo { const r = record(value); const items = record(r.items); const first = record(array(items.data)[0]); const price = record(first.price); return { id: stringValue(r.id), status: stringValue(r.status), customerId: stringValue(r.customer), currentPeriodStart: numberValue(r.current_period_start), currentPeriodEnd: numberValue(r.current_period_end), cancelAtPeriodEnd: boolValue(r.cancel_at_period_end), collectionMethod: stringValue(r.collection_method), currency: stringValue(price.currency) }
}
function mapInvoice(value: unknown): StripeInvoiceInfo { const r = record(value); return { id: stringValue(r.id), number: stringValue(r.number), status: stringValue(r.status), customerId: stringValue(r.customer), amountDue: numberValue(r.amount_due), amountPaid: numberValue(r.amount_paid), currency: stringValue(r.currency), created: numberValue(r.created), dueDate: numberValue(r.due_date) }
}
function mapPaymentIntent(value: unknown): StripePaymentIntentInfo { const r = record(value); return { id: stringValue(r.id), status: stringValue(r.status), amount: numberValue(r.amount), currency: stringValue(r.currency), customerId: stringValue(r.customer), created: numberValue(r.created), description: stringValue(r.description) } }

export class StripeClient {
  private readonly apiKey: string; private readonly baseUrl: string; private readonly apiVersion: string | undefined; private readonly timeoutMs: number; private readonly fetchImpl: typeof fetch; private readonly lookupImpl: LookupImpl | undefined
  constructor(private readonly options: StripeClientOptions = {}) { this.apiKey = options.apiKey ?? ''; try { this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://api.stripe.com') } catch (error) { if (error instanceof EndpointSecurityError) throw new StripeError(error.message, 400); throw error }; this.apiVersion = options.apiVersion; this.timeoutMs = options.timeoutMs ?? 15_000; if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('timeoutMs must be a positive finite number.'); this.fetchImpl = options.fetchImpl ?? globalThis.fetch; this.lookupImpl = options.lookupImpl }
  hasKey(): boolean { return this.apiKey.length > 0 }
  async authTest(signal?: AbortSignal): Promise<StripeAccountInfo> { const r = record(await this.request('/v1/account', {}, signal)); return { id: stringValue(r.id), country: stringValue(r.country), defaultCurrency: stringValue(r.default_currency), businessName: stringValue(record(r.business_profile).name) || stringValue(r.business_name), chargesEnabled: boolValue(r.charges_enabled), payoutsEnabled: boolValue(r.payouts_enabled) } }
  async listCustomers(options: { email?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripeCustomerInfo>> { return mapPage(await this.list('/v1/customers', options, signal => this.request(signal.path, {}, signal.signal)), mapCustomer) }
  async listProducts(options: { active?: boolean; type?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripeProductInfo>> { return mapPage(await this.list('/v1/products', options, signal => this.request(signal.path, {}, signal.signal)), mapProduct) }
  async listPrices(options: { productId?: string; active?: boolean; type?: string; currency?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripePriceInfo>> { return mapPage(await this.list('/v1/prices', options, signal => this.request(signal.path, {}, signal.signal)), mapPrice) }
  async listSubscriptions(options: { customerId?: string; status?: string; priceId?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripeSubscriptionInfo>> { return mapPage(await this.list('/v1/subscriptions', options, signal => this.request(signal.path, {}, signal.signal)), mapSubscription) }
  async listInvoices(options: { customerId?: string; status?: string; collectionMethod?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripeInvoiceInfo>> { return mapPage(await this.list('/v1/invoices', options, signal => this.request(signal.path, {}, signal.signal)), mapInvoice) }
  async listPaymentIntents(options: { customerId?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal } = {}): Promise<StripeListResult<StripePaymentIntentInfo>> { return mapPage(await this.list('/v1/payment_intents', options, signal => this.request(signal.path, {}, signal.signal)), mapPaymentIntent) }
  private async list(path: string, options: { email?: string; active?: boolean; type?: string; productId?: string; currency?: string; customerId?: string; status?: string; priceId?: string; collectionMethod?: string; limit?: number; startingAfter?: string; endingBefore?: string; signal?: AbortSignal }, request: (value: { path: string; signal?: AbortSignal }) => Promise<unknown>): Promise<unknown> { const params = new URLSearchParams(); for (const [key, value] of Object.entries({ email: options.email, active: options.active, type: options.type, product: options.productId, currency: options.currency, customer: options.customerId, status: options.status, price: options.priceId, collection_method: options.collectionMethod, limit: clamp(options.limit, 1, 100, 20), starting_after: options.startingAfter, ending_before: options.endingBefore })) if (value !== undefined && value !== '') params.set(key, String(value)); return request({ path: path + '?' + params.toString(), signal: options.signal }) }
  private async request<T = unknown>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> { const controller = new AbortController(); const onAbort = () => controller.abort(signal?.reason); if (signal) { if (signal.aborted) controller.abort(signal.reason); else signal.addEventListener('abort', onAbort, { once: true }) }; const timer = setTimeout(() => controller.abort(new Error('Stripe request timed out after ' + this.timeoutMs + 'ms')), this.timeoutMs); try { const encoded = Buffer.from(this.apiKey + ':').toString('base64'); const headers: Record<string, string> = { accept: 'application/json', authorization: 'Basic ' + encoded }; if (this.apiVersion) headers['Stripe-Version'] = this.apiVersion; const target = new URL(this.baseUrl + path); try { await assertSafeUrl(target, this.lookupImpl) } catch (error) { if (error instanceof EndpointSecurityError) throw new StripeError(error.message, 400); throw error }; const response = await this.fetchImpl(target.toString(), { ...init, headers: { ...headers, ...init.headers }, signal: controller.signal }); let body: unknown; try { body = await response.json() } catch { body = undefined }; if (!response.ok) { const error = record(record(body).error); const retryAfter = Number(response.headers.get('retry-after')); throw new StripeError(stringValue(error.message) || 'Stripe API request failed with status ' + response.status, response.status, response.headers.get('request-id') ?? undefined, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined) }; return body as T } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort) } }
}
