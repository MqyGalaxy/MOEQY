// build time:Mon Aug 14 2023 07:21:51 GMT+0800 (中国标准时间)
document.getElementById("other-top").style.display="none";document.getElementById("index-top").style.display="";window.onscroll=function(){var e=document.body.scrollHeight>(window.innerHeight||document.documentElement.clientHeight);if(e){var t=window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0;var o=document.getElementsByClassName("index-top");if(t==0){document.getElementById("index-top").style.backgroundColor="rgba(255,255,255,0)";document.getElementById("index-top").style.border="1px solid rgba(255, 255, 255, 0)";document.getElementById("menu-logo").setAttribute("src","/images/moeqy-fff-logo.png");for(var n=0;n<o.length;n++){var l=o[n].getElementsByTagName("a");for(var d=0;d<l.length;d++){l[d].style.color="#fff"}}}else{document.getElementById("index-top").style.backgroundColor="";document.getElementById("index-top").style.border="";document.getElementById("menu-logo").setAttribute("src","/images/moeqy-logo.png");for(var n=0;n<o.length;n++){var l=o[n].getElementsByTagName("a");for(var d=0;d<l.length;d++){l[d].style.color=""}}document.getElementById("index-pe-btn").style.color="rgb(56, 56, 56)"}}};
//rebuild by hrmmi 