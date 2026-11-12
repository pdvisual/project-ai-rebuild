const COOKIE_NAME = "pa_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const MAX_JSON_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_TOTAL_IMAGE_BYTES = 16 * 1024 * 1024;

const MODES = {
  force: {
    label: "Force 1.1",
    model: "deepseek-flash",
    prompt: "Ты Force 1.1 — специализированный ИИ-ассистент Project AI по программированию. Твои основные задачи: написание, объяснение, исправление и отладка кода; Lua; Project Visual; поиск ошибок; архитектура программ. Давай точные технические ответы, при необходимости полный рабочий код. Не выдумывай API и функции. Если данных недостаточно — уточни. Отвечай на языке пользователя."
  },
  apricity: {
    label: "Apricity 1.2",
    model: "deepseek-flash",
    prompt: "Ты Apricity 1.2 — универсальный ИИ-ассистент Project AI. Помогай с повседневными вопросами, обучением, объяснениями, анализом и творческими задачами. Будь ясным, полезным и честным. Отвечай на языке пользователя."
  },
  sonder: {
    label: "Sonder 1.3",
    model: "deepseek-flash",
    prompt: "Ты Sonder 1.3 — режим анализа изображений Project AI. Внимательно анализируй приложенные изображения, скриншоты, фотографии, диаграммы и текст на изображениях. Не утверждай, что видишь то, чего нет на изображении. Если изображение не приложено, попроси пользователя добавить его. Отвечай на языке пользователя."
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}
function error(message, status = 400) { return json({ error: message }, status); }
function uuid() { return crypto.randomUUID(); }
function bytesToHex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function base64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g).map(x => parseInt(x, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}
function cookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i >= 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
async function bodyJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_JSON_BYTES) throw new Error("Слишком большой запрос.");
  if (!request.body) throw new Error("Пустое тело запроса.");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error("Слишком большой запрос.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function authUser(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`
  ).bind(tokenHash, now).first();
  return row || null;
}
function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}
function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
async function createSession(userId, env) {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(uuid(), userId, tokenHash, now + SESSION_SECONDS, now).run();
  return token;
}
async function requireUser(request, env) {
  const user = await authUser(request, env);
  return user;
}
async function listChats(user, env) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
      (SELECT content FROM messages WHERE chat_id=c.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_message
     FROM chats c WHERE c.user_id=? ORDER BY c.updated_at DESC LIMIT 100`
  ).bind(user.id).all();
  return results || [];
}
async function ownedChat(chatId, user, env) {
  return env.DB.prepare("SELECT id, title, model FROM chats WHERE id=? AND user_id=?")
    .bind(chatId, user.id).first();
}
function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") throw new Error("Некорректное изображение.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Поддерживаются только JPEG, PNG, WebP и GIF.");
  const binary = atob(match[2]);
  if (binary.length > MAX_IMAGE_BYTES) throw new Error("Каждое изображение должно быть не больше 4 МБ.");
  return { mime: match[1], dataUrl };
}
function safeText(value, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function handleApi(request, env, path) {
  if (!env.DB) return error("На Worker не настроен D1 binding DB.", 500);
  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, database: true, deepseekConfigured: Boolean(env.DEEPSEEK_API_KEY) });
  }
  if (path === "/api/register" && request.method === "POST") {
    let data;
    try { data = await bodyJson(request); } catch { return error("Некорректный запрос или слишком большой JSON."); }
    const email = normalizeEmail(data.email);
    const password = typeof data.password === "string" ? data.password : "";
    const displayName = safeText(data.displayName, 60) || email.split("@")[0];
    if (!validEmail(email)) return error("Укажи корректный адрес электронной почты.");
    if (password.length < 10 || password.length > 128) return error("Пароль должен содержать от 10 до 128 символов.");
    if (!/[A-Za-zА-Яа-я]/.test(password) || !/[0-9]/.test(password)) return error("Добавь в пароль хотя бы одну букву и одну цифру.");
    try {
      const id = uuid();
      const derived = await hashPassword(password);
      await env.DB.prepare(
        "INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)"
      ).bind(id, email, displayName, `${derived.salt}:${derived.hash}`).run();
      const token = await createSession(id, env);
      return json({ user: { id, email, display_name: displayName } }, 201, { "Set-Cookie": cookie(token) });
    } catch (e) {
      console.error("register failed", e);
      if (String(e.message || "").includes("UNIQUE")) return error("Аккаунт с такой почтой уже существует.", 409);
      return error("Не удалось создать аккаунт. Проверь D1 и миграции.", 500);
    }
  }
  if (path === "/api/login" && request.method === "POST") {
    let data;
    try { data = await bodyJson(request); } catch { return error("Некорректный запрос."); }
    const email = normalizeEmail(data.email);
    const password = typeof data.password === "string" ? data.password : "";
    if (!validEmail(email) || !password) return error("Проверь почту и пароль.");
    try {
      const user = await env.DB.prepare(
        "SELECT id, email, display_name, password_hash FROM users WHERE email=? LIMIT 1"
      ).bind(email).first();
      if (!user || typeof user.password_hash !== "string" || !user.password_hash.includes(":")) return error("Неверная почта или пароль.", 401);
      const [salt, expected] = user.password_hash.split(":");
      const actual = await hashPassword(password, salt);
      if (actual.hash !== expected) return error("Неверная почта или пароль.", 401);
      const token = await createSession(user.id, env);
      return json({ user: { id: user.id, email: user.email, display_name: user.display_name } }, 200, { "Set-Cookie": cookie(token) });
    } catch (e) {
      console.error("login failed", e);
      return error("Ошибка входа. Проверь структуру D1.", 500);
    }
  }
  if (path === "/api/logout" && request.method === "POST") {
    const token = getCookie(request, COOKIE_NAME);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
  }
  if (path === "/api/me" && request.method === "GET") {
    const user = await authUser(request, env);
    return json({ authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, display_name: user.display_name } : null });
  }
  const user = await requireUser(request, env);
  if (!user) return error("Сессия истекла. Войди в аккаунт снова.", 401);
  if (path === "/api/chats" && request.method === "GET") return json({ chats: await listChats(user, env) });
  if (path === "/api/chats" && request.method === "POST") {
    let data;
    try { data = await bodyJson(request); } catch { return error("Некорректный запрос."); }
    const title = safeText(data.title, 100) || "Новый чат";
    const model = MODES[data.model] ? data.model : "apricity";
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO chats (id,user_id,title,model,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(id, user.id, title, model, now, now).run();
    return json({ chat: { id, title, model, created_at: now, updated_at: now } }, 201);
  }
  const chatMatch = path.match(/^\/api\/chats\/([a-f0-9-]+)$/i);
  if (chatMatch && request.method === "GET") {
    const chat = await ownedChat(chatMatch[1], user, env);
    if (!chat) return error("Чат не найден.", 404);
    const { results } = await env.DB.prepare(
      "SELECT id, role, content, created_at FROM messages WHERE chat_id=? ORDER BY created_at ASC, rowid ASC LIMIT 500"
    ).bind(chat.id).all();
    return json({ chat, messages: results || [] });
  }
  if (chatMatch && request.method === "PATCH") {
    let data;
    try { data = await bodyJson(request); } catch { return error("Некорректный запрос."); }
    const title = safeText(data.title, 100);
    if (!title) return error("Название не может быть пустым.");
    const result = await env.DB.prepare("UPDATE chats SET title=?, updated_at=unixepoch() WHERE id=? AND user_id=?")
      .bind(title, chatMatch[1], user.id).run();
    if (!result.meta.changes) return error("Чат не найден.", 404);
    return json({ ok: true });
  }
  if (chatMatch && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM chats WHERE id=? AND user_id=?").bind(chatMatch[1], user.id).run();
    if (!result.meta.changes) return error("Чат не найден.", 404);
    return json({ ok: true });
  }
  if (path === "/api/chat" && request.method === "POST") {
    if (!env.DEEPSEEK_API_KEY) return error("На Cloudflare не задан Secret DEEPSEEK_API_KEY.", 503);
    let data;
    try { data = await bodyJson(request); } catch { return error("Не удалось прочитать запрос. Проверь размер сообщения и изображений.", 400); }
    const mode = MODES[data.mode] ? data.mode : "apricity";
    const message = safeText(data.message, 20000);
    let images = [];
    try { images = Array.isArray(data.images) ? data.images.slice(0, MAX_IMAGES).map(decodeDataUrl) : []; }
    catch (e) { return error(e.message, 400); }
    if (mode === "sonder" && images.length === 0) return error("Для Sonder прикрепи хотя бы одно изображение.");
    if (mode !== "sonder" && images.length) return error("Изображения доступны только в режиме Sonder.");
    if (!message && !images.length) return error("Напиши сообщение или прикрепи изображение.");
    if (mode === "sonder" && data.images?.length > MAX_IMAGES) return error("Можно прикрепить не более четырёх изображений.");
    let remaining = mode === "sonder" ? 50 : null;
    if (mode === "sonder") {
      const now = Math.floor(Date.now() / 1000);
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS used FROM usage_events WHERE user_id=? AND model='sonder' AND created_at > ?"
      ).bind(user.id, now - 86400).first();
      if (Number(row?.used || 0) >= 50) return error("Лимит Sonder исчерпан: 50 запросов за скользящие 24 часа. Попробуй позже.", 429);
      remaining = Math.max(0, 50 - Number(row?.used || 0));
    }
    const totalImageBytes = images.reduce((sum, img) => sum + Math.floor((img.dataUrl.length - img.dataUrl.indexOf(",") - 1) * 3 / 4), 0);
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) return error("Общий размер изображений не должен превышать 16 МБ.", 400);
    let chatId = safeText(data.chatId, 80);
    let chat = chatId ? await ownedChat(chatId, user, env) : null;
    if (chatId && !chat) return error("Чат не найден или у тебя нет к нему доступа.", 404);
    const historyRows = await env.DB.prepare(
      "SELECT role, content FROM messages WHERE chat_id=? ORDER BY created_at DESC, rowid DESC LIMIT 20"
    ).bind(chatId).all();
    const history = (historyRows.results || []).reverse().map(m => ({ role: m.role, content: m.content }));
    const userContent = mode === "sonder"
      ? [{ type: "text", text: message || "Проанализируй приложенное изображение подробно." },
         ...images.map(img => ({ type: "image_url", image_url: { url: img.dataUrl, detail: "auto" } }))]
      : message;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const upstream = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODES[mode].model,
          messages: [{ role: "system", content: MODES[mode].prompt }, ...history, { role: "user", content: userContent }],
          max_tokens: 4000,
          stream: false
        }),
        signal: controller.signal
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        console.error("DeepSeek returned", upstream.status, result?.error?.message || "unknown error");
        const friendly = {
          401: "DeepSeek отклонил API-ключ. Проверь Secret DEEPSEEK_API_KEY.",
          402: "Недостаточно средств на балансе DeepSeek.",
          429: "Превышен лимит запросов DeepSeek. Попробуй позже.",
          500: "Внутренняя ошибка DeepSeek. Попробуй позже.",
          503: "DeepSeek временно недоступен."
        };
        return error(friendly[upstream.status] || `Ошибка DeepSeek API: ${result?.error?.message || upstream.status}`, 502);
      }
      const reply = result?.choices?.[0]?.message?.content;
      if (typeof reply !== "string" || !reply.trim()) return error("DeepSeek вернул пустой ответ.", 502);
      const now = Math.floor(Date.now() / 1000);
      const userText = message || "Проанализируй приложенное изображение.";
      if (!chat) {
        chatId = uuid();
        const title = userText.slice(0, 80) || "Анализ изображения";
        await env.DB.prepare("INSERT INTO chats (id,user_id,title,model,created_at,updated_at) VALUES (?,?,?,?,?,?)")
          .bind(chatId, user.id, title, mode, now, now).run();
      }
      await env.DB.batch([
        env.DB.prepare("INSERT INTO messages (id,chat_id,role,content,created_at) VALUES (?,?,?,?,?)")
          .bind(uuid(), chatId, "user", userText, now),
        env.DB.prepare("INSERT INTO messages (id,chat_id,role,content,created_at) VALUES (?,?,?,?,?)")
          .bind(uuid(), chatId, "assistant", reply.trim(), now + 1),
        env.DB.prepare("UPDATE chats SET updated_at=?, model=? WHERE id=? AND user_id=?")
          .bind(now + 1, mode, chatId, user.id)
      ]);
      if (mode === "sonder") {
        await env.DB.prepare("INSERT INTO usage_events (id,user_id,model,created_at) VALUES (?,?,?,?)")
          .bind(uuid(), user.id, "sonder", now + 1).run();
        const usage = await env.DB.prepare(
          "SELECT COUNT(*) AS used FROM usage_events WHERE user_id=? AND model='sonder' AND created_at > ?"
        ).bind(user.id, now + 1 - 86400).first();
        remaining = Math.max(0, 50 - Number(usage?.used || 0));
      }
      return json({ chatId, reply: reply.trim(), remaining, mode });
    } catch (e) {
      console.error("chat handler failed", e);
      if (e.name === "AbortError") return error("DeepSeek не ответил за 90 секунд. Попробуй ещё раз.", 504);
      return error("Не удалось выполнить запрос. Проверь Cloudflare Logs и доступность DeepSeek.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }
  return error("API-маршрут не найден.", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: {
          "Allow": "GET,POST,PATCH,DELETE,OPTIONS",
          "Cache-Control": "no-store"
        }});
      }
      try { return await handleApi(request, env, url.pathname.replace(/\/+$/, "") || "/"); }
      catch (e) {
        console.error("unhandled worker error", e);
        return error("Внутренняя ошибка Worker. Проверь Cloudflare Logs.", 500);
      }
    }
    if (!env.ASSETS) return new Response("Static Assets binding ASSETS is not configured.", { status: 500 });
    return env.ASSETS.fetch(request);
  }
};