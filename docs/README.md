# Документация RuFact

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — production-развёртывание, переменные, Docker,
  Vercel, smoke-test и откат.
- [`TELEGRAM.md`](TELEGRAM.md) — создание бота, безопасный webhook, языки,
  лимиты, обработка повторов и проверка доставки.
- [`SECURITY.md`](SECURITY.md) — модель угроз, JWT, rate limiting, web-защита,
  dependency audit и разбор N+1.
- [`PERFORMANCE.md`](PERFORMANCE.md) — измерения ML/Redis, асинхронное переключение
  изображений, кэширование публичных ресурсов и ограничения размеров потоков.
- [`CLAIM_ANALYSIS_CONTRACT.md`](CLAIM_ANALYSIS_CONTRACT.md) — строгий контракт
  проверки источников через Tavily + Gemini.
- [`ROADMAP_10_DAYS.md`](ROADMAP_10_DAYS.md) — выполненный десятидневный MVP-план.
- [`../ml/MODEL_CARD.md`](../ml/MODEL_CARD.md) — назначение, качество и ограничения
  русской ML-модели.
- [`../ml/ENGLISH_MODEL_CARD.md`](../ml/ENGLISH_MODEL_CARD.md) — английская модель,
  независимый тест, ограничения и права на исследовательские данные LIAR.
- [`../ml/DATASET_RESEARCH.md`](../ml/DATASET_RESEARCH.md) — аудит выбранных и
  отклонённых датасетов.

Авторитетные машинные метрики находятся в `ml/artifacts/metrics.json` (русский)
и `ml/artifacts/en/metrics.json` (английский), а список
всех переменных без секретных значений — в `.env.example`.
