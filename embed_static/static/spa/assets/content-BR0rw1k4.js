function r(t){return t.replace(/\r\n/g,`
`).replace(/\r/g,`
`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function i(t,e){return r(t).replace(/@([\w\u4e00-\u9fa5_-]+)/g,'<span class="mention">@$1</span>')}function o(t){const e=new Date(t),n=(new Date().getTime()-e.getTime())/1e3;return n<60?"刚刚":n<3600?`${Math.floor(n/60)}分钟前`:n<86400?`${Math.floor(n/3600)}小时前`:`${e.getMonth()+1}-${e.getDate()} ${String(e.getHours()).padStart(2,"0")}:${String(e.getMinutes()).padStart(2,"0")}`}export{o as f,i as h};
