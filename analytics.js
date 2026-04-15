// Custom analytics: prevent scroll restoration so scroll events are trustworthy,
// then track real visibility, interaction, and prerender state to filter
// out background loads, prerenders, link previews, and Spotlight refreshes.

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

(function() {
    if (document.prerendering) {
        document.addEventListener('prerenderingchange', init, { once: true });
    } else {
        init();
    }

    function init() {
        let visibleStart = document.visibilityState === 'visible' ? Date.now() : null;
        let totalVisible = 0;
        let interacted = false;
        let lastSnapshot = 0;

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                visibleStart = Date.now();
            } else if (visibleStart) {
                totalVisible += Date.now() - visibleStart;
                visibleStart = null;
                sendSummary('visibility_hidden');
            }
        });

        ['touchstart', 'pointerdown', 'scroll', 'keydown'].forEach(evt =>
            addEventListener(evt, () => {
                if (!interacted) {
                    interacted = true;
                    gtag('event', 'human_interaction', { trigger: evt });
                }
            }, { once: true, passive: true, capture: true })
        );

        // Incremental visit_summary snapshots — survives iOS force-quits
        [1000, 3000, 5000, 8000, 10000, 15000, 20000, 30000].forEach(t =>
            setTimeout(() => {
                const ms = currentVisibleMs();
                if (ms >= t && lastSnapshot < t) {
                    lastSnapshot = t;
                    gtag('event', 'visit_summary', {
                        visible_ms: ms,
                        interacted: interacted,
                        snapshot: t
                    });
                }
            }, t + 100)
        );

        window.addEventListener('pagehide', () => sendSummary('pagehide'));

        window.addEventListener('pageshow', e => {
            if (e.persisted) gtag('event', 'bfcache_restore');
        });

        function currentVisibleMs() {
            return (visibleStart ? Date.now() - visibleStart : 0) + totalVisible;
        }

        function sendSummary(reason) {
            const ms = currentVisibleMs();
            if (ms > lastSnapshot) {
                lastSnapshot = ms;
                gtag('event', 'visit_summary', {
                    visible_ms: ms,
                    interacted: interacted,
                    snapshot: 'final',
                    reason: reason
                });
            }
        }
    }
})();
