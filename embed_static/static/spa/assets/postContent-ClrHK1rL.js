import{p as l}from"./purify-vendor-Cx4rtWv4.js";const m={ADD_TAGS:["members-only"],ADD_ATTR:["data-locked","data-length"]},c=`
<div class="post-members-only__badge">
  <span class="post-members-only__badge-icon" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  </span>
  <span>登录可见</span>
</div>`,a='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';function p(t){const n=t>0?Math.min(6,Math.max(3,Math.ceil(t/42))):4,r=Array.from({length:n},(d,i)=>{const o=i%3;return`<div class="post-members-only__preview-line${o===1?" post-members-only__preview-line--medium":o===2?" post-members-only__preview-line--short":""}"></div>`}).join(""),e=t>0?`约 ${t} 字的`:"一段";return`
<div class="post-members-only__locked-wrap">
  <div class="post-members-only__badge post-members-only__badge--locked">
    <span class="post-members-only__badge-icon" aria-hidden="true">${a}</span>
    <span>登录可见</span>
  </div>
  <div class="post-members-only__preview" aria-hidden="true">
    ${r}
  </div>
  <div class="post-members-only__gate">
    <div class="post-members-only__gate-icon" aria-hidden="true">${a}</div>
    <p class="post-members-only__gate-title">此处有${e}专属内容</p>
    <p class="post-members-only__gate-desc">作者已将这部分内容设为仅登录用户可见，登录后即可阅读全文。</p>
    <button type="button" class="post-members-only__gate-btn" data-members-login>登录查看</button>
    <span class="post-members-only__gate-alt">还没有账号？<button type="button" class="post-members-only__gate-link" data-members-register>免费注册</button></span>
  </div>
</div>`}function _(t){return t.trim()?(new DOMParser().parseFromString(l.sanitize(t,m),"text/html").body.textContent??"").trim().length===0:!0}function y(t,n){if(!t.trim())return"";const r=new DOMParser().parseFromString(l.sanitize(t,m),"text/html");return r.querySelectorAll("members-only").forEach(e=>{var o;if(e.getAttribute("data-locked")==="true"||!n){const s=parseInt(e.getAttribute("data-length")||"0",10)||0;e.setAttribute("data-locked","true"),e.className="post-members-only post-members-only--locked",e.innerHTML=p(s);return}const i=((o=e.querySelector(".post-members-only__body"))==null?void 0:o.innerHTML)??Array.from(e.childNodes).filter(s=>!(s instanceof Element&&s.classList.contains("post-members-only__badge"))).map(s=>s instanceof Element?s.outerHTML:s.textContent??"").join("");e.className="post-members-only post-members-only--visible",e.innerHTML=`${c}<div class="post-members-only__body">${i}</div>`}),r.body.innerHTML}export{m as P,_ as i,y as r};
