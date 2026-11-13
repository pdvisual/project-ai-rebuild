(() => {
"use strict";
const $=id=>document.getElementById(id);
const modes={force:"Force 1.1",apricity:"Apricity 1.2",sonder:"Sonder 1.3"};
let mode="apricity",authMode="login",chatId=null,chats=[],selectedFiles=[],busy=false,toastTimer=null,renameTarget=null;
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3800)}
async function api(path,options={}) {
 const response=await fetch(path,{credentials:"same-origin",...options});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||`Ошибка сервера (${response.status})`);
 return data;
}
function setAuthMode(value){authMode=value;$("loginTab").classList.toggle("active",value==="login");$("registerTab").classList.toggle("active",value==="register");$("authSubmit").textContent=value==="login"?"Войти":"Создать аккаунт";$("password").autocomplete=value==="login"?"current-password":"new-password";$("authError").textContent=""}
function showAuth(){ $("app").classList.add("hidden");$("authScreen").classList.remove("hidden") }
function showApp(user){$("authScreen").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=user.email||"";loadChats()}
async function checkSession(){try{const data=await api("/api/me");if(data.authenticated)showApp(data.user);else showAuth()}catch(e){showAuth();$("authError").textContent="Не удалось проверить сессию: "+e.message}}
$("loginTab").onclick=()=>setAuthMode("login");$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").onsubmit=async e=>{e.preventDefault();$("authSubmit").disabled=true;$("authError").textContent="";try{const data=await api(authMode==="login"?"/api/login":"/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});showApp(data.user)}catch(err){$("authError").textContent=err.message}finally{$("authSubmit").disabled=false}};
$("logout").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}catch(e){toast(e.message)}finally{chats=[];chatId=null;showAuth()}};
function setMode(next){if(busy)return;mode=modes[next]?next:"apricity";$("modeTitle").textContent=modes[mode];document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("selected",b.dataset.mode===mode));$("attachLabel").classList.toggle("hidden",mode!=="sonder");$("limitText").textContent=mode==="sonder"?"50 запросов за скользящие 24 часа":"";if(mode!=="sonder")clearImages()}
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function renderWelcome(){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcome-icon">✳</div><h1>Чем могу помочь?</h1><p>Выбери режим и начни общение с Project AI.</p>';$("messages").append(w)}
function bubble(content,role,isError=false){const w=document.querySelector(".welcome");if(w)w.remove();const el=document.createElement("article");el.className="message "+role+(isError?" error":"");el.textContent=content;$("messages").append(el);$("messages").scrollTop=$("messages").scrollHeight;return el}
async function loadChats(){try{const data=await api("/api/chats");chats=data.chats||[];renderChatList();if(chatId&&chats.some(c=>c.id===chatId))await openChat(chatId);else{chatId=null;renderMessages([])}}catch(e){toast("Не удалось загрузить историю: "+e.message)}}
function renderChatList(){const list=$("chatList");list.replaceChildren();chats.forEach(chat=>{const row=document.createElement("div");row.className="chat-row"+(chat.id===chatId?" active":"");const open=document.createElement("button");open.className="chat-open";open.textContent=chat.title||"Новый чат";open.title=open.textContent;open.onclick=()=>openChat(chat.id);const actions=document.createElement("div");actions.className="chat-actions";const rename=document.createElement("button");rename.textContent="✎";rename.title="Переименовать";rename.onclick=()=>renameChat(chat);const del=document.createElement("button");del.textContent="×";del.title="Удалить";del.onclick=()=>deleteChat(chat);actions.append(rename,del);row.append(open,actions);list.append(row)})}
function renderMessages(messages){$("messages").replaceChildren();if(!messages.length){renderWelcome();return}messages.forEach(m=>bubble(m.content,m.role));$("messages").scrollTop=$("messages").scrollHeight}
async function openChat(id){try{const data=await api("/api/chats/"+encodeURIComponent(id));chatId=id;setMode(data.chat.model||"apricity");renderMessages(data.messages||[]);renderChatList();$("sidebar").classList.remove("open")}catch(e){toast(e.message)}}
$("newChat").onclick=()=>{chatId=null;clearImages();$("message").value="";renderMessages([]);renderChatList();$("message").focus();$("sidebar").classList.remove("open")};
async function deleteChat(chat){if(!confirm(`Удалить чат «${chat.title}»? Переписка будет удалена.`))return;try{await api("/api/chats/"+encodeURIComponent(chat.id),{method:"DELETE"});chats=chats.filter(c=>c.id!==chat.id);if(chatId===chat.id){chatId=null;renderMessages([])}renderChatList()}catch(e){toast(e.message)}}
function renameChat(chat){renameTarget=chat;$("renameInput").value=chat.title||"";$("renameDialog").showModal();$("renameInput").focus()}
$("renameForm").onsubmit=async e=>{e.preventDefault();if(!renameTarget)return;const title=$("renameInput").value.trim();if(!title)return;try{await api("/api/chats/"+encodeURIComponent(renameTarget.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title})});renameTarget.title=title;renderChatList();$("renameDialog").close()}catch(err){toast(err.message)}};
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
function clearImages(){selectedFiles.forEach(x=>URL.revokeObjectURL(x.url));selectedFiles=[];$("images").value="";$("preview").replaceChildren()}
$("images").onchange=()=>{const files=[...$("images").files];if(selectedFiles.length+files.length>4){toast("Можно прикрепить не более четырёх изображений в одном запросе.");$("images").value="";return}if(selectedFiles.reduce((sum,x)=>sum+x.file.size,0)+files.reduce((sum,x)=>sum+x.size,0)>16*1024*1024){toast("Общий размер изображений не должен превышать 16 МБ.");$("images").value="";return}for(const f of files){if(!["image/jpeg","image/png","image/webp","image/gif"].includes(f.type)){toast("Поддерживаются JPEG, PNG, WebP и GIF.");continue}if(f.size>4*1024*1024){toast("Каждое изображение должно быть не больше 4 МБ.");continue}selectedFiles.push({file:f,url:URL.createObjectURL(f)})}renderPreviews()};
function renderPreviews(){$("preview").replaceChildren();selectedFiles.forEach((item,index)=>{const wrap=document.createElement("div");wrap.className="preview-item";const img=document.createElement("img");img.src=item.url;const btn=document.createElement("button");btn.type="button";btn.textContent="×";btn.onclick=()=>{URL.revokeObjectURL(item.url);selectedFiles.splice(index,1);renderPreviews()};wrap.append(img,btn);$("preview").append(wrap)})}
function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Не удалось прочитать изображение."));reader.readAsDataURL(file)})}
$("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit()}});
$("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"});
$("chatForm").onsubmit=async e=>{
 e.preventDefault();if(busy)return;const message=$("message").value.trim();
 if(!message&&!selectedFiles.length)return;
 if(mode==="sonder"&&!selectedFiles.length){toast("Для Sonder прикрепи изображение.");return}
 if(mode!=="sonder"&&selectedFiles.length){toast("Изображения доступны только в Sonder.");return}
 if(selectedFiles.reduce((sum,x)=>sum+x.file.size,0)>16*1024*1024){toast("Общий размер изображений не должен превышать 16 МБ.");return}
 busy=true;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=true);$("images").disabled=true;$("send").disabled=true;$("send").textContent="Думаю...";
 const displayText=message||(selectedFiles.length?"Проанализируй приложенное изображение.":"");
 bubble(displayText,"user");
 const pending=bubble("Project AI обрабатывает запрос...","assistant");
 $("message").value="";$("message").style.height="auto";
 try{
  const images=await Promise.all(selectedFiles.map(x=>fileData(x.file)));
  const data=await api("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,message,chatId,images})});
  chatId=data.chatId;pending.textContent=data.reply;clearImages();
  if(mode==="sonder"&&data.remaining!==null)$("limitText").textContent=`Осталось запросов: ${data.remaining} из 50`;
  const existing=chats.find(c=>c.id===chatId);if(existing){existing.updated_at=Date.now()/1000}else chats.unshift({id:chatId,title:displayText.slice(0,80)||"Анализ изображения",model:mode});
  renderChatList();
 }catch(err){pending.textContent="Ошибка: "+err.message;pending.classList.add("error");toast(err.message)}
 finally{busy=false;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=false);$("images").disabled=false;$("send").disabled=false;$("send").textContent="Отправить ↑";$("message").focus()}
};
async function health(){try{const data=await api("/api/health");$("healthDot").className=data.geminiConfigured?"ok":"bad";$("healthText").textContent=data.geminiConfigured?"Сервис готов":"Gemini API не настроен"}catch{$("healthDot").className="bad";$("healthText").textContent="Нет соединения"}}
setMode("apricity");checkSession();health();
})();