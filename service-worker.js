// Service Worker da Brit's Confeitaria
// Guarda em cache só as imagens (mais pesadas), pra abrir mais rápido depois da primeira visita.
// HTML/CSS/JS NÃO ficam em cache de propósito, pra você nunca ficar preso numa versão antiga
// depois que eu (ou você) atualizar o site.

const CACHE_NAME = 'brits-confeitaria-imagens-v1';

// --- Notificações push (Firebase Cloud Messaging) ---
// Precisa rodar aqui dentro do service worker pra funcionar mesmo com o site fechado.
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAq9paZSfPwKopYA2HciyNl04ATAdLX0JE",
    authDomain: "brits-confeitaria.firebaseapp.com",
    databaseURL: "https://brits-confeitaria-default-rtdb.firebaseio.com",
    projectId: "brits-confeitaria",
    storageBucket: "brits-confeitaria.firebasestorage.app",
    messagingSenderId: "866705536686",
    appId: "1:866705536686:web:95cce3cc013cae5dd4df3f"
});

try {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
        const titulo = (payload.notification && payload.notification.title) || "Brit's Confeitaria";
        const opcoes = {
            body: (payload.notification && payload.notification.body) || '',
            icon: 'logopng.png',
            badge: 'logopng.png'
        };
        self.registration.showNotification(titulo, opcoes);
    });
} catch (e) {
    // Se o navegador não suportar, apenas ignora — o resto do site continua funcionando normal
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Quando o cliente clica na notificação: se já tem uma aba do cardápio aberta, foca nela
// em vez de abrir outra; senão, abre uma aba nova direto no cardápio
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlDoCardapio = 'https://menubritsconfeitaria.github.io/Brit-s-confeitaria-card-pio/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(listaClientes => {
            for (const cliente of listaClientes) {
                if (cliente.url.includes('menubritsconfeitaria.github.io') && 'focus' in cliente) {
                    return cliente.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlDoCardapio);
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(nomes =>
            Promise.all(
                nomes.filter(nome => nome !== CACHE_NAME).map(nome => caches.delete(nome))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    const ehImagem = /\.(png|jpe?g|webp|svg|gif)$/i.test(url);

    if (!ehImagem) {
        return; // deixa passar direto pra rede (HTML/CSS/JS sempre atualizados)
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(respostaCache => {
                if (respostaCache) return respostaCache;
                return fetch(event.request).then(respostaRede => {
                    cache.put(event.request, respostaRede.clone());
                    return respostaRede;
                }).catch(() => respostaCache);
            })
        )
    );
});
