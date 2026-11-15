# Project AI — Cloudflare rebuild

Project AI работает на Cloudflare Workers + Workers AI + Static Assets + D1.

## Важно

- Worker: `projectai-rebuild-test`.
- AI binding: `AI` (Cloudflare Workers AI).
- D1: существующая база `project-ai-db`, binding `DB`.
- База уже содержит нужные таблицы. Не запускай миграции и не пересоздавай базу.
- Старый Worker и Pages-проект не удалять.

## AI-провайдеры и автоматическое переключение

Текстовые ответы идут через единый маршрутизатор:
1. Cloudflare Workers AI — основной провайдер, модель `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, binding `AI`.
2. Groq — резервный провайдер, модель `openai/gpt-oss-120b`, секрет `GROQ_API_KEY`.

Если Cloudflare Workers AI недоступен, маршрутизатор пробует Groq. Если Groq не настроен или исчерпал лимит, основной Cloudflare-провайдер остаётся независимым от него. Для работы основного маршрута достаточно существующего AI binding; внешний ключ Groq больше не обязателен.

AI binding `AI` также используется для генерации изображений FLUX — его необходимо сохранить. Проверка состояния: GET `/api/health` возвращает список провайдеров и только булев статус `configured`, никогда не раскрывая ключи.

Workers AI тарифицируется в Neurons и имеет лимиты аккаунта; это не безлимитный сервис. Проверь текущую квоту и usage в Cloudflare Dashboard.

Полезные страницы:
- Workers AI models: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq limits: https://console.groq.com/docs/rate-limits

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
- Для актуальных фактов и всех запросов COBALT используется отдельный Tavily Search API. Поиск возвращает источники и фрагменты напрямую; ответ формирует текущий основной AI-провайдер (Cloudflare Workers AI) или резервный Groq.

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


## OSMIUM 1.0 и COBALT 1.1

Обе модели используют общий серверный маршрутизатор. Основной провайдер — Cloudflare Workers AI; Groq — резервный. Секрет `GROQ_API_KEY` необязателен. Не удаляй AI binding из `wrangler.jsonc`.

## Независимый веб-поиск Tavily

Создай бесплатный API-ключ в https://tavily.com/ (бесплатный план: 1 000 поисковых кредитов в месяц, без банковской карты) и добавь его в Cloudflare Worker как секрет:

```sh
npx wrangler secret put TAVILY_API_KEY
```

Локально добавь `TAVILY_API_KEY=...` в `.dev.vars`. Не добавляй реальный ключ в Git. Веб-поиск выполняется через Tavily Search API; `include_answer:false` отключает сгенерированный поисковый ответ — CLYRO получает результаты и сам формирует ответ через текущий AI-провайдер.
