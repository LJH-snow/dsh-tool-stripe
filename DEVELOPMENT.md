# dsh-tool-stripe 开发文档

## 1. 项目概览

| 项目 | 说明 |
|---|---|
| 项目名 | dsh-tool-stripe |
| 发布名 | @libai168/dsh-tool-stripe |
| 定位 | DeepSeek Harness 的 Stripe 只读账单插件 |
| 工具数 | 6 |
| 默认 API | https://api.stripe.com |
| 认证 | Restricted API Key + Basic |

## 2. 端点映射

| 工具 | 端点 |
|---|---|
| stripe_auth_test | GET /v1/account |
| stripe_list_customers | GET /v1/customers |
| stripe_list_products | GET /v1/products |
| stripe_list_subscriptions | GET /v1/subscriptions |
| stripe_list_invoices | GET /v1/invoices |
| stripe_list_payment_intents | GET /v1/payment_intents |

所有列表端点使用 limit、starting_after 和 ending_before。插件不引入 stripe-node 运行时依赖，使用 Node fetch 以保持包体和测试边界简单。

## 3. 安全决策

- 首选 rk_test/rk_live Restricted API Key，部署时按资源启用只读权限。
- 客户、发票和支付结果经过字段白名单映射；不返回 card、payment_method、client_secret、metadata 或发票 URL。
- 只实现 GET 列表和 Account 验证；没有 POST、PATCH、DELETE、退款、取消或支付动作。
- 401/403/429 和服务器错误不会被转为成功业务值；调用方可以停止并按 Retry-After 决定是否重试。

## 4. 测试约定

fetchImpl 注入测试覆盖 Basic header、游标 query、所有资源的字段映射、敏感字段裁剪、缺少 API Key、401/403/429 和 AbortSignal。

## 5. 发布前验证

~~~sh
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

npm 包包含 lib、双语 README、DEVELOPMENT、examples 和 LICENSE。发布使用 npm publish --access public。

## endpoint 安全校验（2026-10-05 追加）

`baseUrl` 规范化为 origin + 路径前缀，禁止 credentials、query 与 fragment。每次请求前用 `src/url-security.ts` 做 fail-closed 目标校验：拒绝 localhost/.local 名称、环回、私有、链路本地、CGNAT、组播、保留及全部 IANA 特殊用途地址段，域名 DNS 结果含任一此类地址即拒绝。Stripe 只面向公网 SaaS，该策略**始终生效**。

阻断清单（18 个 IPv4 + 16 个 IPv6）与 IANA 注册表对齐；`src/url-security.ts` 由 `.verify/gen-url-security.mjs` 生成，**不得单独修改**，行为由 `.verify/security-vectors.json` 生成的向量固定。`lookupImpl` 仅作测试注入点，不进入插件配置接口。

测试套件中的 `lookupImpl: publicLookup` 使断言不依赖真实 DNS——此前测试使用默认 `api.stripe.com`，靠实时解析通过，在无 DNS 的环境会 fail-closed 而失败。
