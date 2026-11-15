(() => {
"use strict";
const $=id=>document.getElementById(id);
const modes={velqi:"Velqi",nuvex:"Nuvex",qorvex:"Qorvex",zenvor:"Zenvor",vaelix:"Vaelix"};
let latestTokenUsage=null,providerUsage=(()=>{try{return JSON.parse(localStorage.getItem('clyro-provider-usage')||'{}')}catch{return {}}})(),mode=(()=>{try{const saved=localStorage.getItem("project-ai-mode");return ["velqi","nuvex","qorvex","zenvor","vaelix"].includes(saved)?saved:"nuvex"}catch{return "nuvex"}})(),thinkingLevel=(()=>{try{const saved=localStorage.getItem("project-ai-thinking");return ["low","medium","high","super_high"].includes(saved)?saved:"high"}catch{return "high"}})(),authMode="login",chatId=null,chats=[],busy=false,toastTimer=null,renameTarget=null;
const settingsDefaults={animations:true,memory:false,notes:"",pluginWebSearch:true,pluginCalculator:true,pluginGithub:false};
let settings=(()=>{try{return {...settingsDefaults,...JSON.parse(localStorage.getItem("project-ai-settings")||"{}")}}catch{return {...settingsDefaults}}})();
function saveSettings(){try{localStorage.setItem("project-ai-settings",JSON.stringify(settings))}catch{}}
function applySettings(){
 document.body.classList.toggle("no-animations",!settings.animations);
 $("animationsToggle").checked=!!settings.animations;
 $("memoryToggle").checked=!!settings.memory;
 $("memoryNotes").value=settings.notes||"";
 $("pluginWebSearch").checked=!!settings.pluginWebSearch;
 $("pluginCalculator").checked=!!settings.pluginCalculator;
 $("pluginGithub").checked=!!settings.pluginGithub;
}


$("settingsOpen").onclick=()=>{$("settingsDialog").showModal();applySettings()};
$("settingsForm").onsubmit=e=>{
 e.preventDefault();
 settings={animations:$("animationsToggle").checked,memory:$("memoryToggle").checked,notes:$("memoryNotes").value.trim().slice(0,4000),pluginWebSearch:$("pluginWebSearch").checked,pluginCalculator:$("pluginCalculator").checked,pluginGithub:$("pluginGithub").checked};
 saveSettings();applySettings();$("settingsDialog").close();toast("Настройки сохранены");
};
$("settingsDialog").addEventListener("click",e=>{if(e.target===$("settingsDialog"))$("settingsDialog").close()});
applySettings();
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3800)}
async function api(path,options={}) {
 const response=await fetch(path,{credentials:"same-origin",...options});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const err=new Error(data.error||`Ошибка сервера (${response.status})`);err.code=data.code||"PA-999";throw err;}
 return data;
}

function renderTokenUsage(){
 const el=$("limitText");if(!el)return;
 const fmt=n=>Math.max(0,Math.round(Number(n)||0)).toLocaleString("ru-RU");
 const entries=Object.entries(providerUsage);
 const total=entries.reduce((sum,[,v])=>sum+Number(v.tokens||0),0);
 el.textContent="Всего использовано: "+fmt(total)+" токенов";
 el.title="Сумма токенов, сообщённых провайдерами. Не все модели возвращают точную статистику; лимиты провайдеров здесь не отображаются.";
}
function addProviderUsage(usage){
 if(!usage||!usage.providerId)return;
 const amount=Number.isFinite(Number(usage.totalTokensUsed))?Number(usage.totalTokensUsed):
  (Number(usage.promptTokensUsed||0)+Number(usage.completionTokensUsed||0));
 if(!Number.isFinite(amount)||amount<=0)return;
 const key=usage.provider||usage.providerId;
 providerUsage[key]=providerUsage[key]||{tokens:0,requests:0};
 providerUsage[key].tokens+=amount;providerUsage[key].requests++;
 try{localStorage.setItem("clyro-provider-usage",JSON.stringify(providerUsage))}catch{}
 renderTokenUsage();
}

