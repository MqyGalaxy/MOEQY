// build time:Sun Dec 17 2023 15:47:14 GMT+0800 (中国标准时间)
var e=document.getElementById("returnTop");e.style.visibility="hidden";e.style.opacity="0";function t(){var t=document.body.scrollHeight>(window.innerHeight||document.documentElement.clientHeight);if(t){var i=window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0;if(i<=95){e.style.visibility="hidden";setTimeout(e.style.opacity="0",2e3)}else{e.style.opacity="1";setTimeout(e.style.visibility="",2e3)}}}window.addEventListener("scroll",t);
//rebuild by hrmmi 