document.getElementById('other-top').style.display = "none";
document.getElementById('index-top').style.display = "";

window.onscroll = function () {
    var flag = document.body.scrollHeight > (window.innerHeight || document.documentElement.clientHeight);
    if (flag) {
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        // 获取具有指定 class 的所有元素
        var elements = document.getElementsByClassName("index-top");

        if (scrollTop == 0) { //此时滚动条处于页面的顶部
            document.getElementById('index-top').style.backgroundColor = "rgba(255,255,255,0)";
            document.getElementById('index-top').style.border = "1px solid rgba(255, 255, 255, 0)";
            document.getElementById('menu-logo').setAttribute("src","/images/moeqy-fff-logo.png");

            // 遍历所有元素
            for (var i = 0; i < elements.length; i++) {
                var links = elements[i].getElementsByTagName("a");

                // 遍历当前元素内的所有 <a> 标签
                for (var j = 0; j < links.length; j++) {
                    links[j].style.color = "#fff"; // 修改颜色样式
                }
            }
        } else {
            document.getElementById('index-top').style.backgroundColor = "";
            document.getElementById('index-top').style.border = "";
            document.getElementById('menu-logo').setAttribute("src","/images/moeqy-logo.png");

            // 遍历所有元素
            for (var i = 0; i < elements.length; i++) {
                var links = elements[i].getElementsByTagName("a");

                // 遍历当前元素内的所有 <a> 标签
                for (var j = 0; j < links.length; j++) {
                    links[j].style.color = ""; // 修改颜色样式
                }
            }
            document.getElementById('index-pe-btn').style.color = "rgb(56, 56, 56)";
        }

    }
}