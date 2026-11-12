# FashionFinder: деплой и настройка

## Как устроено

- Фронт: React + Vite, собирается в `dist/`.
- Сервер: Express (`server/`), раздаёт `dist/` и API `/api/*`. За ним nginx с SSL.
- Ключ Gemini, секрет Clerk и ключи ЮKassa есть только на сервере, в `/opt/fashionfinder/.env`. В сборку фронта попадают только публичные `VITE_*`.

```
server/
  index.ts              запуск, Clerk middleware, раздача dist
  config.ts             переменные окружения
  routes/api.ts         /api/me, /api/analyze, /api/payments, /api/webhooks/yookassa
  services/gemini.ts    вызов Gemini (только сервер)
  services/usage.ts     бесплатные лимиты: аккаунт (Clerk) и гость (cookie + IP)
  pro/tariffs.ts        тарифы 49/149/390 ₽
  pro/entitlements.ts   общая логика PRO: pro_until, защита от двойного продления
  payments/types.ts     общий интерфейс провайдера оплаты
  payments/yookassa.ts  провайдер ЮKassa
  payments/index.ts     реестр провайдеров, выбор по региону, подтверждение платежа
```

### Данные в Clerk

- `publicMetadata.pro_until`: дата окончания PRO (фронт может читать, менять может только сервер).
- `privateMetadata.free_searches_used`: сколько бесплатных поисков потратил аккаунт.
- `privateMetadata.pro_payments`: id применённых платежей, чтобы повторное уведомление не продлило PRO дважды.

Плюс локальный журнал применённых платежей `data/payments-ledger.json`.

### Лимиты

- Гость: 2 поиска, счётчик в подписанной httpOnly-cookie. Плюс потолок 20 поисков в день с одного IP, чтобы очистка cookie не давала безлимит.
- Аккаунт: ещё 2 поиска, счётчик в Clerk, из браузера не сбросить.
- PRO: без лимита, но с ограничением частоты (10 запросов в минуту с IP).
- Если Gemini вернул ошибку, попытка не списывается.
- Фото: JPG, PNG, WEBP, HEIC до 5 МБ.

### Оплата

1. Фронт вызывает `POST /api/payments` с тарифом. Сервер создаёт платёж в ЮKassa и отдаёт ссылку на страницу оплаты.
2. Пользователь платит на странице ЮKassa (карта, СБП, ЮMoney). Данные карты в приложение не попадают.
3. ЮKassa шлёт `payment.succeeded` на `/api/webhooks/yookassa`. Сервер проверяет IP, затем перечитывает платёж через API ЮKassa: статус, сумму, тариф, пользователя. После этого продлевает `pro_until`.
4. После возврата на сайт фронт дополнительно спрашивает `/api/payments/yookassa/:id`. Если вебхук задержался, PRO включится и так. Двойного продления нет.

### Второй провайдер (Polar или аналог)

1. `payments/polar.ts`: реализовать интерфейс `PaymentProvider` из `payments/types.ts`.
2. `payments/index.ts`: добавить в `PROVIDERS` и указать регионы в `PROVIDER_BY_REGION` (например, USA и Europe).
3. `routes/api.ts`: добавить маршрут вебхука по образцу ЮKassa.
4. `pro/tariffs.ts`: цены в нужной валюте.

Логика выдачи PRO (`pro/entitlements.ts`) не меняется.

## Первая установка на сервер (Ubuntu 24.04)

```bash
# Node.js 22, nginx, certbot
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx git

useradd --system --home /opt/fashionfinder --shell /usr/sbin/nologin fashionfinder
mkdir -p /opt/fashionfinder && cd /opt/fashionfinder
# скопировать код (git clone или rsync), затем:
cp .env.example .env && nano .env     # заполнить ключи, PUBLIC_URL=https://DOMAIN
npm ci
npm run build
mkdir -p data && chown -R fashionfinder:fashionfinder data && chown root:fashionfinder .env && chmod 640 .env

cp deploy/fashionfinder.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now fashionfinder

sed "s/DOMAIN/ваш-домен.ru/g" deploy/nginx.conf > /etc/nginx/sites-available/fashionfinder
ln -s /etc/nginx/sites-available/fashionfinder /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
```

Обновление: `git pull && npm ci && npm run build && systemctl restart fashionfinder`.

Логи: `journalctl -u fashionfinder -f`.

Проверка, что Gemini доступен с сервера:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | head -c 300
```

## Clerk

1. В Clerk создать Production instance для домена и добавить DNS-записи, которые покажет Clerk (CNAME для `clerk.`, `accounts.` и почты).
2. В `.env`: `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`, `CLERK_SECRET_KEY=sk_live_...`. После смены publishable key пересобрать фронт (`npm run build`).

## ЮKassa

1. Тестовый магазин: в `.env` `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY` (секрет начинается с `test_`).
2. В личном кабинете ЮKassa, раздел Интеграция, HTTP-уведомления: URL `https://DOMAIN/api/webhooks/yookassa`, событие `payment.succeeded`.
3. Проверка тестовыми картами ЮKassa: https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing
4. Если в магазине включены чеки (54-ФЗ), поставить `YOOKASSA_RECEIPT=true` и при необходимости `YOOKASSA_VAT_CODE`, `YOOKASSA_TAX_SYSTEM_CODE`.
5. Боевой магазин: заменить shopId и секрет на боевые, повторить пункт 2 в боевом кабинете, `systemctl restart fashionfinder`.
