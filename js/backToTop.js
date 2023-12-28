// build time:Thu Dec 28 2023 10:00:34 GMT+0800 (中国标准时间)
const e=document.querySelector(".scrollToTopBtn");const t=document.documentElement;function n(){if(pageYOffset>t.clientHeight){e.classList.add("showBtn")}else{e.classList.remove("showBtn")}}document.addEventListener("scroll",n);
//rebuild by hrmmi 