// Lets the module loader add stylesheets that ship with a module.
(function () {
    function element(id, tag) {
        var el = document.getElementById(id);
        if (!el) {
            el = document.createElement(tag);
            el.id = id;
            document.head.appendChild(el);
        }
        return el;
    }

    window.moduleHost = {
        // nupkg modules: the CSS text was read out of the package.
        setStyleText: function (id, css) {
            element(id, 'style').textContent = css;
        },
        // dll modules: the CSS is a normal file at a url.
        setStyleLink: function (id, href) {
            var el = element(id, 'link');
            el.rel = 'stylesheet';
            el.href = href;
        },
        removeStyle: function (id) {
            var el = document.getElementById(id);
            if (el) el.remove();
        }
    };
})();
