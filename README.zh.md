# dsh-tool-stripe

[English](README.md) | [中文](README.zh.md)

这是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的只读 Stripe 账单和客户插件。Agent 可以查看 Account 状态、客户、产品、订阅、发票和 PaymentIntent 结果。

插件严格只读，不创建、更新、取消、退款或删除 Stripe 资源，也不会返回卡片、支付方式、client secret、原始 metadata、发票 PDF 或 hosted invoice URL 字段。

## 安装

~~~sh
npm install @libai168/dsh-tool-stripe
~~~

请使用只读 Restricted API Key，优先使用只包含所需资源权限的 rk_test 或 rk_live Key。能使用受限 Key 时不要使用完整 Secret Key，也不要提交 Key。

## 配置

~~~yaml
- name: '@libai168/dsh-tool-stripe'
  config:
    apiKey: 'rk_test_replace_with_a_read_only_key'
    # baseUrl: 'https://api.stripe.com'
    # apiVersion: '2025-06-30.basil'
    # timeoutMs: 15000
~~~

客户端使用 Stripe Basic 认证和游标分页。完整示例见 [examples/cordis.yml](examples/cordis.yml)。

`baseUrl` 覆盖必须是绝对的 `http://` 或 `https://` 根地址。只允许公网可达主机：localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试网段以及全部 IANA 特殊用途地址段都会被拒绝；DNS 结果包含任一此类地址时会在发出请求前 fail closed。不允许 credentials、query、fragment 或非根路径。

## 工具

| 工具 | 作用 | 权限 |
|---|---|---|
| stripe_auth_test | 验证 Key 并返回安全的 Account 状态字段 | 只读 |
| stripe_list_customers | 按可选邮箱筛选列出客户 | 只读 |
| stripe_list_products | 列出产品，不返回原始 metadata | 只读 |
| stripe_list_prices | 按产品、启用状态、类型或币种列出价格，不返回原始 metadata | 只读 |
| stripe_list_subscriptions | 按客户、状态或价格列出订阅 | 只读 |
| stripe_list_invoices | 列出发票及有界金额/状态字段 | 只读 |
| stripe_list_payment_intents | 列出支付结果，不返回卡片或 client secret | 只读 |

所有列表工具使用 Stripe 游标分页，支持 limit、starting_after 和 ending_before，单页限制在 1-100。

stripe_list_prices 只返回价格的白名单字段：ID、产品、币种、整数/十进制单价、启用状态、类型、周期、计费方案、税行为、昵称和创建时间；不会返回 metadata、tiers、数量变换、支付链接或敏感字段。

## 安全约定

- Key 只放进 Basic Authorization 请求头，不会出现在工具结果、渲染、展示卡片或错误文本中。
- 只读 Restricted API Key 权限是部署边界；插件不会发送任何写请求。
- 规范输出使用字段白名单，排除支付方式、卡片、client secret、source token、原始 metadata、发票 PDF 和 hosted invoice 链接。
- 请求遵循 timeoutMs 和工具 AbortSignal；401/403/429 与服务器错误保持为基础设施错误，不自动重试金融请求。
- 客户姓名、邮箱和账单字段属于外部数据，只在任务需要时使用。


# Inspect price and recurring plan options
stripe_list_prices({ productId: 'prod_id', active: true, type: 'recurring', currency: 'usd', limit: 20 })

## Model Experience

模型可以先调用 stripe_auth_test，再用较小 limit 调用列表工具。下一页应把返回的 nextCursor 作为 starting_after。列表结果包含 ID、状态、时间、金额和币种，不包含支付凭据或原始 Stripe 对象。

## 已知限制和后续工作

- 当前版本只读，不创建或修改账单资源。
- 不读取单独的支付方式、卡片详情、client secret、发票 PDF、hosted invoice URL 或原始事件。
- 每次调用只读取一页，后续页面必须显式传入游标。
- Restricted API Key 可能没有全部资源的权限，Stripe 权限和 Account 范围在插件外配置。

## 开发

~~~sh
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

端点映射和发布检查见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 许可证

[MIT](LICENSE)
