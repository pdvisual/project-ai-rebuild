# Project AI — Cloudflare rebuild

Project AI работает на Cloudflare Workers + Workers AI + Static Assets + D1.

## Важно

- Worker: `projectai-rebuild-test`.
- AI binding: `AI` (Cloudflare Workers AI).
- D1: существующая база `project-ai-db`, binding `DB`.
- База уже содержит нужные таблицы. Не запускай миграции и не пересоздавай базу.
- Старый Worker и Pages-проект не удалять.

## AI-провайдеры и автоматическое переключение

Текстовые ответы используют последовательный fallback между пятью провайдерами. Worker пропускает провайдера, если его секрет не настроен, и переходит к следующему при ошибке, лимите, недоступности или пустом ответе.

Порядок и модели:
1. Groq — `openai/gpt-oss-120b`, ключ `GROQ_API_KEY`.
2. Cloudflare Workers AI — `@cf/google/gemma-4-26b-a4b-it`, существующий binding `AI`.
3. SambaNova — `DeepSeek-V3.1`, ключ `SAMBANOVA_API_KEY`.
4. Mistral — `mistral-small-latest`, ключ `MISTRAL_API_KEY`.
5. OpenRouter — `openrouter/free`, ключ `OPENROUTER_API_KEY`.

Добавь внешние ключи как Worker Secrets в Cloudflare Dashboard → Workers & Pages → projectai-rebuild-test → Settings → Variables and Secrets. Не помещай ключи в GitHub, frontend или сообщения чата. Каждый секрет необязателен: не настроенные провайдеры автоматически пропускаются. AI binding `AI` необходимо сохранить: он используется и для Cloudflare text fallback, и для генерации изображений FLUX.

Проверка состояния: GET `/api/health` возвращает список провайдеров и только булев статус `configured`, никогда не раскрывая ключи.

Ограничения бесплатного доступа не суммируются в гарантированную квоту: Groq лимитирует по организации и модели; Workers AI даёт 10 000 Neurons в сутки на аккаунт; SambaNova Free Tier ограничивает запросы и токены по моделям; OpenRouter free-модели имеют общий лимит аккаунта; Mistral Free mode предназначен прежде всего для оценки и прототипирования. Перед открытием публичной регистрации проверь текущие условия каждого провайдера и его квоты в консоли.

Gemini не включён в бесплатную цепочку для пользователей из ЕЭЗ: дополнительные условия Google требуют Paid Services для API-клиентов, доступных пользователям в ЕЭЗ/Швейцарии/Великобритании. Cohere trial key ограничен 1 000 вызовами в месяц и предназначен для оценки; поэтому он не выбран как основной резерв.

Полезные страницы:
- Groq limits: https://console.groq.com/docs/rate-limits
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- SambaNova rate limits: https://docs.sambanova.ai/docs/en/models/rate-limits
- Mistral free mode: https://mistral.ai/news/september-24-release/
- OpenRouter free models: https://openrouter.ai/collections/free-models
- Gemini API terms: https://ai.google.dev/gemini-api/terms

## Установка и запуск

Требуется Node.js 18+.

```bash
npm install
npx wrangler login
npm run dev
```

## Развёртывание

Workers Builds подключён к `pdvisual/project-ai-rebuild`, ветка `main`; новый коммит запускает сборку с командой `npx wrangler deploy`.

Wrangler конфигурация содержит AI binding и использует существующую D1. Не запускай `npm run db:remote` и не выполняй миграции на существующей базе.

## API

- POST `/api/register`
- POST `/api/login`
- POST `/api/logout`
- GET `/api/me`
- GET `/api/chats`
- POST `/api/chats`
- GET `/api/chats/:id`
- PATCH `/api/chats/:id`
- DELETE `/api/chats/:id`
- POST `/api/chat`
- GET `/api/health`

## Безопасность и ограничения

- Пароли хешируются PBKDF2-SHA256 с 100 000 итерациями и случайной солью.
- Сессии используют случайный токен; в D1 хранится только SHA-256 хеш. Cookie: HttpOnly, Secure, SameSite=Lax.
- Каждый чат проверяется на принадлежность текущему пользователю.
- Workers AI вызывается только на сервере через binding `AI`; ключи провайдера в браузер не передаются.
- Sonder: 50 успешных запросов пользователя за скользящие 24 часа.
- Sonder принимает до 4 изображений JPEG/PNG/GIF/WebP, до 4 MiB каждое, общий размер до 16 MiB. Сервер ограничивает размер JSON-тела.
- Изображения в D1 не сохраняются, поэтому они не появятся повторно при открытии старого диалога.
- Плагин веб-поиска временно не подключён к Workers AI и явно сообщает об этом вместо имитации поиска.

## Проверка после публикации

1. Открой `/api/health`: должны быть `database:true` и `serviceConfigured:true`.
2. Войди в Project AI.
3. Отправь тестовое сообщение в Apricity.
4. Проверь анализ изображения в Sonder.
5. Проверь историю чатов.

Не запускай миграции на существующей D1.

## Диагностические коды

| Код | Значение |
|---|---|
| PA-001 | Нет соединения с приложением |
| PA-101 | Некорректный запрос |
| PA-102 | Сессия недействительна |
| PA-103 | Доступ запрещён |
| PA-104 | Ресурс не найден |
| PA-105 | Конфликт данных |
| PA-106 | Слишком большой запрос |
| PA-201 | Workers AI binding не настроен |
| PA-202 | Cloudflare отклонил доступ к Workers AI |
| PA-203 | Исчерпан бесплатный лимит или достигнуто ограничение запросов |
| PA-204 | Workers AI временно недоступен |
| PA-205 | Истекло время ожидания |
| PA-206 | Пустой или отклонённый ответ |
| PA-299 | Общая ошибка обработки |
| PA-301 | Внутренняя ошибка или база данных |
| PA-999 | Не классифицированная ошибка |
