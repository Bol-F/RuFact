# Production-развёртывание RuFact

RuFact состоит из двух сервисов:

1. Next.js на Vercel: интерфейс, проверка входа, общий rate limit, Gemini и
   same-origin `POST /api/analyze`.
2. FastAPI в Docker: загруженная ML-модель и защищённый `POST /predict`.

Браузер никогда не обращается к FastAPI или Gemini напрямую. `ML_API_URL`, JWT,
Redis token и Gemini key остаются только на сервере.

Для узбекского распознанного текста Next.js вызывает только Tavily → Gemini,
без FastAPI или ML JWT. Достаточно существующих серверных `GEMINI_REVIEW_ENABLED=true`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `TAVILY_API_KEY` и production Redis/rate-limit
настроек. Дополнительный узбекский API-ключ или переобучение модели не нужны.
После обновления Next.js на Vercel узбекский маршрут работает независимо от Render;
русскому и английскому статистическому анализу по-прежнему нужен ML-сервис.

Telegram работает в том же Next.js сервисе через `POST /api/telegram/webhook`.
Для активации добавьте `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` и
`TELEGRAM_WEB_APP_URL` в Vercel Production, redeploy, затем зарегистрируйте
webhook. Полная инструкция: [`TELEGRAM.md`](TELEGRAM.md). Бот использует общий
дневной бюджет Tavily/Gemini и проверку по источникам без зависимости от FastAPI.

## Добровольная поддержка: отдельный выпуск и согласование

Код страницы `/support`, Stars API и обработчиков оплаты **не означает разрешение
на деплой или приём реальных платежей**. Оба флага по умолчанию выключены.
Полная инструкция и owner checklist: [SUPPORT.md](SUPPORT.md).

На Vercel используются существующие `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET` (32–256 допустимых символов), Redis REST URL/token и
`RATE_LIMIT_HASH_SECRET`. Новые серверные переменные:

```dotenv
SUPPORT_STARS_ENABLED=false
SUPPORT_WALLET_ENABLED=false
SUPPORT_CONTACT_URL=
SUPPORT_RATE_LIMIT_MAX=5
SUPPORT_RATE_LIMIT_WINDOW_SECONDS=600
SUPPORT_DAILY_LIMIT=100
```

Не добавляйте префикс `NEXT_PUBLIC_`. Контакт должен быть настоящей отслеживаемой
HTTPS-страницей поддержки; он обязателен для включения Stars. Сначала согласуйте
условия Telegram, возрастные/региональные требования, возвраты и сроки хранения;
проверьте feature в изолированной тестовой среде Telegram без реальных денег.
Затем только с отдельным разрешением владельца опубликуйте код с выключенным
флагом, зарегистрируйте обновлённый webhook через
`npm run telegram:setup -- register` и проверьте `status`: должны быть разрешены
`message` и `pre_checkout_query`. До завершения этого checklist не включайте Stars.

Оба пути создания счетов разделяют отдельный дневной бюджет 100 счетов; они не
тратят дневной лимит AI. `/api/support/stars` имеет `maxDuration=20`, существующий
Telegram webhook — 60 секунд; pre-checkout не ждёт анализа/очереди и имеет свой
короткий бюджет (до 2,5 с Redis + 3 с Telegram). Это не гарантирует соблюдение
10-секундного срока Telegram при долгом cold start: измерьте его до выпуска.
Wallet не реализован: установка флага в `true` не активирует криптоплатежи.

## 1. Production-секреты

Создайте два независимых случайных значения длиной не менее 32 байт:

- `ML_API_JWT_SECRET` — одинаковое значение на Vercel и ML-хосте;
- `RATE_LIMIT_HASH_SECRET` — только на Vercel, для необратимого хеширования IP в
  ключах rate limit.

Пример генерации через OpenSSL:

```bash
openssl rand -base64 48
```

Не коммитьте значения и не добавляйте к ним префикс `NEXT_PUBLIC_`. Production
секреты не должны совпадать с development/CI значениями или значениями, которые
когда-либо публиковались.

## 2. ML-сервис в Docker

Образ включает две отдельные модели: русскую `artifacts/model.joblib` и английскую
`artifacts/en/model.joblib`, каждую с SHA-256 manifest. Английская — исследовательское
демо LIAR, 65.059% accuracy на 1,016 отложенных утверждениях; данные не лицензированы
для коммерческого использования. Подробности: [English model card](../ml/ENGLISH_MODEL_CARD.md).
Обычные значения JWT/ML_API_URL менять не нужно. После обновления перезапустите
Render Docker deployment и проверьте `/health`: `availableModels` должен содержать
`ru` и `en`, а `/model-info?language=en` — английскую версию `tfidf-word-char-logreg-en-v2`.
Язык текста определяется отдельно от языка интерфейса. Узбекская модель пока не
обучена; проверка источников работает независимо от доступности ML.

