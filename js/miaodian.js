// build time:Sat Sep 23 2023 09:53:33 GMT+0800 (中国标准时间)
function e(){var e=$(".section-slide"),a=$("#header").height()||0;$(window).scroll(function(){var i=-a,t=[],s=$(window).scrollTop();e.each(function(){t.push($(this).offset().top+i)}),console.log(1111111,t);$.each(t,function(e,a){0<e?e==t.length-1?a<=s&&($(".aside-nav li").removeClass("active"),$(".aside-nav li").eq(e).addClass("active")):a<=s&&s<t[e+1]&&($(".aside-nav li").removeClass("active"),$(".aside-nav li").eq(e).addClass("active")):0<=s&&s<t[e+1]&&($(".aside-nav li").removeClass("active"),$(".aside-nav li").eq(e).addClass("active"))}),$(".scroller").animate({top:$(".aside-nav li.active").position().top-29,height:$(".aside-nav li.active").height()+58},0)}),$(".aside-nav a").click(function(i){$("html, body").animate({scrollTop:e.eq($(this).parent().index()).offset().top-a},600),i.preventDefault()})}$(document).ready(function(){e()});
//rebuild by hrmmi 