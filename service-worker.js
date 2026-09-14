// Service Worker — cardápio digital
// Guarda em cache só as imagens (mais pesadas), pra abrir mais rápido depois da primeira visita.
// HTML/CSS/JS NÃO ficam em cache de propósito, pra você nunca ficar preso numa versão antiga
// depois que eu (ou você) atualizar o site.

const CACHE_NAME = 'cardapio-imagens-v1';

// --- Notificações push (Firebase Cloud Messaging) ---
// Precisa rodar aqui dentro do service worker pra funcionar mesmo com o site fechado.
// Tudo isso fica protegido num try/catch: se o Firebase falhar ao carregar (rede,
// CDN fora do ar, alguma extensão bloqueando), o Service Worker continua instalando
// normalmente — só a notificação push que fica indisponível até a próxima tentativa
// funcionar. Sem essa proteção, uma falha aqui travava o site inteiro, fazendo o
// navegador tentar instalar de novo sem parar (achado real: centenas de tentativas
// acumuladas em "tentando instalar", nunca completando).
try {
    importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');
    importScripts('loja-config.js');     // carrega LOJA_CONFIG (nome, URL do cardápio, etc.)
    importScripts('firebase-config.js'); // já chama firebase.initializeApp() sozinho — só 1 lugar com as chaves

    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
        const titulo = (payload.notification && payload.notification.title) || LOJA_CONFIG.nome;
        const opcoes = {
            body: (payload.notification && payload.notification.body) || '',
            icon: LOJA_CONFIG.logo,
            badge: LOJA_CONFIG.logo
        };
        self.registration.showNotification(titulo, opcoes);
    });
} catch (e) {
    // Se o Firebase não carregar por qualquer motivo, o resto do site (cache de
    // imagens, funcionamento offline) continua funcionando normal mesmo assim.
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Quando o cliente clica na notificação: se já tem uma aba do cardápio aberta, foca nela
// em vez de abrir outra; senão, abre uma aba nova direto no cardápio
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    // Se o Firebase falhou ao carregar (raro), LOJA_CONFIG pode não existir — usa a
    // própria origem do service worker como reserva, pra não travar o clique.
    const urlDoCardapio = (typeof LOJA_CONFIG !== 'undefined' && LOJA_CONFIG.urlCardapio) || self.registration.scope;
    const dominioDoCardapio = new URL(urlDoCardapio).hostname;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(listaClientes => {
            for (const cliente of listaClientes) {
                if (cliente.url.includes(dominioDoCardapio) && 'focus' in cliente) {
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