Dockerfile явно задаёт оба пути: `RUFACT_MODEL_PATH=/app/artifacts/model.joblib`
и `RUFACT_EN_MODEL_PATH=/app/artifacts/en/model.joblib`. Это важно при установке
пакета с `--no-editable`: его модуль находится в `site-packages`, а артефакты —
в `/app/artifacts`. Без английского пути новый двухмодельный API не запускается.
В Vercel эти пути добавлять не нужно. Если Render использует старый образ,
переразверните актуальный commit и проверьте `availableModels` в `/health`;
одного `ready: true` от старой русской версии недостаточно.

Репозиторий содержит [`render.yaml`](../render.yaml). Blueprint создаёт Docker-сервис
на бесплатном плане Render во Франкфурте, проверяет `/health` и запускает
автодеплой только после успешных GitHub Checks. При создании Blueprint укажите
`ML_API_JWT_SECRET`; это же значение нужно добавить в Vercel.

Docker Desktop должен быть запущен. Сборка из корня репозитория:

```bash
docker build --pull -t rufact-ml:2 ./ml
```

Для локального production-smoke создайте игнорируемый `.env.production.local`:

```dotenv
ML_API_JWT_SECRET=GENERATED_SHARED_SECRET
RUFACT_ALLOWED_HOSTS=localhost,127.0.0.1
RUFACT_MAX_CONCURRENT_PREDICTIONS=4
RUFACT_PREDICTION_QUEUE_TIMEOUT_MS=500
RUFACT_UVICORN_LIMIT_CONCURRENCY=16
RUFACT_UVICORN_BACKLOG=64
RUFACT_API_DOCS_ENABLED=false
```

Запуск:

```bash
docker run --rm --env-file .env.production.local -p 8000:8000 rufact-ml:2
```

Образ:

- запускается непривилегированным пользователем `rufact`;
- проверяет SHA-256 артефакта модели;
- использует `PORT`, если хостинг задаёт его;
- содержит Docker `HEALTHCHECK`;
- не устанавливает dev-зависимости;
- отключает Uvicorn server banner и production OpenAPI;
- ограничивает HTTP concurrency/backlog, параллельные предсказания и время ожидания очереди.

На контейнерном хостинге задайте:

```dotenv
ML_API_JWT_SECRET=THE_SAME_SHARED_SECRET_AS_VERCEL
RUFACT_ENV=production
RUFACT_ALLOWED_HOSTS=YOUR-ML-HOST
RUFACT_API_DOCS_ENABLED=false
RUFACT_MAX_CONCURRENT_PREDICTIONS=4
RUFACT_PREDICTION_QUEUE_TIMEOUT_MS=500
RUFACT_UVICORN_LIMIT_CONCURRENCY=16
RUFACT_UVICORN_BACKLOG=64
```

Проверка готовности не требует JWT:

```bash
curl https://YOUR-ML-HOST/health
curl https://YOUR-ML-HOST/model-info
```

Ожидаются `ready: true` и `tfidf-word-char-logreg-ru-v2`. `/predict` без
авторизации должен вернуть `401`; если JWT-секрет на ML-хосте отсутствует — `503`.

## 3. Общий rate limit

Публичный rate limit отвечает на вопрос: «сколько дорогих анализов один клиент
может запустить за короткое время?». Без него бот может исчерпать Gemini quota,
загрузить CPU модели и сделать сервис недоступным другим пользователям.

RuFact допускает по умолчанию 10 анализов за 60 секунд, 4 извлечения файла за
60 секунд и 5 интернет-проверок за 300 секунд на хешированный IP. Дополнительно
общий бюджет 30 интернет-проверок в день защищает бесплатную provider quota от
распределённого расходования. В
production Next.js требует общий Upstash Redis. Локальная память используется
только в development, потому что разные serverless-инстансы не разделяют её.

При установке Upstash через Vercel Marketplace переменные называются
`KV_REST_API_URL` и `KV_REST_API_TOKEN`; RuFact принимает их автоматически.
При прямом подключении Upstash используйте имена `UPSTASH_REDIS_REST_URL` и
`UPSTASH_REDIS_REST_TOKEN`.

