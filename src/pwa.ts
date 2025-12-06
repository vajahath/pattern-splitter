import { registerSW } from 'virtual:pwa-register'

export function initPWA(app: Element) {
    const pwaToast = app.querySelector<HTMLDivElement>('#pwa-toast')!
    const pwaToastMessage = pwaToast.querySelector<HTMLDivElement>('.message #toast-message')!
    const pwaCloseBtn = pwaToast.querySelector<HTMLButtonElement>('#pwa-close')!
    const pwaRefreshBtn = pwaToast.querySelector<HTMLButtonElement>('#pwa-refresh')!

    let refreshSW: (reloadPage?: boolean) => Promise<void> | undefined

    const refreshCallback = () => {
        pwaRefreshBtn.textContent = 'Reloading...';
        pwaRefreshBtn.disabled = true;
        refreshSW?.(true);
        hidePwaToast(true);
    }

    function hidePwaToast(raf: boolean) {
        if (raf) {
            requestAnimationFrame(() => hidePwaToast(false))
            return
        }
        if (pwaToast.classList.contains('refresh'))
            pwaRefreshBtn.removeEventListener('click', refreshCallback)

        pwaToast.classList.remove('show', 'refresh')
    }
    function showPwaToast(offline: boolean) {
        if (!offline)
            pwaRefreshBtn.addEventListener('click', refreshCallback)
        requestAnimationFrame(() => {
            hidePwaToast(false)
            if (!offline)
                pwaToast.classList.add('refresh')
            pwaToast.classList.add('show')
        })
    }

    let swActivated = false
    // check for updates every hour
    const period = 60 * 60 * 1000

    window.addEventListener('load', () => {
        pwaCloseBtn.addEventListener('click', () => hidePwaToast(true))
        refreshSW = registerSW({
            immediate: true,
            onOfflineReady() {
                pwaToastMessage.innerHTML = 'App ready to work offline'
                showPwaToast(true)
            },
            onNeedRefresh() {
                pwaToastMessage.innerHTML = 'New content available, click on reload button to update'
                showPwaToast(false)
            },
            onRegisteredSW(swUrl, r) {
                if (period <= 0) return
                if (r?.active?.state === 'activated') {
                    swActivated = true
                    registerPeriodicSync(period, swUrl, r)
                }
                else if (r?.installing) {
                    r.installing.addEventListener('statechange', (e) => {
                        const sw = e.target as ServiceWorker
                        swActivated = sw.state === 'activated'
                        if (swActivated)
                            registerPeriodicSync(period, swUrl, r)
                    })
                }
            },
        })
    })
}

// --- Install Prompt Logic ---
let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
});

export function canInstall() {
    return !!deferredPrompt;
}

export async function promptToInstall() {
    if (!deferredPrompt) return;

    // Re-use the Toast UI
    const pwaToast = document.querySelector<HTMLDivElement>('#pwa-toast');
    if (!pwaToast) return;

    const pwaToastMessage = pwaToast.querySelector<HTMLDivElement>('.message #toast-message')!;
    const pwaCloseBtn = pwaToast.querySelector<HTMLButtonElement>('#pwa-close')!;
    const pwaRefreshBtn = pwaToast.querySelector<HTMLButtonElement>('#pwa-refresh')!;

    // Backup original state
    const originalMsg = pwaToastMessage.innerHTML;
    const originalRefreshText = pwaRefreshBtn.textContent;
    const originalCloseText = pwaCloseBtn.textContent;

    // Update UI for Install
    pwaToastMessage.innerHTML = 'Install this app for offline use?';
    pwaRefreshBtn.textContent = 'Install';
    pwaCloseBtn.textContent = 'Not now';

    pwaToast.classList.add('show');
    pwaToast.classList.add('install');

    return new Promise<void>((resolve) => {
        const cleanup = () => {
            pwaToast.classList.remove('show');
            pwaToast.classList.remove('install');
            // Restore original text after transition
            setTimeout(() => {
                pwaToastMessage.innerHTML = originalMsg;
                pwaRefreshBtn.textContent = originalRefreshText;
                pwaCloseBtn.textContent = originalCloseText;
            }, 300);

            pwaRefreshBtn.removeEventListener('click', handleInstall);
            pwaCloseBtn.removeEventListener('click', handleCancel);
            resolve();
        };

        const handleInstall = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    deferredPrompt = null;
                }
            }
            cleanup();
        };

        const handleCancel = () => {
            cleanup();
        };

        pwaRefreshBtn.addEventListener('click', handleInstall);
        pwaCloseBtn.addEventListener('click', handleCancel);
    });
}

/**
 * This function will register a periodic sync check every hour, you can modify the interval as needed.
 */
function registerPeriodicSync(period: number, swUrl: string, r: ServiceWorkerRegistration) {
    if (period <= 0) return

    setInterval(async () => {
        if ('onLine' in navigator && !navigator.onLine)
            return

        const resp = await fetch(swUrl, {
            cache: 'no-store',
            headers: {
                'cache': 'no-store',
                'cache-control': 'no-cache',
            },
        })

        if (resp?.status === 200)
            await r.update()
    }, period)
}
