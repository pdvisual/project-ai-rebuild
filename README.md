# Project AI — Cloudflare rebuild

Полная сборка Project AI на Cloudflare Workers + Static Assets + D1.

## Важно перед развёртыванием

- Worker: `projectai-rebuild-test`.
- D1: существующая база `project-ai-db`, binding `DB`.
- База уже содержит нужные таблицы. **Не запускай миграции и не пересоздавай базу.**
- Не удаляй старый Worker или Pages-проект до полной проверки новой версии.

## Установка и запуск

Требуется Node.js 18+.

```bash
npm install
npx wrangler login
npm run dev
```

## Secret Google Gemini

В Cloudflare Dashboard открой Workers & Pages → projectai-rebuild-test → Settings → Variables and Secrets и добавь Secret:

`GEMINI_API_KEY`

Создай API-ключ в Google AI Studio: https://aistudio.google.com/apikey. В Cloudflare добавь его как Secret `GEMINI_API_KEY`. Вставляй ключ только в защищённое поле Cloudflare. Не отправляй его в чат и не добавляй в файлы проекта.

## Развёртывание

```bash
npm run deploy
```

Worker использует Static Assets из папки `public` и существующую D1 через binding `DB`.

Workers Builds подключён к `pdvisual/project-ai-rebuild`, ветка `main`; новый коммит в `main` запускает сборку с командой `npx wrangler deploy`.

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
- Gemini API key доступен только Worker.
- Sonder: 50 успешных запросов пользователя за скользящие 24 часа. Проверка выполняется до вызова модели, событие записывается после успешного ответа и сохранения сообщений. При одновременных запросах возможна небольшая гонка лимита.
- Sonder принимает до 4 изображений JPEG/PNG/GIF/WebP, до 4 MiB каждое, общий размер до 16 MiB. Сервер также ограничивает размер JSON-тела.
- Изображения в D1 не сохраняются, поэтому они не появятся повторно при открытии старого диалога.
- Для публичной регистрации рекомендуется дополнительно включить Cloudflare Turnstile и/или rate limiting.

## Проверка после публикации

1. Открой `/api/health`: должны быть `database:true` и `geminiConfigured:true`.
2. Зарегистрируй тестовый аккаунт.
3. Проверь вход и выход.
4. Отправь сообщение в Apricity, обнови страницу и проверь историю.
5. Проверь переименование и удаление чата.
6. В Sonder приложи изображение и проверь ответ.

Не запускай миграции на существующей D1. Не используй `npm run db:remote`.