Создайте Redis в Upstash по
[официальной инструкции](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
и добавьте на Vercel:

```dotenv
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=SERVER_ONLY_STANDARD_TOKEN
RATE_LIMIT_HASH_SECRET=SEPARATE_GENERATED_SECRET
RATE_LIMIT_NAMESPACE=rufact
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_SECONDS=60
EXTRACT_RATE_LIMIT_MAX_REQUESTS=4
EXTRACT_RATE_LIMIT_WINDOW_SECONDS=60
INTERNET_RATE_LIMIT_MAX_REQUESTS=5
INTERNET_RATE_LIMIT_WINDOW_SECONDS=300
INTERNET_DAILY_MAX_REQUESTS=30
```

При превышении лимита API возвращает `429` и `Retry-After`. Если production Redis
или hash secret отсутствует/недоступен, API закрывается с `503`: дорогостоящий
анализ не выполняется без защиты.

## 4. Next.js на Vercel

Подключите GitHub-репозиторий как Next.js-проект и задайте переменные отдельно для
Preview и Production:

```dotenv
ML_API_URL=https://YOUR-ML-HOST/predict
ML_API_JWT_SECRET=THE_SAME_SHARED_SECRET_AS_ML_HOST
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=SERVER_ONLY_STANDARD_TOKEN
RATE_LIMIT_HASH_SECRET=SEPARATE_GENERATED_SECRET
RATE_LIMIT_NAMESPACE=rufact
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_SECONDS=60
EXTRACT_RATE_LIMIT_MAX_REQUESTS=4
EXTRACT_RATE_LIMIT_WINDOW_SECONDS=60
INTERNET_RATE_LIMIT_MAX_REQUESTS=5
INTERNET_RATE_LIMIT_WINDOW_SECONDS=300
INTERNET_DAILY_MAX_REQUESTS=30
GEMINI_REVIEW_ENABLED=false
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
TAVILY_API_KEY=
```

Для интернет-проверки задайте новые server-only `GEMINI_API_KEY` и
`TAVILY_API_KEY`, затем выполните `npm run check:gemini` локально. Ключи не должны
попадать в browser bundle, логи или Git. Gemini выполняет структурированный анализ
результатов, а поиск делает Tavily `basic` (один credit на анализ). Бесплатный план
Tavily даёт 1000 credits в месяц без карты; лимит `30/день` оставляет небольшой
месячный запас, но остаток всё равно нужно контролировать в dashboard.
`ML_API_URL` в production обязан быть HTTPS.

Каждый push создаёт Preview при включённой Git-интеграции. Проверенный Preview
можно продвинуть без повторной сборки:

```bash
vercel promote DEPLOYMENT_URL
```

## 5. Дополнительный Vercel Firewall

Встроенный Redis limiter является обязательной прикладной защитой.
[Vercel Firewall](https://vercel.com/docs/vercel-firewall)
может раньше отсекать массовый трафик и не расходовать function invocations.
Разворачивайте правило постепенно: сначала только логирование, затем Preview, затем
production после проверки реального трафика.

Пример первого безопасного шага для связанного Vercel-проекта:

```bash
vercel firewall rules add "Observe analyze traffic" \
  --condition '{"type":"path","op":"eq","value":"/api/analyze"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action log --yes
vercel firewall diff
```

Публикация firewall draft — отдельное production-действие владельца проекта:

```bash
vercel firewall publish --yes
```

Не переключайте правило сразу на deny/rate-limit без периода наблюдения: общие IP
мобильных операторов и организаций могут объединять много нормальных пользователей.
Автоматическая DDoS-защита Vercel остаётся включённой.

## 6. Проверка перед публикацией

```bash
npm ci
uv sync --project ml --frozen
npm run check
npx playwright install chromium
npm run test:e2e
docker build --pull -t rufact-ml:2 ./ml
```

`npm run check:gemini` добавьте только при включённом Gemini: команда выполняет
реальный запрос и расходует quota.

Полный smoke-test:

1. `/health` ML-хоста показывает `ready: true` и модель v2.
2. `/predict` без JWT отвечает `401`.
3. Desktop и mobile выполняют анализ через `/api/analyze`.
4. Одиннадцатый быстрый анализ одного клиента получает `429` при лимите `10/60s`;
   исчерпание интернет-бюджета не блокирует основной ML-результат.
5. Ответы страниц содержат CSP, HSTS, `X-Content-Type-Options: nosniff` и
   `X-Frame-Options: DENY`.
6. DevTools не показывает JWT secret, Redis token, Gemini key или `ML_API_URL`.
7. `/model` показывает внешнюю accuracy 80,89%, а не confidence отдельного ответа.
8. Ответ Tavily + Gemini содержит поисковый запрос и хотя бы одну кликабельную HTTPS-ссылку.
9. Ошибки внешних сервисов не содержат stack trace или provider response body.

## 7. Наблюдаемость и откат

Минимально отслеживайте:

- доступность и latency `/health`;
- долю `429`, `502` и `503` на `/api/analyze`;
- latency FastAPI и Gemini;
- CPU/RAM контейнера и Gemini quota;
- ошибки JWT-конфигурации без записи самого токена.

Откат Vercel:

```bash
vercel rollback
```

Для ML держите предыдущий immutable image tag и переключайте deployment на него.
JWT-секреты меняйте согласованно: сначала временно поддержите окно развёртывания или
переключите оба сервиса атомарно, иначе все предсказания будут отклоняться.

## 8. Критерии готовности

- CI зелёный на разворачиваемом commit.
- Docker image собирается и становится `healthy` непривилегированным пользователем.
- Runtime dependency audit не находит известных уязвимостей.
- ML доступен только по HTTPS, `/predict` требует JWT.
- Upstash и hash secret настроены в Preview и Production.
- Gemini выключен или его live health-check успешен.
- В Git и browser bundle нет секретов.
- Preview прошёл desktop/mobile smoke-test.
- На `/model` честно указаны 80,89% и ограничения выборки.

Подробная модель угроз находится в [`SECURITY.md`](SECURITY.md).
