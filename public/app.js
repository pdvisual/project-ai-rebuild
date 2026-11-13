(() => {
"use strict";
const $=id=>document.getElementById(id);
const modes={force:"Force 1.1",apricity:"Apricity 1.2",axiom:"Axiom 2.0",sonder:"Sonder 1.3"};
let mode=(()=>{try{const saved=localStorage.getItem("project-ai-mode");return ["force","apricity","axiom","sonder"].includes(saved)?saved:"apricity"}catch{return "apricity"}})(),authMode="login",chatId=null,chats=[],selectedFiles=[],busy=false,toastTimer=null,renameTarget=null;
const settingsDefaults={animations:true,memory:false,notes:""};
let settings=(()=>{try{return {...settingsDefaults,...JSON.parse(localStorage.getItem("project-ai-settings")||"{}")}}catch{return {...settingsDefaults}}})();
function saveSettings(){try{localStorage.setItem("project-ai-settings",JSON.stringify(settings))}catch{}}
function applySettings(){
 document.body.classList.toggle("no-animations",!settings.animations);
 $("animationsToggle").checked=!!settings.animations;
 $("memoryToggle").checked=!!settings.memory;
 $("memoryNotes").value=settings.notes||"";
}

$("imageGenOpen").onclick=()=>{$("imageGenDialog").showModal();$("imageGenPrompt").focus()};
$("imageGenClose").onclick=()=>$("imageGenDialog").close();
$("imageGenDialog").addEventListener("click",e=>{if(e.target===$("imageGenDialog"))$("imageGenDialog").close()});
$("imageGenForm").onsubmit=async e=>{
 e.preventDefault();if(busy)return;
 const prompt=$("imageGenPrompt").value.trim();if(!prompt)return;
 busy=true;$("imageGenSubmit").disabled=true;$("imageGenOpen").disabled=true;$("imageGenSubmit").textContent="Создаю...";
 $("imageGenDialog").close();bubble(prompt,"user");
 const pending=bubble("Создаю изображение. Это может занять немного времени...","assistant");
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
 try{
  const data=await api("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,aspectRatio:$("imageGenRatio").value,chatId}),signal:controller.signal});
  chatId=data.chatId;pending.remove();bubble("Готово. Вот созданное изображение.","assistant",false,[data.image]);$("imageGenPrompt").value="";
  const existing=chats.find(c=>c.id===chatId);if(existing){existing.updated_at=Date.now()/1000}else chats.unshift({id:chatId,title:("Изображение: "+prompt).slice(0,80),model:"apricity"});
  renderChatList();
 }catch(err){
  const message=err.name==="AbortError"?"Превышено время ожидания генерации. Попробуй ещё раз.":err.message;
  pending.querySelector(".message-text").textContent="Ошибка: "+message+(err.code?" ["+err.code+"]":"");pending.classList.add("error");toast(message+(err.code?" · "+err.code:""));
 }finally{
  clearTimeout(timeout);busy=false;$("imageGenSubmit").disabled=false;$("imageGenOpen").disabled=false;$("imageGenSubmit").textContent="Создать изображение";
 }
};

$("settingsOpen").onclick=()=>{$("settingsDialog").showModal();applySettings()};
$("settingsForm").onsubmit=e=>{
 e.preventDefault();
 settings={animations:$("animationsToggle").checked,memory:$("memoryToggle").checked,notes:$("memoryNotes").value.trim().slice(0,4000)};
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
function setAuthMode(value){authMode=value;$("loginTab").classList.toggle("active",value==="login");$("registerTab").classList.toggle("active",value==="register");$("authSubmit").textContent=value==="login"?"Войти":"Создать аккаунт";$("password").autocomplete=value==="login"?"current-password":"new-password";$("authError").textContent=""}
function showAuth(){ $("app").classList.add("hidden");$("authScreen").classList.remove("hidden") }
function showApp(user){$("authScreen").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=user.email||"";loadChats()}
async function checkSession(){try{const data=await api("/api/me");if(data.authenticated)showApp(data.user);else showAuth()}catch(e){showAuth();$("authError").textContent="Не удалось проверить сессию: "+e.message+(e.code?" ["+e.code+"]":"")}}
$("loginTab").onclick=()=>setAuthMode("login");$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").onsubmit=async e=>{e.preventDefault();$("authSubmit").disabled=true;$("authError").textContent="";try{const data=await api(authMode==="login"?"/api/login":"/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("email").value.trim(),password:$("password").value})});showApp(data.user)}catch(err){$("authError").textContent=err.message}finally{$("authSubmit").disabled=false}};
$("logout").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}catch(e){toast(e.message)}finally{chats=[];chatId=null;showAuth()}};
function closeModelMenu(){$("modelMenu").classList.add("hidden");$("modelPicker").setAttribute("aria-expanded","false")}
function setMode(next){mode=modes[next]?next:"apricity";try{localStorage.setItem("project-ai-mode",mode)}catch{}$("modeTitle").textContent=modes[mode];document.querySelectorAll("[data-mode]").forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle("selected",active);b.setAttribute("aria-checked",String(active))});$("attachLabel").classList.remove("hidden");$("limitText").textContent=mode==="sonder"?"50 запросов за скользящие 24 часа":"";closeModelMenu()}
$("modelPicker").addEventListener("click",e=>{e.preventDefault();const open=$("modelMenu").classList.contains("hidden");$("modelMenu").classList.toggle("hidden",!open);$("modelPicker").setAttribute("aria-expanded",String(open))});
$("modelMenu").addEventListener("click",e=>{const option=e.target.closest("[data-mode]");if(!option)return;e.preventDefault();setMode(option.dataset.mode)});
document.addEventListener("click",e=>{if(!e.target.closest(".model-picker-wrap"))closeModelMenu()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModelMenu()});
function renderWelcome(){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcome-icon">P</div><h1>Чем могу помочь?</h1><p>Выбери режим и начни общение с Project AI.</p>';$("messages").append(w)}
function bubble(content,role,isError=false,images=[]){const w=document.querySelector(".welcome");if(w)w.remove();const el=document.createElement("article");el.className="message "+role+(isError?" error":"");const textNode=document.createElement("div");textNode.className="message-text";textNode.textContent=content;el.append(textNode);if(images.length){const gallery=document.createElement("div");gallery.className="message-images";images.forEach(src=>{const img=document.createElement("img");img.src=src;img.alt="Прикреплённое изображение";img.loading="lazy";img.addEventListener("click",()=>{const viewer=document.createElement("dialog");viewer.className="image-viewer";const full=document.createElement("img");full.src=src;full.alt="Просмотр изображения";viewer.append(full);viewer.addEventListener("click",()=>viewer.close());viewer.addEventListener("close",()=>viewer.remove());document.body.append(viewer);viewer.showModal()});gallery.append(img)});el.append(gallery)}$("messages").append(el);$("messages").scrollTop=$("messages").scrollHeight;return el}
async function loadChats(){try{const data=await api("/api/chats");chats=data.chats||[];renderChatList();if(chatId&&chats.some(c=>c.id===chatId))await openChat(chatId);else{chatId=null;renderMessages([])}}catch(e){toast("Не удалось загрузить историю: "+e.message)}}
function renderChatList(){const list=$("chatList");list.replaceChildren();chats.forEach(chat=>{const row=document.createElement("div");row.className="chat-row"+(chat.id===chatId?" active":"");const open=document.createElement("button");open.className="chat-open";open.textContent=chat.title||"Новый чат";open.title=open.textContent;open.onclick=()=>openChat(chat.id);const actions=document.createElement("div");actions.className="chat-actions";const rename=document.createElement("button");rename.textContent="✎";rename.title="Переименовать";rename.onclick=()=>renameChat(chat);const del=document.createElement("button");del.textContent="×";del.title="Удалить";del.onclick=()=>deleteChat(chat);actions.append(rename,del);row.append(open,actions);list.append(row)})}
function renderMessages(messages){$("messages").replaceChildren();if(!messages.length){renderWelcome();return}messages.forEach(m=>{let content=m.content,images=[];if(typeof content==="string"&&content.startsWith("{")){try{const saved=JSON.parse(content);if(saved&&saved.__pa_message_v1===true){content=saved.text||"";images=Array.isArray(saved.images)?saved.images:[]}}catch{}}bubble(content,m.role,false,images)});$("messages").scrollTop=$("messages").scrollHeight}
async function openChat(id){try{const data=await api("/api/chats/"+encodeURIComponent(id));chatId=id;setMode(data.chat.model||"apricity");renderMessages(data.messages||[]);renderChatList();$("sidebar").classList.remove("open")}catch(e){toast(e.message)}}
$("newChat").onclick=()=>{chatId=null;clearImages();$("message").value="";renderMessages([]);renderChatList();$("message").focus();$("sidebar").classList.remove("open")};
async function deleteChat(chat){if(!confirm(`Удалить чат «${chat.title}»? Переписка будет удалена.`))return;try{await api("/api/chats/"+encodeURIComponent(chat.id),{method:"DELETE"});chats=chats.filter(c=>c.id!==chat.id);if(chatId===chat.id){chatId=null;renderMessages([])}renderChatList()}catch(e){toast(e.message)}}
function renameChat(chat){renameTarget=chat;$("renameInput").value=chat.title||"";$("renameDialog").showModal();$("renameInput").focus()}
$("renameForm").onsubmit=async e=>{e.preventDefault();if(!renameTarget)return;const title=$("renameInput").value.trim();if(!title)return;try{await api("/api/chats/"+encodeURIComponent(renameTarget.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title})});renameTarget.title=title;renderChatList();$("renameDialog").close()}catch(err){toast(err.message)}};
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
function clearImages(){selectedFiles.forEach(x=>URL.revokeObjectURL(x.url));selectedFiles=[];$("images").value="";$("preview").replaceChildren()}
$("images").onchange=()=>{const files=[...$("images").files];if(selectedFiles.length+files.length>4){toast("Можно прикрепить не более четырёх изображений в одном запросе.");$("images").value="";return}if(selectedFiles.reduce((sum,x)=>sum+x.file.size,0)+files.reduce((sum,x)=>sum+x.size,0)>16*1024*1024){toast("Общий размер изображений не должен превышать 16 МБ.");$("images").value="";return}for(const f of files){if(!["image/jpeg","image/png","image/webp","image/gif"].includes(f.type)){toast("Поддерживаются JPEG, PNG, WebP и GIF.");continue}if(f.size>4*1024*1024){toast("Каждое изображение должно быть не больше 4 МБ.");continue}selectedFiles.push({file:f,url:URL.createObjectURL(f)})}renderPreviews()};
function renderPreviews(){$("preview").replaceChildren();selectedFiles.forEach((item,index)=>{const wrap=document.createElement("div");wrap.className="preview-item";const img=document.createElement("img");img.src=item.url;const btn=document.createElement("button");btn.type="button";btn.textContent="×";btn.onclick=()=>{URL.revokeObjectURL(item.url);selectedFiles.splice(index,1);renderPreviews()};wrap.append(img,btn);$("preview").append(wrap)})}
async function fileData(file){const objectUrl=URL.createObjectURL(file);try{const image=new Image();image.src=objectUrl;await image.decode();const scale=Math.min(1,1440/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);for(const quality of [.82,.72,.62,.52,.42]){const data=canvas.toDataURL("image/jpeg",quality);if(data.length<=300000)return data}throw new Error("Фото слишком большое даже после сжатия. Выбери изображение меньшего размера.")}finally{URL.revokeObjectURL(objectUrl)}}
$("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit()}});
$("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"});
$("chatForm").onsubmit=async e=>{
 e.preventDefault();if(busy)return;const message=$("message").value.trim();
 if(!message&&!selectedFiles.length)return;
 if(mode==="sonder"&&!selectedFiles.length){toast("Для Sonder прикрепи изображение.");return}
 if(selectedFiles.reduce((sum,x)=>sum+x.file.size,0)>16*1024*1024){toast("Общий размер изображений не должен превышать 16 МБ.");return}
 busy=true;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=true);$("images").disabled=true;$("send").disabled=true;$("send").textContent="Думаю...";
 const displayText=message||(selectedFiles.length?"Проанализируй приложенное изображение.":"");
 let pending=null;
 $("message").value="";$("message").style.height="auto";
 const requestController=new AbortController();
 const requestTimeout=setTimeout(()=>requestController.abort(),100000);
 try{
  const images=await Promise.all(selectedFiles.map(x=>fileData(x.file)));
  bubble(displayText,"user",false,images);
  pending=bubble("Project AI обрабатывает запрос...","assistant");
  const data=await api("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,message,chatId,images,memory:settings.memory?settings.notes:""}),signal:requestController.signal});
  chatId=data.chatId;pending.querySelector(".message-text").textContent=data.reply;clearImages();
  if(mode==="sonder"&&data.remaining!==null)$("limitText").textContent=`Осталось запросов: ${data.remaining} из 50`;
  const existing=chats.find(c=>c.id===chatId);if(existing){existing.updated_at=Date.now()/1000}else chats.unshift({id:chatId,title:displayText.slice(0,80)||"Анализ изображения",model:mode});
  renderChatList();
 }catch(err){if(!pending)pending=bubble("Не удалось подготовить изображение.","assistant",true);const message=err.name==="AbortError"?"Превышено время ожидания ответа (100 секунд). Проверь соединение и попробуй ещё раз.":err.message;pending.textContent="Ошибка: "+message+(err.code?" ["+err.code+"]":"");pending.classList.add("error");toast(message+(err.code?" · "+err.code:""))}
 finally{clearTimeout(requestTimeout);busy=false;document.querySelectorAll("[data-mode]").forEach(b=>b.disabled=false);$("images").disabled=false;$("send").disabled=false;$("send").textContent="Отправить ↑";$("message").focus()}
};
async function health(){try{const data=await api("/api/health");$("healthDot").className=data.serviceConfigured?"ok":"bad";$("healthText").textContent=data.serviceConfigured?"Сервис готов":"Сервис не настроен"}catch{$("healthDot").className="bad";$("healthText").textContent="Нет соединения · PA-001"}}
setMode(mode);checkSession();health();
})();