function setAuthMode(value){authMode=value;$("loginTab").classList.toggle("active",value==="login");$("registerTab").classList.toggle("active",value==="register");$("authSubmit").textContent=value==="login"?"Войти":"Создать аккаунт";$("password").autocomplete=value==="login"?"current-password":"new-password";$("authError").textContent=""}
function showAuth(){ $("app").classList.add("hidden");$("authScreen").classList.remove("hidden") }
function showApp(user){$("authScreen").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=user.email||"";loadChats()}
async function checkSession(){try{const data=await api("/api/me");if(data.authenticated)showApp(data.user);else showAuth()}catch(e){showAuth();$("authError").textContent="Не удалось проверить сессию: "+e.message+(e.code?" ["+e.code+"]":"")}}
$("loginTab").onclick=()=>setAuthMode("login");$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").onsubmit=async e=>{e.preventDefault();$("authSubmit").disabled=true;$("authError").textContent="";try{const data=await api(authMode==="login"?"/api/login":"/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});showApp(data.user)}catch(err){$("authError").textContent=err.message}finally{$("authSubmit").disabled=false}};
$("logout").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}catch(e){toast(e.message)}finally{chats=[];chatId=null;showAuth()}};
function closeModelMenu(){$("modelMenu").classList.add("hidden");$("modelPicker").setAttribute("aria-expanded","false")}
function setMode(next){mode=modes[next]?next:"nuvex";try{localStorage.setItem("project-ai-mode",mode)}catch{}$("modeTitle").textContent=modes[mode];document.querySelectorAll("[data-mode]").forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle("selected",active);b.setAttribute("aria-checked",String(active))});document.querySelectorAll("[data-mode-card]").forEach(b=>b.classList.toggle("active",b.dataset.modeCard===mode));closeModelMenu()}
function setThinkingLevel(next){thinkingLevel=["low","medium","high","super_high"].includes(next)?next:"high";try{localStorage.setItem("project-ai-thinking",thinkingLevel)}catch{}const labels={low:"Low",medium:"Medium",high:"High",super_high:"Super High"};$("thinkingCurrent").textContent=labels[thinkingLevel];document.querySelectorAll("[data-thinking]").forEach(b=>{const active=b.dataset.thinking===thinkingLevel;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))})}
document.querySelectorAll("[data-thinking]").forEach(b=>b.addEventListener("click",()=>setThinkingLevel(b.dataset.thinking)));setThinkingLevel(thinkingLevel);
$("modelPicker").addEventListener("click",e=>{e.preventDefault();const open=$("modelMenu").classList.contains("hidden");$("modelMenu").classList.toggle("hidden",!open);$("modelPicker").setAttribute("aria-expanded",String(open))});
$("modelMenu").addEventListener("click",e=>{const option=e.target.closest("[data-mode]");if(!option)return;e.preventDefault();setMode(option.dataset.mode)});
document.addEventListener("click",e=>{if(!e.target.closest(".model-picker-wrap"))closeModelMenu()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModelMenu()});
function renderWelcome(){
 const w=document.createElement("div");w.className="welcome-shell";
 w.innerHTML=`<div class="welcome-hero"><div class="hero-eyebrow"><span class="status-pip"></span> CLYRO INTELLIGENCE SYSTEM</div><div class="hero-copy"><h1>Технологии.<br><span>Без границ.</span></h1><p>Пять интеллектуальных режимов. Один интерфейс. Твои идеи — в движении.</p></div><div class="hero-emblem"><img src="/clyro-logo.svg" alt="CLYRO"></div><div class="hero-foot"><span>BLACK TITANIUM EDITION</span><span>01 — 05 / SELECT YOUR CORE</span></div></div>
 <div class="section-heading"><div><small>ПОДБЕРИ ИНТЕЛЛЕКТ</small><h2>Выбери свою CLYRO</h2></div><span>5 РЕЖИМОВ</span></div>
 <div class="mode-grid">
 <button class="mode-card" data-mode-card="velqi"><img src="/images/velqi.svg" alt=""><span class="mode-card-meta">01 / LITE</span><strong>Velqi</strong><small>Быстрый старт для простых задач</small><span class="mode-card-cta">Выбрать режим ↗</span></button>
 <button class="mode-card" data-mode-card="nuvex"><img src="/images/nuvex.svg" alt=""><span class="mode-card-meta">02 / STANDARD</span><strong>Nuvex</strong><small>Универсальный ежедневный помощник</small><span class="mode-card-cta">Выбрать режим ↗</span></button>
 <button class="mode-card" data-mode-card="qorvex"><img src="/images/qorvex.svg" alt=""><span class="mode-card-meta">03 / THINKING</span><strong>Qorvex</strong><small>Логика, сложные вопросы и идеи</small><span class="mode-card-cta">Выбрать режим ↗</span></button>
 <button class="mode-card" data-mode-card="zenvor"><img src="/images/zenvor.svg" alt=""><span class="mode-card-meta">04 / PRO</span><strong>Zenvor</strong><small>Разработка и глубокий анализ</small><span class="mode-card-cta">Выбрать режим ↗</span></button>
 <button class="mode-card featured" data-mode-card="vaelix"><img src="/images/vaelix.svg" alt=""><span class="mode-card-meta">05 / ULTRA</span><strong>Vaelix</strong><small>Максимальная глубина и проверка</small><span class="mode-card-cta">Выбрать режим ↗</span></button>
 </div>
 <div class="section-heading quick-heading"><div><small>БЫСТРЫЙ СТАРТ</small><h2>С чего начнём?</h2></div></div>
 <div class="prompt-grid"><button data-prompt="Помоги придумать и спланировать новый проект">✧ <span><b>Создать проект</b><small>От идеи до плана</small></span></button><button data-prompt="Напиши и объясни код для моей задачи">⌘ <span><b>Написать код</b><small>Разработка и отладка</small></span></button><button data-prompt="Изучи эту тему и составь понятное объяснение">◈ <span><b>Изучить тему</b><small>Разобраться глубже</small></span></button><button data-prompt="Предложи 10 необычных идей для моего проекта">✳ <span><b>Найти идеи</b><small>Нестандартные решения</small></span></button></div>
 <div class="welcome-note">CLYRO может ошибаться. Проверяй важную информацию.</div>`;
 $("messages").append(w);
 w.querySelectorAll("[data-mode-card]").forEach(b=>b.onclick=()=>{setMode(b.dataset.modeCard);$("message").focus()});
 w.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>{$("message").value=b.dataset.prompt;$("message").focus();$("message").dispatchEvent(new Event("input",{bubbles:true}))});
 setMode(mode);
}
function renderLinkedText(container,content){
 const text=String(content??"");
 const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
 let cursor=0,match;
 while((match=pattern.exec(text))){
  if(match.index>cursor)container.append(document.createTextNode(text.slice(cursor,match.index)));
  const label=match[1]||match[3];
  let href=match[2]||match[3];
  let suffix="";
  if(!match[2]){const trailing=href.match(/[.,!?;:]+$/);if(trailing){suffix=trailing[0];href=href.slice(0,-suffix.length)}}
  try{
   const parsed=new URL(href);
   if(parsed.protocol!=="http:"&&parsed.protocol!=="https:")throw new Error("Unsafe link");
   const link=document.createElement("a");link.href=parsed.href;link.target="_blank";link.rel="noopener noreferrer";link.textContent=label;container.append(link);
   if(suffix)container.append(document.createTextNode(suffix));
  }catch{container.append(document.createTextNode(match[0]))}
  cursor=pattern.lastIndex;
 }
 if(cursor<text.length)container.append(document.createTextNode(text.slice(cursor)));
}
function attachGeneratedImage(element,imageDataURI){
 if(typeof imageDataURI!=="string"||!imageDataURI.startsWith("data:image/"))return;
 const image=document.createElement("img");image.className="generated-image";image.src=imageDataURI;image.alt="Изображение, созданное CLYRO";image.loading="lazy";
 element.append(image);
}
function bubble(content,role,isError=false,sources=[]){const w=document.querySelector(".welcome");if(w)w.remove();const el=document.createElement("article");el.className="message "+role+(isError?" error":"");const textNode=document.createElement("div");textNode.className="message-text";renderLinkedText(textNode,content);el.append(textNode);if(role==="assistant"&&!isError){const tools=document.createElement("div");tools.className="message-tools";const copy=document.createElement("button");copy.type="button";copy.textContent="Копировать";copy.onclick=async()=>{try{await navigator.clipboard.writeText(String(content??""));copy.textContent="Скопировано ✓";setTimeout(()=>copy.textContent="Копировать",1600)}catch{toast("Не удалось скопировать ответ")}};tools.append(copy);el.append(tools)}if(sources.length){const sourceBox=document.createElement("div");sourceBox.className="message-sources";const heading=document.createElement("strong");heading.textContent="Источники";sourceBox.append(heading);sources.forEach((source,index)=>{if(!source||typeof source.url!=="string"||!/^https?:\/\//i.test(source.url))return;const link=document.createElement("a");link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=(index+1)+". "+(source.title||source.url);sourceBox.append(link)});if(sourceBox.querySelector("a"))el.append(sourceBox)}$("messages").append(el);$("messages").scrollTop=$("messages").scrollHeight;return el}
async function loadChats(){try{const data=await api("/api/chats");chats=data.chats||[];renderChatList();if(chatId&&chats.some(c=>c.id===chatId))await openChat(chatId);else{chatId=null;renderMessages([])}}catch(e){toast("Не удалось загрузить историю: "+e.message)}}
function renderChatList(){const list=$("chatList");list.replaceChildren();const q=($("chatSearch")?.value||"").trim().toLowerCase();chats.filter(chat=>(chat.title||"Новый чат").toLowerCase().includes(q)).forEach(chat=>{const row=document.createElement("div");row.className="chat-row"+(chat.id===chatId?" active":"");const open=document.createElement("button");open.className="chat-open";open.textContent=chat.title||"Новый чат";open.title=open.textContent;open.onclick=()=>openChat(chat.id);const actions=document.createElement("div");actions.className="chat-actions";const rename=document.createElement("button");rename.textContent="✎";rename.title="Переименовать";rename.onclick=()=>renameChat(chat);const del=document.createElement("button");del.textContent="×";del.title="Удалить";del.onclick=()=>deleteChat(chat);actions.append(rename,del);row.append(open,actions);list.append(row)})}
function renderMessages(messages){$("messages").replaceChildren();if(!messages.length){renderWelcome();return}messages.forEach(m=>{let content=m.content,sources=[];if(typeof content==="string"&&content.startsWith("{")){try{const saved=JSON.parse(content);if(saved&&saved.__pa_message_v1===true){content=saved.text||"";sources=Array.isArray(saved.sources)?saved.sources:[]}}catch{}}bubble(content,m.role,false,sources)});$("messages").scrollTop=$("messages").scrollHeight}
async function openChat(id){try{const data=await api("/api/chats/"+encodeURIComponent(id));chatId=id;setMode(data.chat.model||"nuvex");renderMessages(data.messages||[]);renderChatList();$("sidebar").classList.remove("open")}catch(e){toast(e.message)}}
$("newChat").onclick=()=>{chatId=null;$("message").value="";renderMessages([]);renderChatList();$("message").focus();$("sidebar").classList.remove("open")};
async function deleteChat(chat){if(!confirm(`Удалить чат «${chat.title}»? Переписка будет удалена.`))return;try{await api("/api/chats/"+encodeURIComponent(chat.id),{method:"DELETE"});chats=chats.filter(c=>c.id!==chat.id);if(chatId===chat.id){chatId=null;renderMessages([])}renderChatList()}catch(e){toast(e.message)}}
function renameChat(chat){renameTarget=chat;$("renameInput").value=chat.title||"";$("renameDialog").showModal();$("renameInput").focus()}
$("renameForm").onsubmit=async e=>{e.preventDefault();if(!renameTarget)return;const title=$("renameInput").value.trim();if(!title)return;try{await api("/api/chats/"+encodeURIComponent(renameTarget.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title})});renameTarget.title=title;renderChatList();$("renameDialog").close()}catch(err){toast(err.message)}};
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
$("chatSearch").addEventListener("input",renderChatList);
let holidayMode=(()=>{try{return localStorage.getItem("clyro-holiday-mode")==="1"}catch{return false}})();
function applyHoliday(){document.body.classList.toggle("new-year",holidayMode);$("holidayToggle").classList.toggle("active",holidayMode);$("holidayToggle").setAttribute("aria-pressed",String(holidayMode));$("holidayToggle").querySelector("span").textContent=holidayMode?"Новогодний режим включён":"Новогодний режим"}
$("holidayToggle").onclick=()=>{holidayMode=!holidayMode;try{localStorage.setItem("clyro-holiday-mode",holidayMode?"1":"0")}catch{}applyHoliday();toast(holidayMode?"Новогодняя атмосфера включена ❄":"Обычный титановый режим включён")};applyHoliday();
$("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit()}});
$("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"});
$("chatForm").onsubmit=async e=>{
 e.preventDefault();if(busy)return;const message=$("message").value.trim();if(!message)return;
 busy=true;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=true);$("send").disabled=true;$("send").textContent="Думаю...";
 bubble(message,"user");
 $("message").value="";$("message").style.height="auto";
 const requestController=new AbortController();
 const requestTimeout=setTimeout(()=>requestController.abort(),100000);
 try{
  const data=await api("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,thinkingLevel,message,chatId,memory:settings.memory?settings.notes:"",enabledPlugins:[settings.pluginWebSearch?"web_search":null,settings.pluginCalculator?"calculator":null,settings.pluginGithub?"github":null].filter(Boolean)}),signal:requestController.signal});
  chatId=data.chatId;
  if(data.tokenUsage){latestTokenUsage=data.tokenUsage;addProviderUsage(data.tokenUsage)}
  const answer=bubble(data.reply,"assistant");
  if(data.imageDataURI)attachGeneratedImage(answer,data.imageDataURI);
  if(Array.isArray(data.sources)&&data.sources.length){const sourceBox=document.createElement("div");sourceBox.className="message-sources";const heading=document.createElement("strong");heading.textContent="Источники";sourceBox.append(heading);data.sources.forEach((source,index)=>{if(!source||typeof source.url!=="string"||!/^https?:\/\//i.test(source.url))return;const link=document.createElement("a");link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=(index+1)+". "+(source.title||source.url);sourceBox.append(link)});if(sourceBox.querySelector("a"))answer.append(sourceBox)}
  const existing=chats.find(c=>c.id===chatId);if(existing){existing.updated_at=Date.now()/1000}else chats.unshift({id:chatId,title:message.slice(0,80)||"Новый чат",model:mode});
  renderChatList();
 }catch(err){const errorText=err.name==="AbortError"?"Превышено время ожидания ответа (100 секунд). Проверь соединение и попробуй ещё раз.":err.message;bubble("Ошибка: "+errorText+(err.code?" ["+err.code+"]":""),"assistant",true);toast(errorText+(err.code?" · "+err.code:""))}
 finally{clearTimeout(requestTimeout);busy=false;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=false);$("send").disabled=false;$("send").textContent="Отправить ↑";$("message").focus()}
};
async function health(){try{const data=await api("/api/health");$("healthDot").className=data.serviceConfigured?"ok":"bad";$("healthText").textContent=data.serviceConfigured?"Сервис готов":"Сервис не настроен"}catch{$("healthDot").className="bad";$("healthText").textContent="Нет соединения · PA-001"}}
renderTokenUsage();setMode(mode);checkSession();health();
})();