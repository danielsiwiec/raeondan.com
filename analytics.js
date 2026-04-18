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
        const loadTime = Date.now();
        let visibleStart = document.visibilityState === 'visible' ? loadTime : null;
        let totalVisible = 0;
        let interacted = false;
        let lastSnapshot = 0;
        let scrollReached = 0;

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
                    gtag('event', 'human_interaction', {
                        trigger: evt,
                        ms_to_first: Date.now() - loadTime
                    });
                }
            }, { once: true, passive: true, capture: true })
        );

        // Scroll depth milestones: fire once per threshold
        addEventListener('scroll', () => {
            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - doc.clientHeight;
            if (scrollable <= 0) return;
            const pct = Math.round((doc.scrollTop + doc.clientHeight) / doc.scrollHeight * 100);
            [25, 50, 75, 100].forEach(threshold => {
                if (pct >= threshold && scrollReached < threshold) {
                    scrollReached = threshold;
                    gtag('event', 'scroll_depth', {
                        percent: threshold,
                        ms_to_scroll: Date.now() - loadTime
                    });
                }
            });
        }, { passive: true });

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
