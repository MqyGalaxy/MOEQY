// build time:Sat Feb 19 2022 13:40:39 GMT+0800 (中国标准时间)
function i(i){$(i).find("ul:first").animate({marginTop:"-25px"},500,function(){$(this).css({marginTop:"0px"}).find("li:first").appendTo(this)})}$(document).ready(function(){li_num=$("#myscroll ul li").length;tenki_speed=4e3;if(li_num>1){setInterval('AutoScroll("#myscroll")',tenki_speed)}});
//rebuild by hrmmi 