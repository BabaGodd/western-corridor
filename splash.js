(function () {

    const M = [
        [0, "Preparing simulation"],
        [20, "Loading satellite imagery"],
        [45, "Building terrain"],
        [70, "Tracing Western Corridor"],
        [90, "Positioning train"]
    ];

    window.setSplashProgress = function (p, msg) {

        const bar = document.getElementById("splash-bar");
        const message = document.getElementById("splash-msg");
        const percent = document.getElementById("splash-percent");

        const progress = Math.max(0, Math.min(100, Number(p) || 0));

        if (bar) {
            bar.style.width = progress + "%";
        }

        if (message) {
            const stage = M
                .filter((item) => progress >= item[0])
                .pop();

            message.textContent = msg || (stage ? stage[1] : "Preparing simulation");
        }

        if (percent) {
            percent.textContent = Math.round(progress) + "%";
        }
    };


    window.hideSplashScreen = function (msg) {

        window.setSplashProgress(100, msg || "Ready");

        const splash = document.getElementById("splash");

        if (!splash) {
            return;
        }

        setTimeout(() => {

            splash.classList.add("hide");

            setTimeout(() => {

                if (splash && splash.parentNode) {
                    splash.remove();
                }

            }, 950);

        }, 400);
    };


    /*
     * Initial state.
     * This makes sure the splash starts consistently even
     * before app.js begins reporting Mapbox progress.
     */

    window.setSplashProgress(0, "Preparing simulation");

})();