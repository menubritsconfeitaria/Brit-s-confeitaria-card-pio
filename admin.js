const auth = firebase.auth();
const db = firebase.database();

// Aplica os dados da loja (nome, logo) no painel — mesma configuração usada no cardápio,
// vinda de loja-config.js. É só trocar aquele arquivo pra usar o painel com outra loja.
function aplicarConfigDaLojaNoAdmin() {
    document.title = `Painel de Pedidos - ${LOJA_CONFIG.nome}`;

    const loginLogo = document.getElementById('loginLogo');
    if (loginLogo) { loginLogo.src = LOJA_CONFIG.logo; loginLogo.alt = `Logo ${LOJA_CONFIG.nome}`; }

    const painelLogo = document.getElementById('painelLogo');
    if (painelLogo) { painelLogo.src = LOJA_CONFIG.logo; painelLogo.alt = `Logo ${LOJA_CONFIG.nome}`; }

    const tituloAba = document.getElementById('tituloAba');
    if (tituloAba) tituloAba.textContent = `Painel de Pedidos - ${LOJA_CONFIG.nome}`;

    const clubeTituloAdmin = document.getElementById('clubeTituloAdmin');
    if (clubeTituloAdmin) clubeTituloAdmin.textContent = `⭐ Clube ${LOJA_CONFIG.nomeCurto} (Fidelidade)`;

    montarCartazQrCode();
}
aplicarConfigDaLojaNoAdmin();

// Monta um cartaz completo (logo + nome + chamada + QR Code) numa imagem só, pronta
// pra imprimir — desenhado num canvas, pra não depender de nenhuma ferramenta externa
async function montarCartazQrCode() {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const ctx = canvas.getContext('2d');

    // Fundo branco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Faixa colorida no topo, com a cor principal da marca
    ctx.fillStyle = LOJA_CONFIG.corPrimaria || '#a0522d';
    ctx.fillRect(0, 0, canvas.width, 260);

    // Carrega a logo e o QR Code em paralelo antes de desenhar
    const carregarImagem = (src, comCors) => new Promise((resolve, reject) => {
        const img = new Image();
        if (comCors) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

    try {
        const [logoImg, qrImg] = await Promise.all([
            carregarImagem(LOJA_CONFIG.logo, false).catch(() => null), // segue sem logo se falhar
            carregarImagem(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(LOJA_CONFIG.urlCardapio)}`, true)
        ]);

        // Logo circular, centralizada na faixa colorida
        if (logoImg) {
            const tamLogo = 140;
            const xLogo = (canvas.width - tamLogo) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(canvas.width / 2, 60 + tamLogo / 2, tamLogo / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(logoImg, xLogo, 60, tamLogo, tamLogo);
            ctx.restore();
        }

        // Nome da loja
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 42px Arial, sans-serif';
        ctx.fillText(LOJA_CONFIG.nome, canvas.width / 2, 235);

        // Chamada pra ação
        ctx.fillStyle = LOJA_CONFIG.corPrimaria || '#a0522d';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.fillText('📱 Aponte a câmera e peça já!', canvas.width / 2, 340);

        // QR Code, dentro de uma caixa branca com borda
        const tamQr = 500;
        const xQr = (canvas.width - tamQr) / 2;
        const yQr = 390;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = LOJA_CONFIG.corAccent || '#c9974c';
        ctx.lineWidth = 4;
        ctx.fillRect(xQr - 15, yQr - 15, tamQr + 30, tamQr + 30);
        ctx.strokeRect(xQr - 15, yQr - 15, tamQr + 30, tamQr + 30);
        ctx.drawImage(qrImg, xQr, yQr, tamQr, tamQr);

        // Frase final embaixo
        ctx.fillStyle = '#3a2b20';
        ctx.font = '28px Arial, sans-serif';
        ctx.fillText('Peça pelo nosso cardápio digital', canvas.width / 2, yQr + tamQr + 60);
        if (LOJA_CONFIG.cidade) {
            ctx.font = '22px Arial, sans-serif';
            ctx.fillStyle = '#8a7562';
            ctx.fillText(`📍 ATENDEMOS ${LOJA_CONFIG.cidade}`.toUpperCase(), canvas.width / 2, yQr + tamQr + 100);
        }

        document.getElementById('imagemQrCode').src = canvas.toDataURL('image/png');
        window._cartazQrCodeCanvas = canvas; // guarda pro botão de baixar reaproveitar
    } catch (err) {
        console.log('Não foi possível montar o cartaz do QR Code:', err.message);
    }
}

// Baixa o cartaz completo (canvas já montado) como arquivo de imagem
function baixarQrCode() {
    if (!window._cartazQrCodeCanvas) { alert('O cartaz ainda está sendo montado, tenta de novo em instantes.'); return; }
    const link = document.createElement('a');
    link.href = window._cartazQrCodeCanvas.toDataURL('image/png');
    link.download = `qrcode-${LOJA_CONFIG.nomeCurto || 'cardapio'}.png`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-.]/g, '');
    link.click();
}

let idsRenderizados = new Set();
let primeiraCargaConcluida = false;

// ---------- ABAS DO PAINEL ----------

/**
 * Aviso remoto de status da assinatura, controlado só pelo Firebase — sem precisar
 * mexer em código nem publicar nada de novo. Pra usar: no Firebase Console desse
 * cliente, criar/editar o nó "configuracao/assinatura":
 *
 *   { "status": "atencao", "mensagem": "texto opcional, personalizado" }
 *   { "status": "bloqueado", "mensagem": "texto opcional, personalizado" }
 *
 * Se o nó não existir, ou "status" for "ativo"/vazio, nada aparece (comportamento
 * normal — é o caso da Brit's e de qualquer cliente em dia).
 */
function escutarStatusAssinatura() {
    const banner = document.getElementById('bannerAssinatura');
    if (!banner) return;

    db.ref('configuracao/assinatura').on('value', snap => {
        const dados = snap.val();
        const status = (dados && dados.status) || 'ativo';
        const mensagemCustom = dados && dados.mensagem;

        if (status === 'ativo') {
            banner.style.display = 'none';
            return;
        }

        banner.className = 'banner-assinatura banner-assinatura-' + status;
        banner.style.display = 'block';

        if (status === 'atencao') {
            banner.textContent = mensagemCustom || '🔔 Existe uma pendência no seu sistema. Qualquer dúvida, é só entrar em contato com o suporte.';
        } else if (status === 'bloqueado') {
            banner.textContent = mensagemCustom || '⚠️ Seu acesso está temporariamente limitado. Entre em contato com o suporte pra regularizar e voltar ao normal.';
        } else {
            banner.style.display = 'none'; // valor desconhecido — não mostra nada, por segurança
        }
    });
}

function inicializarAbasPainel() {
    const botoes = document.querySelectorAll('.painel-tab-btn');
    const secoes = document.querySelectorAll('section[data-tab]');

    function mostrarAba(nomeAba, resetScroll) {
        secoes.forEach(sec => {
            sec.style.display = (sec.dataset.tab === nomeAba) ? 'block' : 'none';
        });
        botoes.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === nomeAba);
        });
        localStorage.setItem('painelAbaAtiva', nomeAba);
        // Só volta pro topo quando é uma troca de aba de verdade (clique do usuário) —
        // na carga inicial da página, deixa a restauração de posição de rolagem decidir
        if (resetScroll) window.scrollTo(0, 0);
    }

    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            mostrarAba(btn.dataset.tab, true);
            // Ao clicar na aba de Administração, sempre reconfere se já está logado
            // no Firebase Mestre de verdade (evita pedir login de novo à toa, caso
            // algo tenha "escondido" visualmente o conteúdo sem realmente deslogar)
            if (btn.dataset.tab === 'administracao-mestre') sincronizarTelaDoMestre();
        });
    });

    // Abre na mesma aba que estava da última vez (ou "pedidos" se for a primeira vez)
    const abaSalva = localStorage.getItem('painelAbaAtiva') || 'pedidos';
    mostrarAba(abaSalva, false);
}

// ---------- MANTER A ROLAGEM AO ATUALIZAR A PÁGINA ----------
// Sem isso, o navegador tenta "adivinhar" a posição antes do conteúdo carregar e erra,
// fazendo parecer que a página "pula" pro início ou pro fim sozinha.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'; // desliga a tentativa automática (e imprecisa) do navegador
}

// Salva a posição continuamente enquanto você rola (não só ao sair da página — o evento de
// "saindo" nem sempre dispara a tempo em todos os navegadores/celulares)
let _scrollSaveTimer = null;
window.addEventListener('scroll', () => {
    clearTimeout(_scrollSaveTimer);
    _scrollSaveTimer = setTimeout(() => {
        sessionStorage.setItem('painelScrollY', window.scrollY);
    }, 200);
});
window.addEventListener('beforeunload', () => {
    sessionStorage.setItem('painelScrollY', window.scrollY);
});

function restaurarPosicaoRolagem() {
    const salvo = sessionStorage.getItem('painelScrollY');
    if (salvo === null) return;
    const alvo = parseInt(salvo, 10);

    let cancelado = false;
    let ultimoScrollAplicado = null;
    let debounceTimer = null;
    let observer = null;

    function aplicar() {
        if (cancelado) return;
        window.scrollTo(0, alvo);
        ultimoScrollAplicado = alvo;
    }

    // Se o usuário rolar a tela por conta própria durante esse período, respeita e para de "puxar" de volta
    function detectarScrollManual() {
        if (ultimoScrollAplicado !== null && Math.abs(window.scrollY - ultimoScrollAplicado) > 50) {
            pararRestauracao();
        }
    }

    function pararRestauracao() {
        cancelado = true;
        window.removeEventListener('scroll', detectarScrollManual);
        if (observer) observer.disconnect();
    }

    window.addEventListener('scroll', detectarScrollManual);

    // Observa QUALQUER mudança na página (não importa de qual parte do painel ela venha:
    // pedidos, produtos, histórico, configurações...) e corrige a posição de novo cada vez
    // que algo mudar — assim não depende de adivinhar quando cada coisa termina de carregar.
    if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
            if (cancelado) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(aplicar, 60);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    aplicar(); // já tenta na hora também

    // Desliga tudo depois de alguns segundos, pra não ficar rodando pra sempre à toa
    setTimeout(pararRestauracao, 4000);
}

// ---------- LOGIN / LOGOUT ----------

// Configuração do Firebase Mestre — projeto separado, só do dono do serviço, guarda o
// registro de todos os clientes. Essa chave sozinha não abre porta nenhuma: o Firebase
// Mestre também exige login (só o dono do serviço tem usuário cadastrado lá).
const FIREBASE_MESTRE_CONFIG = {
    apiKey: "AIzaSyCMr33r_7zBb8A-WlVQcxxZB4f-FsSQiDg",
    authDomain: "painel-admin-mestre.firebaseapp.com",
    databaseURL: "https://painel-admin-mestre-default-rtdb.firebaseio.com",
    projectId: "painel-admin-mestre",
    storageBucket: "painel-admin-mestre.firebasestorage.app",
    messagingSenderId: "190805206633",
    appId: "1:190805206633:web:36d1f40aa56511d358a4f8"
};

// E-mail do dono do serviço — só usado pra decidir se MOSTRA a aba especial (não dá
// acesso a nada sozinho, é só um e-mail). A senha continua sendo pedida de verdade na
// hora de abrir a aba, não é possível ver/mexer em nada sem ela.
const EMAIL_DONO_SERVICO = "georgevb89@gmail.com";

let appMestre = null;
let dbMestre = null;
let souOAdminMestre = false;

// Roda toda vez que o estado de login muda — inclusive quando a sessão já estava salva
// (página recarregada, sem digitar senha de novo) — por isso decide só pelo e-mail,
// não pela senha (que só existe no momento exato do login manual)
function verificarSeEhDonoDoServico(email) {
    const botaoAba = document.querySelector('.painel-tab-btn[data-tab="administracao-mestre"]');
    if (botaoAba) botaoAba.style.display = (email === EMAIL_DONO_SERVICO) ? '' : 'none';
}

// Chamado quando a pessoa clica na aba "Administração" — só nesse momento pede a
// senha de verdade do Firebase Mestre (se ainda não tiver logado nessa sessão)
async function entrarNoFirebaseMestre(email, senha) {
    if (!appMestre) {
        appMestre = firebase.initializeApp(FIREBASE_MESTRE_CONFIG, 'mestre');
        dbMestre = appMestre.database();
    }
    await appMestre.auth().signInWithEmailAndPassword(email, senha);
    souOAdminMestre = true;
}

// Chamado ao clicar em "Entrar" no card de login do Firebase Mestre
// Confere o estado real de login no Firebase Mestre, e ajusta a tela pra bater com
// ele — chamada sempre que a aba é clicada, pra nunca ficar "travada" pedindo login
// de novo quando na verdade a sessão continua válida
function sincronizarTelaDoMestre() {
    const logado = !!(appMestre && appMestre.auth().currentUser);
    souOAdminMestre = logado;
    document.getElementById('cardLoginMestre').style.display = logado ? 'none' : 'block';
    document.getElementById('cardConteudoMestre').style.display = logado ? 'block' : 'none';
    document.getElementById('cardAdicionarClienteMestre').style.display = logado ? 'block' : 'none';
    document.getElementById('cardLeadsMestre').style.display = logado ? 'block' : 'none';
    if (logado && clientesRegistroMestre.length === 0) carregarClientesMestre();

    // Se já tinha um cliente selecionado e logado antes, mantém a tela dele visível —
    // sem isso, voltar pra essa aba mostraria o login do cliente de novo à toa
    if (logado && clienteMestreSelecionadoIndice !== null) {
        const registroCliente = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
        if (registroCliente && registroCliente.autenticado) {
            document.getElementById('areaLoginClienteMestre').style.display = 'none';
            document.getElementById('areaRecursosClienteMestre').style.display = 'block';
        }
    }
}

async function fazerLoginNoMestre() {
    const senha = document.getElementById('senhaLoginMestre').value;
    const msgEl = document.getElementById('msgLoginMestre');
    if (!senha) { msgEl.textContent = 'Digita sua senha do Firebase Mestre.'; return; }

    msgEl.textContent = 'Entrando...';
    try {
        await entrarNoFirebaseMestre(EMAIL_DONO_SERVICO, senha);
        document.getElementById('senhaLoginMestre').value = '';
        document.getElementById('cardLoginMestre').style.display = 'none';
        document.getElementById('cardConteudoMestre').style.display = 'block';
        document.getElementById('cardAdicionarClienteMestre').style.display = 'block';
        document.getElementById('cardLeadsMestre').style.display = 'block';
        carregarClientesMestre();
        carregarLeadsMestre();
    } catch (err) {
        msgEl.textContent = 'Senha incorreta ou erro de conexão: ' + err.message;
    }
}

const RECURSOS_MESTRE = [
    { chave: 'cupons', nome: '🎟️ Cupons' },
    { chave: 'fidelidade', nome: '⭐ Fidelidade (Clube)' },
    { chave: 'agenda', nome: '📅 Agenda de Encomendas (+ 🎂 Disponível pra Encomenda no produto)' },
    { chave: 'notificacoes', nome: '📢 Notificações Push' },
    { chave: 'pagamentoOnline', nome: '💳 Pagamento Online' },
    { chave: 'visitantes', nome: '👀 Visitantes' },
    { chave: 'adicionais', nome: '➕ Adicionais por Produto' },
    { chave: 'pedidoMinimo', nome: '🛒 Pedido Mínimo e Frete Grátis' },
    { chave: 'areasDeEntrega', nome: '🚚 Áreas de Entrega' },
    { chave: 'esconderProduto', nome: '🙈 Esconder Produto do cardápio' },
    { chave: 'gestaoCompleta', nome: '📊 Gestão Completa (ingredientes, ficha técnica, estoque)' }
];

const appsClientesMestre = {}; // indice -> { app, auth, db, autenticado }
let clientesRegistroMestre = [];
let clienteMestreSelecionadoIndice = null;

// Carrega quem preencheu "Quero meu cardápio assim" em qualquer cardápio — mais
// recentes primeiro, com um link pronto pra já chamar no WhatsApp
function carregarLeadsMestre() {
    dbMestre.ref('leadsCardapio').once('value').then(snap => {
        const dados = snap.val() || {};
        const leads = Object.values(dados).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
        const container = document.getElementById('listaLeadsMestre');

        if (leads.length === 0) {
            container.innerHTML = '<p class="dica-secao">Nenhum lead ainda.</p>';
            return;
        }

        container.innerHTML = leads.map(lead => {
            const data = lead.criadoEm ? new Date(lead.criadoEm).toLocaleDateString('pt-BR') : '—';
            const numeroWhats = (lead.whatsapp || '').replace(/\D/g, '');
            return `
                <div class="loja-status-card" style="margin-top:10px;">
                    <strong>${lead.nome}</strong> — ${lead.nomeLoja}
                    <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                        ${lead.tipoNegocio ? lead.tipoNegocio + ' · ' : ''}${lead.cidade ? lead.cidade + ' · ' : ''}${data}
                    </p>
                    ${lead.email ? `<p style="margin:2px 0; font-size:0.85em;">✉️ ${lead.email}</p>` : ''}
                    <a href="https://wa.me/55${numeroWhats}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="display:inline-block; margin-top:6px; text-decoration:none;">💬 Chamar no WhatsApp</a>
                </div>
            `;
        }).join('');
    });
}

function carregarClientesMestre() {
    dbMestre.ref('clientes').once('value').then(snap => {
        const dados = snap.val() || {};
        clientesRegistroMestre = Object.entries(dados).map(([id, c]) => ({ id, ...c }));
        const seletor = document.getElementById('seletorClienteMestre');
        seletor.innerHTML = '<option value="">— Selecione —</option>' +
            clientesRegistroMestre.map((c, i) => `<option value="${i}">${c.nome}</option>`).join('');
    });
}

function nomeAppClienteMestre(indice) {
    return 'clienteMestre_' + indice;
}

function garantirAppClienteMestre(indice) {
    const nomeApp = nomeAppClienteMestre(indice);
    if (appsClientesMestre[nomeApp]) return appsClientesMestre[nomeApp];
    const cliente = clientesRegistroMestre[indice];
    const app = firebase.initializeApp(cliente.firebaseConfig, nomeApp);
    const registro = { app, auth: app.auth(), db: app.database(), autenticado: false };
    appsClientesMestre[nomeApp] = registro;
    return registro;
}

function selecionarClienteMestre() {
    const valor = document.getElementById('seletorClienteMestre').value;
    document.getElementById('areaLoginClienteMestre').style.display = 'none';
    document.getElementById('areaRecursosClienteMestre').style.display = 'none';
    document.getElementById('msgLoginClienteMestre').textContent = '';
    document.getElementById('msgAplicarRecursosMestre').textContent = '';
    if (!valor) { clienteMestreSelecionadoIndice = null; return; }

    clienteMestreSelecionadoIndice = parseInt(valor, 10);
    const cliente = clientesRegistroMestre[clienteMestreSelecionadoIndice];
    const registro = garantirAppClienteMestre(clienteMestreSelecionadoIndice);

    if (registro.autenticado) {
        carregarRecursosClienteMestre();
    } else {
        document.getElementById('labelLoginClienteMestre').textContent = 'Login — ' + cliente.nome;
        document.getElementById('emailLoginClienteMestre').value = cliente.emailAdmin || '';
        document.getElementById('areaLoginClienteMestre').style.display = 'block';
    }
}

async function fazerLoginClienteMestre() {
    const email = document.getElementById('emailLoginClienteMestre').value.trim();
    const senha = document.getElementById('senhaLoginClienteMestre').value;
    const msgEl = document.getElementById('msgLoginClienteMestre');
    if (!email || !senha) { msgEl.textContent = 'Preenche e-mail e senha.'; return; }

    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    msgEl.textContent = 'Entrando...';
    try {
        await registro.auth.signInWithEmailAndPassword(email, senha);
        registro.autenticado = true;
        document.getElementById('areaLoginClienteMestre').style.display = 'none';
        document.getElementById('senhaLoginClienteMestre').value = '';
        carregarRecursosClienteMestre();
    } catch (err) {
        msgEl.textContent = 'Erro no login: ' + err.message;
    }
}

async function carregarRecursosClienteMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const snap = await registro.db.ref('configuracao/recursosLiberados').once('value');
    const valor = snap.val();
    const nuncaConfigurado = valor == null;

    document.getElementById('avisoNuncaConfiguradoMestre').style.display = nuncaConfigurado ? 'block' : 'none';

    const estado = {};
    RECURSOS_MESTRE.forEach(r => { estado[r.chave] = nuncaConfigurado ? true : !!valor[r.chave]; });

    document.getElementById('listaRecursosClienteMestre').innerHTML = RECURSOS_MESTRE.map(r => `
        <label class="switch-linha" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
            ${r.nome}
            <input type="checkbox" id="recursoMestre_${r.chave}" ${estado[r.chave] ? 'checked' : ''}>
        </label>
    `).join('');
    document.getElementById('areaRecursosClienteMestre').style.display = 'block';

    carregarIdentidadeClienteMestre(registro);
}

async function carregarIdentidadeClienteMestre(registro) {
    const snap = await registro.db.ref('configuracao/loja').once('value');
    const config = snap.val() || {};

    document.getElementById('nomeLojaConfigMestre').value = config.nomeLoja || '';
    document.getElementById('nomeCurtoLojaConfigMestre').value = config.nomeCurtoLoja || '';
    document.getElementById('subtituloLojaConfigMestre').value = config.subtituloLoja || '';
    document.getElementById('cidadeLojaConfigMestre').value = config.cidadeLoja || '';
    document.getElementById('whatsappLojaConfigMestre').value = config.whatsappLoja || '';
    document.getElementById('instagramLojaConfigMestre').value = config.instagramLoja || '';
    document.getElementById('corPrimariaLojaConfigMestre').value = config.corPrimariaLoja || '#a0522d';
    document.getElementById('corAccentLojaConfigMestre').value = config.corAccentLoja || '#c9974c';

    const previewLogo = document.getElementById('previewLogoMestre');
    if (config.logoUrl) {
        previewLogo.src = config.logoUrl;
        previewLogo.style.display = 'inline-block';
    } else {
        previewLogo.style.display = 'none';
    }

    document.getElementById('infiniteTagConfigMestre').value = config.infiniteTag || '';
}

// Envia a logo pro Storage do CLIENTE selecionado (não o Mestre) — cada cliente
// guarda a própria logo no Storage do projeto Firebase dele
async function enviarLogoClienteMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgLogoMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const arquivo = document.getElementById('arquivoLogoMestre').files[0];
    if (!arquivo) { msgEl.textContent = 'Escolhe um arquivo de imagem primeiro.'; return; }
    if (!arquivo.type.startsWith('image/')) { msgEl.textContent = 'Isso não parece ser uma imagem.'; return; }
    if (arquivo.size > 2 * 1024 * 1024) { msgEl.textContent = 'Imagem muito grande — usa algo até 2MB.'; return; }

    msgEl.textContent = 'Enviando...';
    try {
        const extensao = arquivo.name.split('.').pop();
        const ref = registro.app.storage().ref('logos/logo-principal.' + extensao);
        await ref.put(arquivo);
        const url = await ref.getDownloadURL();
        await registro.db.ref('configuracao/loja/logoUrl').set(url);
        msgEl.textContent = 'Logo enviada com sucesso!';
        document.getElementById('previewLogoMestre').src = url;
        document.getElementById('previewLogoMestre').style.display = 'inline-block';
        document.getElementById('arquivoLogoMestre').value = '';
    } catch (err) {
        msgEl.textContent = 'Erro ao enviar: ' + err.message;
    }
}

async function salvarInfiniteTagClienteMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgInfiniteTagMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const valor = document.getElementById('infiniteTagConfigMestre').value.trim();
    if (!valor) {
        const confirmar = confirm('O campo está vazio — isso vai APAGAR a InfiniteTag desse cliente, desativando o pagamento online dele. Tem certeza?');
        if (!confirmar) { msgEl.textContent = 'Cancelado, nada foi alterado.'; return; }
    }
    msgEl.textContent = 'Salvando...';
    try {
        await registro.db.ref('configuracao/loja/infiniteTag').set(valor || null);
        msgEl.textContent = 'Salvo!';
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar: ' + err.message;
    }
}

async function salvarIdentidadeClienteMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgIdentidadeMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const dados = {
        nomeLoja: document.getElementById('nomeLojaConfigMestre').value.trim() || null,
        nomeCurtoLoja: document.getElementById('nomeCurtoLojaConfigMestre').value.trim() || null,
        subtituloLoja: document.getElementById('subtituloLojaConfigMestre').value.trim() || null,
        cidadeLoja: document.getElementById('cidadeLojaConfigMestre').value.trim() || null,
        whatsappLoja: document.getElementById('whatsappLojaConfigMestre').value.trim() || null,
        instagramLoja: document.getElementById('instagramLojaConfigMestre').value.trim() || null,
        corPrimariaLoja: document.getElementById('corPrimariaLojaConfigMestre').value || null,
        corAccentLoja: document.getElementById('corAccentLojaConfigMestre').value || null
    };
    msgEl.textContent = 'Salvando...';
    try {
        await registro.db.ref('configuracao/loja').update(dados);
        msgEl.textContent = 'Salvo com sucesso!';
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar: ' + err.message;
    }
}

async function aplicarRecursosClienteMestre() {
    const msgEl = document.getElementById('msgAplicarRecursosMestre');
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const dados = {};
    RECURSOS_MESTRE.forEach(r => { dados[r.chave] = document.getElementById('recursoMestre_' + r.chave).checked; });

    msgEl.textContent = 'Salvando...';
    try {
        await registro.db.ref('configuracao/recursosLiberados').update(dados);
        msgEl.textContent = 'Salvo com sucesso!';
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar: ' + err.message;
    }
}

function adicionarClienteMestre() {
    const nome = document.getElementById('novoClienteNomeMestre').value.trim();
    const configTexto = document.getElementById('novoClienteConfigMestre').value.trim();
    const msgEl = document.getElementById('msgAdicionarClienteMestre');
    if (!nome) { msgEl.textContent = 'Digita o nome do cliente.'; return; }

    let firebaseConfig;
    try {
        firebaseConfig = JSON.parse(configTexto);
    } catch (err) {
        msgEl.textContent = 'O firebaseConfig colado não é um JSON válido — confere se copiou certinho.';
        return;
    }

    dbMestre.ref('clientes').push({ nome, firebaseConfig })
        .then(() => {
            msgEl.textContent = 'Cliente adicionado!';
            document.getElementById('novoClienteNomeMestre').value = '';
            document.getElementById('novoClienteConfigMestre').value = '';
            carregarClientesMestre();
        })
        .catch(err => { msgEl.textContent = 'Erro ao adicionar: ' + err.message; });
}

function fazerLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value;
    const erroEl = document.getElementById('loginErro');
    erroEl.textContent = '';

    if (!email || !senha) {
        erroEl.textContent = 'Preencha e-mail e senha.';
        return;
    }

    auth.signInWithEmailAndPassword(email, senha)
        .catch(() => {
            erroEl.textContent = 'E-mail ou senha incorretos.';
        });
}

// Troca a senha de login do painel. Exige a senha atual (o Firebase obriga
// "reautenticar" antes de trocar senha, por segurança — evita que alguém que
// pegou o painel aberto sem querer consiga trocar a senha sem saber a atual)
async function trocarSenhaAdmin() {
    const senhaAtual = document.getElementById('senhaAtualInput').value;
    const novaSenha = document.getElementById('novaSenhaInput').value;
    const confirmarSenha = document.getElementById('confirmarSenhaInput').value;
    const msgEl = document.getElementById('trocarSenhaMsg');

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
        msgEl.textContent = 'Preenche todos os campos.';
        return;
    }
    if (novaSenha.length < 6) {
        msgEl.textContent = 'A nova senha precisa ter pelo menos 6 caracteres.';
        return;
    }
    if (novaSenha !== confirmarSenha) {
        msgEl.textContent = 'A confirmação não bate com a nova senha.';
        return;
    }

    const usuario = firebase.auth().currentUser;
    if (!usuario) { msgEl.textContent = 'Sessão expirada, faz login de novo.'; return; }

    msgEl.textContent = 'Trocando...';
    try {
        const credencial = firebase.auth.EmailAuthProvider.credential(usuario.email, senhaAtual);
        await usuario.reauthenticateWithCredential(credencial);
        await usuario.updatePassword(novaSenha);
        msgEl.textContent = 'Senha trocada com sucesso!';
        document.getElementById('senhaAtualInput').value = '';
        document.getElementById('novaSenhaInput').value = '';
        document.getElementById('confirmarSenhaInput').value = '';
    } catch (err) {
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            msgEl.textContent = 'Senha atual incorreta.';
        } else {
            msgEl.textContent = 'Erro ao trocar a senha: ' + err.message;
        }
    }
}

function fazerLogout() {
    auth.signOut();
}

// Permite logar apertando Enter no campo de senha
document.getElementById('loginSenha').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fazerLogin();
});

auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('telaLogin').style.display = 'none';
        document.getElementById('painel').style.display = 'block';
        iniciarEscutaPedidos();
        verificarSeEhDonoDoServico(user.email); // roda sempre, inclusive com sessão já salva
    } else {
        document.getElementById('telaLogin').style.display = 'flex';
        document.getElementById('painel').style.display = 'none';
        idsRenderizados = new Set();
        primeiraCargaConcluida = false;
    }
});

// ---------- SOM DE ALERTA ----------

// O navegador só libera som depois de uma interação real do usuário com a página
// (é uma regra de segurança de todos os navegadores modernos, não um bug). Por isso,
// criamos o "contexto de áudio" uma vez só, e destravamos ele no primeiro clique.
let audioCtxGlobal = null;
let configAlertaSonoro = 'classico';

function inicializarAudioContext() {
    if (audioCtxGlobal) return;
    try {
        audioCtxGlobal = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('AudioContext indisponível:', e);
    }
}
document.addEventListener('click', inicializarAudioContext, { once: true });

// Cada som é uma sequência de notas (frequência, atraso em ms, e duração em segundos)
const PRESETS_SOM_ALERTA = {
    classico: [{ freq: 880, atraso: 0, duracao: 0.45 }, { freq: 1046, atraso: 260, duracao: 0.45 }],
    suave: [{ freq: 523, atraso: 0, duracao: 0.6 }, { freq: 659, atraso: 350, duracao: 0.6 }],
    urgente: [{ freq: 988, atraso: 0, duracao: 0.18 }, { freq: 988, atraso: 200, duracao: 0.18 }, { freq: 988, atraso: 400, duracao: 0.18 }],
    sino: [{ freq: 1318, atraso: 0, duracao: 0.9 }]
};

function tocarAlerta(presetForcado) {
    if (!audioCtxGlobal) inicializarAudioContext();
    if (!audioCtxGlobal) return;
    if (audioCtxGlobal.state === 'suspended') audioCtxGlobal.resume();

    const notas = PRESETS_SOM_ALERTA[presetForcado || configAlertaSonoro] || PRESETS_SOM_ALERTA.classico;
    try {
        notas.forEach(nota => {
            setTimeout(() => {
                const osc = audioCtxGlobal.createOscillator();
                const gain = audioCtxGlobal.createGain();
                osc.type = 'sine';
                osc.frequency.value = nota.freq;
                gain.gain.setValueAtTime(0.001, audioCtxGlobal.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.3, audioCtxGlobal.currentTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtxGlobal.currentTime + nota.duracao);
                osc.connect(gain);
                gain.connect(audioCtxGlobal.destination);
                osc.start();
                osc.stop(audioCtxGlobal.currentTime + nota.duracao);
            }, nota.atraso);
        });
    } catch (e) {
        console.log('Não foi possível tocar o alerta sonoro:', e);
    }
}

function escutarConfigSomAlerta() {
    db.ref('configuracao/alertaSonoro').on('value', snap => {
        configAlertaSonoro = snap.val() || 'classico';
        const sel = document.getElementById('selectSomAlerta');
        if (sel && document.activeElement !== sel) sel.value = configAlertaSonoro;
    });
}

function salvarSomAlerta() {
    const valor = document.getElementById('selectSomAlerta').value;
    db.ref('configuracao/alertaSonoro').set(valor)
        .then(() => alert('Som de alerta salvo! Esse vai ser o som usado a partir de agora.'))
        .catch(err => alert('Não foi possível salvar: ' + err.message));
}

// ---------- HELPERS ----------

// Guarda o formato de impressão escolhido (80mm ou 58mm), lido do Firebase ao carregar o painel
let formatoImpressaoAtual = '80mm';
let adicionaisAtivo = false; // controla se o campo de adicionais aparece no cadastro de produto

function salvarFormatoImpressao(formato) {
    formatoImpressaoAtual = formato;
    marcarFormatoSelecionado(formato);
    db.ref('configuracao/impressora/formato').set(formato)
        .catch(err => alert('Não foi possível salvar o formato de impressão: ' + err.message));
}

function marcarFormatoSelecionado(formato) {
    document.getElementById('btnFormato80mm').classList.toggle('selecionado', formato === '80mm');
    document.getElementById('btnFormato58mm').classList.toggle('selecionado', formato === '58mm');
}

function escutarFormatoImpressao() {
    db.ref('configuracao/impressora/formato').on('value', snap => {
        formatoImpressaoAtual = snap.val() || '80mm';
        marcarFormatoSelecionado(formatoImpressaoAtual);
    });
}

// Ajusta a impressão (tamanho da página + fonte) pro formato de bobina escolhido, injetando
// um <style> na hora — feito assim porque o navegador não permite um "@page" só pra um trecho
// específico da página, então precisa ser a regra @page inteira do documento, trocada na hora
function aplicarFormatoImpressao() {
    let estilo = document.getElementById('estiloFormatoImpressao');
    if (!estilo) {
        estilo = document.createElement('style');
        estilo.id = 'estiloFormatoImpressao';
        document.head.appendChild(estilo);
    }
    const larguraPagina = formatoImpressaoAtual === '58mm' ? '58mm' : '80mm';
    estilo.textContent = `@page { size: ${larguraPagina} auto; margin: 2mm; }`;

    document.body.classList.remove('formato-80mm', 'formato-58mm');
    document.body.classList.add('formato-' + formatoImpressaoAtual);
}

function formatarPreco(v) {
    return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function formatarHora(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Monta um "ticket" simples e limpo de um pedido, pronto pra imprimir (ex: pra levar pra cozinha)
function montarHtmlTicketImpressao(pedido, numeroPedido) {
    const tipoLabel = pedido.tipoEntrega === 'entrega' ? '🛵 Delivery' : '🏠 Retirada no local';
    const enderecoLinha = pedido.tipoEntrega === 'entrega'
        ? `<p><strong>Endereço:</strong> ${formatarEnderecoResumo(pedido.endereco)}</p>`
        : '';
    const numeroHtml = numeroPedido
        ? `<p class="ticket-numero">🛒 Pedido #${String(numeroPedido).padStart(3, '0')}</p>`
        : '';
    const itensHtml = (pedido.itens || []).map(item => `
        <div class="ticket-item">
            <strong>${item.quantidade}x ${item.nome}</strong>
            ${item.observacao ? `<div class="ticket-obs">↳ ${item.observacao}</div>` : ''}
            ${item.adicionaisTexto ? `<div class="ticket-obs">↳ ${item.adicionaisTexto}</div>` : ''}
        </div>
    `).join('');

    return `
        <div class="ticket-cabecalho">
            <h2>${LOJA_CONFIG.nome}</h2>
            ${numeroHtml}
            <p>${formatarHora(pedido.timestamp) || 'Não informado'}</p>
        </div>
        <hr>
        <p><strong>Cliente:</strong> ${pedido.nome || 'Não informado'}</p>
        <p><strong>Telefone:</strong> ${pedido.telefone || 'Não informado'}</p>
        <p><strong>${tipoLabel}</strong></p>
        ${enderecoLinha}
        <hr>
        <h3>Itens do pedido</h3>
        ${itensHtml}
        <hr>
        <p><strong>Forma de pagamento:</strong> ${pedido.formaPagamento || 'Não informado'}</p>
        ${pedido.troco ? `<p><strong>Troco para:</strong> R$ ${pedido.troco}</p>` : ''}
        ${pedido.observacoes ? `<p><strong>Observações:</strong> ${pedido.observacoes}</p>` : ''}
        ${pedido.recompensaResgatada ? `<p><strong>🎁 RESGATE DO CLUBE:</strong> ${pedido.recompensaResgatada.descricao}</p>` : ''}
        ${pedido.dataEncomenda ? `<p><strong>📅 ENCOMENDA PRA:</strong> ${pedido.dataEncomenda.split('-').reverse().join('/')}</p>` : ''}
        ${pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal' ? `<p><strong>💰 SINAL:</strong> ${pedido.pagamento.percentualSinal}% do produto pago (${formatarPreco(pedido.pagamento.valorSinal)}) — falta ${formatarPreco(totalDoPedido(pedido) - pedido.pagamento.valorSinal)} na entrega${pedido.pagamento.freteInformado > 0 ? ` (esse valor já inclui o frete de ${formatarPreco(pedido.pagamento.freteInformado)})` : ''}</p>` : ''}
        <hr>
        <p class="ticket-total"><strong>Total: ${formatarPreco(totalDoPedido(pedido))}</strong></p>
    `;
}

function imprimirPedidoIndividual(id) {
    const pedido = pedidosParaImpressao[id];
    if (!pedido) { alert('Não foi possível encontrar os dados desse pedido pra imprimir.'); return; }
    const areaImpressao = document.getElementById('areaImpressaoPedido');
    areaImpressao.innerHTML = montarHtmlTicketImpressao(pedido, pedido.numero || null);
    aplicarFormatoImpressao();
    window.print();
}

// Imprime o relatório de fechamento — copia o conteúdo pra mesma área usada nos tickets
// individuais (fora do painel), em vez de imprimir direto de dentro do painel, que gerava
// páginas em branco (o painel inteiro, mesmo escondido, ainda ocupava espaço no layout)
function imprimirFechamento() {
    const conteudo = document.getElementById('fechamentoConteudo');
    const areaImpressao = document.getElementById('areaImpressaoPedido');
    if (!conteudo || !areaImpressao) return;
    areaImpressao.innerHTML = conteudo.innerHTML;
    aplicarFormatoImpressao();
    window.print();
}

// ---------- MONTAGEM DO CARD DE PEDIDO ----------

// Guarda os dados de cada pedido renderizado, pra poder imprimir sem precisar buscar de novo
let pedidosParaImpressao = {};

// Monta a etiqueta de status do pagamento online (separado do status do pedido em si).
// Pedidos sem pagamento online (Pix/Cartão/Dinheiro combinado na entrega) não têm esse
// campo — nesse caso não mostra nada extra, é o comportamento normal de sempre.
function montarTagPagamento(pedido) {
    if (!pedido.pagamento) return '';
    const p = pedido.pagamento;
    const ehSinal = p.tipoPagamento === 'sinal';
    const totalPedido = totalDoPedido(pedido);
    const restante = ehSinal && p.valorSinal != null ? formatarPreco(totalPedido - p.valorSinal) : null;
    const freteTexto = ehSinal && p.freteInformado > 0 ? ` (esse valor já inclui o frete de ${formatarPreco(p.freteInformado)})` : '';

    const tags = {
        aguardando: ehSinal
            ? `<span class="pedido-tag tag-pagamento-aguardando">🟡 Aguardando sinal (${p.percentualSinal}% do produto = ${formatarPreco(p.valorSinal)})${p.freteInformado > 0 ? ` — frete de ${formatarPreco(p.freteInformado)} fica separado, pago na entrega` : ''}</span>`
            : '<span class="pedido-tag tag-pagamento-aguardando">🟡 Aguardando pagamento</span>',
        pago: ehSinal
            ? `<span class="pedido-tag tag-pagamento-pago">🟢 Sinal pago (${formatarPreco(p.valorSinal)}, só do produto) — falta ${restante} na entrega${freteTexto}</span>`
            : `<span class="pedido-tag tag-pagamento-pago">🟢 Pago (${p.metodo || 'Online'})</span>`,
        divergente: '<span class="pedido-tag tag-pagamento-divergente">⚠️ Valor divergente — confira</span>'
    };
    let html = tags[p.status] || '';
    if (p.status === 'pago' && p.receiptUrl) {
        html += ` <a href="${p.receiptUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🧾 Ver comprovante</a>`;
    }
    if (p.status === 'aguardando' && p.checkoutUrl) {
        html += ` <a href="${p.checkoutUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🔗 Abrir pagamento</a>`;
    }
    return html;
}

function montarCardPedido(id, pedido, comAcoes) {
    pedidosParaImpressao[id] = pedido;

    const div = document.createElement('div');
    div.classList.add('pedido-card');
    if (comAcoes) {
        div.classList.add('novo');
        div.id = `pendente-${id}`; // id só usado na lista de pendentes, pra remover certinho
    }

    let itensHtml = '';
    (pedido.itens || []).forEach(item => {
        itensHtml += `<li><span>${item.quantidade}x ${item.nome}${item.adicionaisTexto ? ` <em>(${item.adicionaisTexto})</em>` : ''}</span><span>${formatarPreco(item.preco * item.quantidade)}</span></li>`;
    });

    let enderecoHtml = '';
    if (pedido.tipoEntrega === 'entrega' && pedido.endereco) {
        const e = pedido.endereco;
        enderecoHtml = `<div class="pedido-endereco">📍 ${e.rua || ''}, ${e.numero || ''} ${e.complemento ? '(' + e.complemento + ')' : ''} — ${e.bairro || ''}, ${e.cidade || ''}/${e.estado || ''} — CEP ${e.cep || ''}</div>`;
    }

    const obsHtml = pedido.observacoes ? `<div class="pedido-obs">📝 ${pedido.observacoes}</div>` : '';
    const resgateHtml = pedido.recompensaResgatada
        ? `<div class="pedido-resgate">🎁 Cliente do Clube resgatou: <strong>${pedido.recompensaResgatada.descricao}</strong> — separa isso no pedido!</div>`
        : '';
    const encomendaHtml = pedido.dataEncomenda
        ? `<div class="pedido-resgate">📅 Encomenda pra <strong>${pedido.dataEncomenda.split('-').reverse().join('/')}</strong> — confirma a disponibilidade com o cliente!</div>`
        : '';

    const tagStatus = {
        pendente: '<span class="pedido-tag tag-status-pendente">Pendente</span>',
        aceito: '<span class="pedido-tag tag-status-aceito">Aceito</span>',
        em_rota: '<span class="pedido-tag tag-status-em-rota">🛵 Em rota</span>',
        entregue: '<span class="pedido-tag tag-status-entregue">✅ Entregue</span>',
        recusado: '<span class="pedido-tag tag-status-recusado">Recusado</span>'
    }[pedido.status] || '';

    let freteLinha = '';
    if (pedido.tipoEntrega === 'entrega') {
        freteLinha = `<div class="pedido-total-linha"><span>Entrega</span><span>${pedido.frete != null ? formatarPreco(pedido.frete) : 'A confirmar'}</span></div>`;
    }

    div.innerHTML = `
        <div class="pedido-topo">
            <div>
                <div class="pedido-cliente">${pedido.numero ? `<span class="pedido-numero">🛒Pedido #${String(pedido.numero).padStart(3, '0')}</span> - ` : ''}${pedido.nome || 'Cliente'}</div>
                <div>
                    <span class="pedido-tag ${pedido.tipoEntrega === 'entrega' ? 'tag-entrega' : 'tag-retirada'}">${pedido.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏠 Retirada'}</span>
                    <span class="pedido-tag tag-pagamento">💰 ${pedido.formaPagamento || ''}${pedido.troco ? ' (troco p/ ' + pedido.troco + ')' : ''}</span>
                    ${montarTagPagamento(pedido)}
                    ${tagStatus}
                </div>
            </div>
            <div class="pedido-hora">${formatarHora(pedido.timestamp)}</div>
        </div>
        ${resgateHtml}
        ${encomendaHtml}
        <div>📞 ${pedido.telefone || ''}</div>
        <ul class="pedido-itens">${itensHtml}</ul>
        <div class="pedido-total-linha"><span>Subtotal</span><span>${formatarPreco(pedido.subtotal)}</span></div>
        ${freteLinha}
        <div class="pedido-total-linha total-final"><span>Total</span><span>${pedido.total != null ? formatarPreco(pedido.total) : 'A confirmar'}</span></div>
        ${enderecoHtml}
        ${obsHtml}
        <div class="pedido-imprimir-linha">
            <button class="btn-imprimir-pedido" onclick="imprimirPedidoIndividual('${id}')">🖨️ Imprimir</button>
        </div>
        ${comAcoes ? montarBotoesAcaoPedido(id, pedido) : ''}
    `;
    return div;
}

function montarBotoesAcaoPedido(id, pedido) {
    if (pedido.status === 'pendente') {
        return `
        <div class="pedido-acoes">
            <button class="btn-aceitar" onclick="responderPedido('${id}', 'aceito')">✅ Aceitar</button>
            <button class="btn-recusar" onclick="responderPedido('${id}', 'recusado')">✖ Recusar</button>
        </div>`;
    }
    if (pedido.status === 'aceito') {
        const btnRota = pedido.tipoEntrega === 'entrega'
            ? `<button class="btn-em-rota" onclick="responderPedido('${id}', 'em_rota')">🛵 Saiu para entrega</button>`
            : '';
        return `
        <div class="pedido-acoes">
            ${btnRota}
            <button class="btn-entregue" onclick="responderPedido('${id}', 'entregue')">✅ Marcar como Entregue</button>
        </div>`;
    }
    if (pedido.status === 'em_rota') {
        return `
        <div class="pedido-acoes">
            <button class="btn-entregue" onclick="responderPedido('${id}', 'entregue')">✅ Marcar como Entregue</button>
        </div>`;
    }
    return '';
}

function responderPedido(id, novoStatus) {
    const pedidoRef = db.ref('pedidos/' + id);
    pedidoRef.once('value').then(snap => {
        const pedido = snap.val();
        if (!pedido) return;
        // Proteção: se já estava entregue, não credita pontos de novo (evita clique duplo)
        if (novoStatus === 'entregue' && pedido.status === 'entregue') return;

        return pedidoRef.update({ status: novoStatus }).then(() => {
            if (novoStatus === 'entregue') {
                creditarPontosFidelidade(pedido);
            }
        });
    }).catch(err => alert('Não foi possível atualizar o pedido: ' + err.message));
}

function atualizarContador() {
    document.getElementById('contadorPendentes').textContent = idsRenderizados.size;
}

// ---------- ESCUTA EM TEMPO REAL ----------

// ---------- STATUS / HORÁRIO DA LOJA ----------

const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const horariosPadraoAdmin = [
    { aberto: true, abre: '09:00', fecha: '13:00' }, // Domingo
    { aberto: true, abre: '10:00', fecha: '18:00' }, // Segunda
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Terça
    { aberto: true, abre: '09:00', fecha: '18:00' }, // Quarta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Quinta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Sexta
    { aberto: true, abre: '09:00', fecha: '16:00' }  // Sábado
];

function montarLinhasHorario(horarios) {
    const container = document.getElementById('listaHorarios');
    container.innerHTML = '';
    diasSemana.forEach((nomeDia, i) => {
        const dia = (horarios && horarios[i]) || horariosPadraoAdmin[i];
        const linha = document.createElement('div');
        linha.classList.add('linha-horario');
        linha.innerHTML = `
            <label class="dia-checkbox">
                <input type="checkbox" id="diaAberto${i}" ${dia.aberto ? 'checked' : ''}> ${nomeDia}
            </label>
            <input type="time" id="diaAbre${i}" value="${dia.abre}">
            <span>até</span>
            <input type="time" id="diaFecha${i}" value="${dia.fecha}">
        `;
        container.appendChild(linha);
    });
}

function salvarHorarios() {
    const horarios = diasSemana.map((_, i) => ({
        aberto: document.getElementById('diaAberto' + i).checked,
        abre: document.getElementById('diaAbre' + i).value || '08:00',
        fecha: document.getElementById('diaFecha' + i).value || '18:00'
    }));
    db.ref('configuracao/loja/horarios').set(horarios)
        .then(() => {
            const msg = document.getElementById('horariosSalvosMsg');
            msg.textContent = '✅ Horários salvos!';
            setTimeout(() => { msg.textContent = ''; }, 3000);
        })
        .catch(err => alert('Erro ao salvar horários: ' + err.message));
}

// Só ESCREVE o modo escolhido; quem atualiza os botões na tela é o listener em escutarConfigLoja()
function definirModoLoja(modo) {
    db.ref('configuracao/loja/modoManual').set(modo)
        .catch(err => alert('Erro ao atualizar o status da loja: ' + err.message));
}

// Ativa/desativa o botão "Pagar Online Agora" no cardápio. Fica desativado por padrão
// (inclusive em qualquer cliente novo do template) — só liga depois que a loja realmente
// configurou a InfiniteTag e testou, evitando o cliente ver um botão quebrado.
// Ativa/desativa o recurso de Adicionais por Produto — quando desativado, o campo some
// do formulário de cadastro (deixa mais simples pra quem não usa) e o modal de escolha
// nunca aparece pro cliente, mesmo que algum produto ainda tenha grupos configurados
// Aceita tanto vírgula quanto ponto como separador decimal (ex: "45,00" ou "45.00")
function paraNumeroFlexivel(texto) {
    if (!texto) return 0;
    const n = parseFloat(String(texto).trim().replace(',', '.'));
    return isNaN(n) || n < 0 ? 0 : n;
}

// Lista antiga de bairros que estava fixa no código, usada só pela função de
// "importar" — trazer pro painel sem o cliente perder nada do que já tinha configurado
const BAIRROS_ANTIGOS_PARA_IMPORTAR = {
  "barbados": 0,
  "colatina velha": 8,
  "centro": 9,
  "lace": 10,
  "esplanada": 9.7,
  "mario giurizatto": 6.2,
  "sao silvano": 11,
  "marista": 11,
  "fazenda vitali": 10.5,
  "maria ismenia": 11,
  "maria esmenia": 11,
  "vila lenira": 11,
  "vila nova": 10,
  "vila amelia": 12,
  "vila real": 12,
  "operario": 9,
  "bela vista": 9,
  "residencial nobre": 10,
  "vista da serra": 10,
  "honorio fraga": 15,
  "castelo branco": 10,
  "maria das gracas": 9,
  "morada do sol": 14,
  "perpetuo socorro": 10,
  "nossa senhora aparecida": 12,
  "jardim planalto": 11,
  "moacir brotas": 11,
  "moacyr brotas": 11,
  "por do sol": 9,
  "sao pedro": 15,
  "sao judas tadeu": 9,
  "sao braz": 10,
  "santo antonio": 12,
  "santa helena": 7,
  "santa margarida": 7,
  "santa monica": 11,
  "riviera": 8,
  "francisco simonassi": 12.3,
  "fioravante marino": 12,
  "cidade jardim": 14,
  "aeroporto": 12,
  "ayrton senna": 20,
  "alto sao vicente": 10,
  "alto vila nova": 10,
  "adelia giuberti": 10,
  "antonio damiani": 12,
  "benjamin carlos dos santos": 7,
  "carlos germano naumann": 14,
  "industrial alves marques": 12,
  "novo horizonte": 14,
  "sao marcos": 14,
  "vicente soella i": 25,
  "vicente soella ii": 27,
  "vicente soella iii": 29,
  "vila verde": 15,
  "vista linda": 15,
  "santos dumont": 15,
  "raul giuberti": 12,
  "olivio zanoteli": 13,
  "padre jose de anchieta": 12.3,
  "parque dos jacarandas": 12
};

let configFreteAtual = {}; // guarda a última config de frete lida, pra renderizar a lista filtrada

function escutarConfigFrete() {
    db.ref('configuracao/frete').on('value', snap => {
        const config = snap.val() || {};
        configFreteAtual = config;

        const campoValorKm = document.getElementById('valorPorKmConfig');
        if (campoValorKm) campoValorKm.value = config.valorPorKm != null ? config.valorPorKm : '';
        const campoValorKmEncomenda = document.getElementById('valorPorKmEncomendaConfig');
        if (campoValorKmEncomenda) campoValorKmEncomenda.value = config.valorPorKmEncomenda != null ? config.valorPorKmEncomenda : '';

        const avisoImportar = document.getElementById('avisoImportarBairros');
        const temBairros = config.bairros && Object.keys(config.bairros).length > 0;
        if (avisoImportar) avisoImportar.style.display = temBairros ? 'none' : 'block';

        renderizarListaBairros();
    });
}

function salvarValorPorKm() {
    const valor = parseFloat(String(document.getElementById('valorPorKmConfig').value).replace(',', '.'));
    const valorEncomenda = parseFloat(String(document.getElementById('valorPorKmEncomendaConfig').value).replace(',', '.'));
    const msgEl = document.getElementById('valorPorKmMsg');
    if (isNaN(valor) || valor < 0) { msgEl.textContent = 'Digita um valor válido pro km normal.'; return; }
    if (isNaN(valorEncomenda) || valorEncomenda < 0) { msgEl.textContent = 'Digita um valor válido pro km de encomenda.'; return; }
    db.ref('configuracao/frete').update({ valorPorKm: valor, valorPorKmEncomenda: valorEncomenda })
        .then(() => { msgEl.textContent = 'Salvo!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Salva (ou edita, se já existir com esse nome) um bairro — nome sempre guardado em
// minúsculo, pra bater com a busca que o cardápio já faz na hora de calcular o frete
function salvarBairro() {
    const nome = document.getElementById('novoBairroNome').value.trim().toLowerCase();
    const km = parseFloat(String(document.getElementById('novoBairroKm').value).replace(',', '.'));
    const msgEl = document.getElementById('bairroMsg');
    if (!nome) { msgEl.textContent = 'Digita o nome do bairro.'; return; }
    if (isNaN(km) || km < 0) { msgEl.textContent = 'Digita uma distância válida (em km).'; return; }

    db.ref('configuracao/frete/bairros/' + encodeURIComponent(nome)).set(km)
        .then(() => {
            msgEl.textContent = 'Bairro salvo!';
            document.getElementById('novoBairroNome').value = '';
            document.getElementById('novoBairroKm').value = '';
        })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function removerBairro(nomeCodificado) {
    if (!confirm('Remover esse bairro da lista de entrega?')) return;
    db.ref('configuracao/frete/bairros/' + nomeCodificado).remove()
        .catch(err => alert('Erro ao remover: ' + err.message));
}

// Mostra a lista de bairros já cadastrados, filtrando pela busca (se tiver algo digitado)
function renderizarListaBairros() {
    const container = document.getElementById('listaBairrosCadastrados');
    if (!container) return;
    const busca = (document.getElementById('buscaBairro').value || '').toLowerCase();
    const bairros = configFreteAtual.bairros || {};
    const entradas = Object.entries(bairros)
        .map(([nomeCodificado, km]) => ({ nomeCodificado, nome: decodeURIComponent(nomeCodificado), km }))
        .filter(b => b.nome.includes(busca))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (entradas.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhum bairro encontrado.</p>';
        return;
    }
    container.innerHTML = entradas.map(b => `
        <div class="loja-status-card" style="margin-bottom:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="text-transform:capitalize;">${b.nome} <span class="dica-secao">(${b.km} km)</span></span>
            <button class="btn-secondary" onclick="removerBairro('${b.nomeCodificado}')">Remover</button>
        </div>
    `).join('');
}

// Traz a lista antiga (que estava fixa no código) pro painel de uma vez só — não some
// nada do que a loja já tinha, só passa a poder editar por aqui daqui pra frente
function importarBairrosAntigos() {
    const quantidade = Object.keys(BAIRROS_ANTIGOS_PARA_IMPORTAR).length;
    if (quantidade === 0) {
        alert('Não há nenhuma lista antiga pra importar — cadastra os bairros direto no formulário abaixo.');
        return;
    }
    if (!confirm(`Importar ${quantidade} bairros pro painel?`)) return;
    const atualizacoes = {};
    Object.entries(BAIRROS_ANTIGOS_PARA_IMPORTAR).forEach(([nome, km]) => {
        atualizacoes['configuracao/frete/bairros/' + encodeURIComponent(nome)] = km;
    });
    db.ref().update(atualizacoes)
        .then(() => alert('Bairros importados com sucesso!'))
        .catch(err => alert('Erro ao importar: ' + err.message));
}

function salvarPedidoMinimoEFreteGratis() {
    const pedidoMinimo = paraNumeroFlexivel(document.getElementById('valorPedidoMinimo').value);
    const freteGratisAcima = paraNumeroFlexivel(document.getElementById('valorFreteGratisAcima').value);
    const msgEl = document.getElementById('pedidoMinimoMsg');

    db.ref('configuracao/loja').update({ pedidoMinimo, freteGratisAcima })
        .then(() => { msgEl.textContent = 'Salvo!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function salvarAdicionaisAtivo(ativo) {
    db.ref('configuracao/loja/adicionaisAtivo').set(!!ativo)
        .catch(err => alert('Erro ao atualizar os adicionais: ' + err.message));
}

function salvarPagamentoOnlineAtivo(ativo) {
    db.ref('configuracao/loja/pagamentoOnlineAtivo').set(!!ativo)
        .catch(err => alert('Erro ao atualizar o pagamento online: ' + err.message));
}

function marcarModoSelecionado(modo) {
    document.getElementById('btnModoAuto').classList.toggle('selecionado', modo === 'auto');
    document.getElementById('btnModoAberto').classList.toggle('selecionado', modo === 'aberto');
    document.getElementById('btnModoFechado').classList.toggle('selecionado', modo === 'fechado');
}

function calcularAbertoPorHorarioAdmin(horarios) {
    const agora = new Date();
    const diaSemana = agora.getDay();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const diaConfig = (horarios && horarios[diaSemana]) || horariosPadraoAdmin[diaSemana];
    if (!diaConfig || !diaConfig.aberto) return false;
    const [ha, ma] = diaConfig.abre.split(':').map(Number);
    const [hf, mf] = diaConfig.fecha.split(':').map(Number);
    return minutosAgora >= (ha * 60 + ma) && minutosAgora < (hf * 60 + mf);
}

// Mesmos limites de pontos usados no cardápio (Bronze/Prata/Ouro/VIP), pra manter o painel
// mostrando exatamente o mesmo nível que o cliente vê do lado dele
function calcularNivelAdmin(pontos, cfg) {
    if (pontos >= (cfg.minVip || 200)) return { nome: 'VIP', emoji: '💎' };
    if (pontos >= (cfg.minOuro || 100)) return { nome: 'Ouro', emoji: '🥇' };
    if (pontos >= (cfg.minPrata || 50)) return { nome: 'Prata', emoji: '🥈' };
    return { nome: 'Bronze', emoji: '🥉' };
}

// Busca clientes do Clube de Fidelidade que não compram há um tempo, cruzando com o
// histórico real de pedidos (não confia só na data de cadastro do clube). Não envia nada
// sozinho — só monta a lista, com um botão que abre o WhatsApp já com a mensagem pronta.
// Cada card abre (ao clicar) mostrando nível, pontos e as recompensas já resgatadas.
// Atualiza a prévia visual e os contadores de caracteres, conforme a pessoa digita
function atualizarPreviaNotificacao() {
    const titulo = document.getElementById('notifPersonalizadaTitulo').value;
    const corpo = document.getElementById('notifPersonalizadaCorpo').value;
    document.getElementById('contadorTitulo').textContent = `${titulo.length}/50`;
    document.getElementById('contadorMensagem').textContent = `${corpo.length}/200`;
    document.getElementById('previaTitulo').textContent = titulo || 'Título aparece aqui';
    document.getElementById('previaCorpo').textContent = corpo || 'A mensagem aparece aqui, do jeito que o cliente vai ver.';
}

// Preenche os campos com um modelo pronto — a pessoa ainda pode editar antes de enviar
function usarModeloNotificacao(titulo, corpo) {
    document.getElementById('notifPersonalizadaTitulo').value = titulo;
    document.getElementById('notifPersonalizadaCorpo').value = corpo;
    atualizarPreviaNotificacao();
}

// Mostra, em tempo real, quantos aparelhos estão prontos pra receber notificação —
// número real, direto do Firebase, nunca inventado
// Ativa/desativa o recurso de Agendamento de Encomendas — mesmo padrão do interruptor
// de pagamento online e adicionais: desativado some do cardápio, sem afetar nada mais
function salvarAgendamentoAtivo(ativo) {
    db.ref('configuracao/loja/agendamentoAtivo').set(!!ativo)
        .catch(err => alert('Erro ao atualizar o agendamento: ' + err.message));
}

// Salva a configuração do sinal (percentual + prazo de pagamento)
function salvarConfigSinal() {
    const percentualSinal = parseInt(document.getElementById('percentualSinal').value, 10) || 0;
    const prazoPagamentoHoras = parseInt(document.getElementById('prazoPagamentoHoras').value, 10) || 24;
    const msgEl = document.getElementById('configSinalMsg');
    db.ref('configuracao/agenda').update({ percentualSinal, prazoPagamentoHoras })
        .then(() => { msgEl.textContent = 'Salvo!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Salva o limite de encomendas por dia
// Salva toda a identidade da loja — nome, cores, contatos — sobrescrevendo o que está
// no loja-config.js, sem precisar editar código. Deixar um campo em branco volta a
// usar o padrão do arquivo, campo por campo (não é tudo ou nada).
// Cada recurso avançado tem seu próprio interruptor, liberado individualmente por você
// (dono do serviço) direto no Firebase — o cliente não tem como mudar isso sozinho.
// Mapeia o nome do recurso pro(s) elemento(s) do painel que ele controla.
const MAPA_RECURSOS = {
    cupons: { abas: ['cupons'] },
    fidelidade: { abas: ['fidelidade'] },
    agenda: { abas: ['agenda'], classesCorpo: ['ocultar-campo-encomenda-produto'] },
    notificacoes: { cards: ['cardNotificacoes'] },
    pagamentoOnline: { cards: ['cardAtivarPagamentoOnline'] },
    visitantes: { abas: ['visitantes'] },
    adicionais: { cards: ['cardAdicionaisPorProduto'] },
    pedidoMinimo: { cards: ['cardPedidoMinimoFreteGratis'] },
    areasDeEntrega: { cards: ['cardAreasDeEntrega'] },
    esconderProduto: { classesCorpo: ['ocultar-campo-esconder-produto'] },
    gestaoCompleta: { abas: ['gestao'], classesCorpo: ['ocultar-campo-ficha-tecnica'] }
};

function aplicarRecursosLiberados(recursos) {
    // Se o nó "recursosLiberados" nunca foi criado no Firebase desse cliente, trata
    // TUDO como liberado — não quebra quem (como a Brit's) já usava o painel inteiro
    // antes desse recurso existir. Só depois que você criar o nó (mesmo que vazio),
    // cada recurso passa a começar DESLIGADO até você liberar um por um.
    const nuncaConfigurado = recursos == null;

    Object.entries(MAPA_RECURSOS).forEach(([nomeRecurso, alvos]) => {
        const liberado = nuncaConfigurado || !!recursos[nomeRecurso];

        (alvos.abas || []).forEach(aba => {
            const botao = document.querySelector(`.painel-tab-btn[data-tab="${aba}"]`);
            if (botao) botao.style.display = liberado ? '' : 'none';
        });
        (alvos.cards || []).forEach(id => {
            const card = document.getElementById(id);
            if (card) card.style.display = liberado ? '' : 'none';
        });
        (alvos.classesCorpo || []).forEach(classe => {
            document.body.classList.toggle(classe, !liberado);
        });
    });
}

function escutarRecursosLiberados() {
    db.ref('configuracao/recursosLiberados').on('value', snap => {
        aplicarRecursosLiberados(snap.val());
    });
}

// Envia a logo pro Firebase Storage (não pro GitHub) — assim não precisa mexer em
// arquivo nenhum pra trocar a logo de um cliente. Sempre sobrescreve o mesmo arquivo
// (nome fixo "logo-principal"), pra não ir acumulando logo antiga sem usar.
function salvarCapacidadeAgenda() {
    const valor = parseInt(document.getElementById('capacidadeMaximaDia').value, 10) || 0;
    const msgEl = document.getElementById('capacidadeAgendaMsg');
    db.ref('configuracao/agenda/capacidadeMaximaDia').set(valor)
        .then(() => { msgEl.textContent = 'Salvo!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Guarda as datas que ainda não foram confirmadas — vai acumulando (dia a dia, ou por
// período) até a pessoa clicar em "Bloquear tudo da lista"
let datasPendentesDeBloqueio = new Set();

function renderizarListaPendenteBloqueio() {
    const container = document.getElementById('listaPendenteBloqueio');
    if (datasPendentesDeBloqueio.size === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhuma data na lista ainda.</p>';
        return;
    }
    const datasOrdenadas = [...datasPendentesDeBloqueio].sort();
    container.innerHTML = `<p class="campo-label">Lista pendente (${datasOrdenadas.length} dia(s)):</p>` +
        datasOrdenadas.map(data => `
            <span class="tag-data-pendente">
                ${data.split('-').reverse().join('/')}
                <button type="button" onclick="removerDataDaListaPendente('${data}')" title="Remover da lista">✕</button>
            </span>
        `).join('');
}

// Adiciona 1 dia à lista pendente
function adicionarDataNaListaPendente() {
    const data = document.getElementById('dataUnicaParaAdicionar').value;
    if (!data) return;
    datasPendentesDeBloqueio.add(data);
    document.getElementById('dataUnicaParaAdicionar').value = '';
    renderizarListaPendenteBloqueio();
}

// Adiciona todos os dias de um período (De/Até) de uma vez à lista pendente
function adicionarPeriodoNaListaPendente() {
    const dataInicio = document.getElementById('dataInicioBloqueio').value;
    const dataFim = document.getElementById('dataFimBloqueio').value || dataInicio;
    const msgEl = document.getElementById('bloquearDataMsg');
    if (!dataInicio) { msgEl.textContent = 'Escolhe pelo menos a data de início.'; return; }
    if (dataFim < dataInicio) { msgEl.textContent = 'A data final não pode ser antes da inicial.'; return; }

    let cursor = new Date(dataInicio + 'T00:00:00');
    const fim = new Date(dataFim + 'T00:00:00');
    while (cursor <= fim) {
        datasPendentesDeBloqueio.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
    }
    document.getElementById('dataInicioBloqueio').value = '';
    document.getElementById('dataFimBloqueio').value = '';
    msgEl.textContent = '';
    renderizarListaPendenteBloqueio();
}

// Tira uma data específica da lista pendente (antes de confirmar)
function removerDataDaListaPendente(data) {
    datasPendentesDeBloqueio.delete(data);
    renderizarListaPendenteBloqueio();
}

// Bloqueia de vez, no Firebase, todas as datas que estão na lista pendente
function confirmarBloqueioPendente() {
    const msgEl = document.getElementById('bloquearDataMsg');
    if (datasPendentesDeBloqueio.size === 0) { msgEl.textContent = 'Adiciona pelo menos 1 data na lista antes de confirmar.'; return; }

    const atualizacoes = {};
    datasPendentesDeBloqueio.forEach(data => {
        atualizacoes['configuracao/agenda/datasBloqueadas/' + data] = true;
    });

    db.ref().update(atualizacoes)
        .then(() => {
            msgEl.textContent = `${datasPendentesDeBloqueio.size} dia(s) bloqueado(s)!`;
            datasPendentesDeBloqueio = new Set();
            renderizarListaPendenteBloqueio();
        })
        .catch(err => { msgEl.textContent = 'Erro ao bloquear: ' + err.message; });
}

// Desbloqueia um dia que tinha sido bloqueado antes
function desbloquearDataAgenda(data) {
    db.ref('configuracao/agenda/datasBloqueadas/' + data).remove()
        .catch(err => alert('Erro ao desbloquear: ' + err.message));
}

// Escuta a configuração da agenda em tempo real, preenchendo o campo de capacidade
// e a lista de dias bloqueados
function escutarConfigAgenda() {
    db.ref('configuracao/agenda').on('value', snap => {
        const config = snap.val() || {};

        const campoCapacidade = document.getElementById('capacidadeMaximaDia');
        if (campoCapacidade) campoCapacidade.value = config.capacidadeMaximaDia || '';

        const campoPercentualSinal = document.getElementById('percentualSinal');
        if (campoPercentualSinal) campoPercentualSinal.value = config.percentualSinal || '';
        const campoPrazoPagamento = document.getElementById('prazoPagamentoHoras');
        if (campoPrazoPagamento) campoPrazoPagamento.value = config.prazoPagamentoHoras || '';

        const lista = document.getElementById('listaDatasBloqueadas');
        if (!lista) return;
        const datas = Object.keys(config.datasBloqueadas || {}).sort();
        if (datas.length === 0) {
            lista.innerHTML = '<p class="dica-secao">Nenhum dia bloqueado.</p>';
            return;
        }
        lista.innerHTML = datas.map(data => {
            const dataFormatada = data.split('-').reverse().join('/');
            return `
                <div class="loja-status-card" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <strong>${dataFormatada}</strong>
                    <button class="btn-secondary" onclick="desbloquearDataAgenda('${data}')">Desbloquear</button>
                </div>
            `;
        }).join('');
    });
}

function escutarContadorDestinatarios() {
    const el = document.getElementById('contadorDestinatarios');
    if (!el) return;
    db.ref('notificacaoTokens').on('value', snap => {
        const tokens = snap.val() || {};
        const total = Object.keys(tokens).length;
        el.textContent = `${total} ${total === 1 ? 'cliente' : 'clientes'}`;
    });
}

// Chama a Cloud Function que manda a notificação personalizada pra todo mundo que já
// ativou notificações no cardápio — o envio de verdade acontece no servidor, aqui só
// dispara e mostra o resultado
function enviarNotificacaoPersonalizadaDoPainel() {
    const titulo = document.getElementById('notifPersonalizadaTitulo').value.trim();
    const corpo = document.getElementById('notifPersonalizadaCorpo').value.trim();
    const msgEl = document.getElementById('notifPersonalizadaMsg');

    if (!titulo || !corpo) {
        msgEl.textContent = 'Preenche o título e a mensagem antes de enviar.';
        return;
    }

    const destinatariosTexto = document.getElementById('contadorDestinatarios').textContent;
    if (!confirm(`Enviar esta notificação para ${destinatariosTexto}?`)) return;

    msgEl.textContent = 'Enviando...';
    firebase.functions().httpsCallable('enviarNotificacaoPersonalizada')({ titulo, corpo })
        .then(resultado => {
            const { destinatarios, enviados, falhas } = resultado.data;
            if (destinatarios === 0) {
                msgEl.textContent = 'Ninguém ativou notificação ainda — ninguém pra receber.';
                return;
            }
            msgEl.textContent = `✅ Enviada! Destinatários: ${destinatarios} · Enviadas: ${enviados}${falhas > 0 ? ' · Falhas: ' + falhas : ''}`;
            document.getElementById('notifPersonalizadaTitulo').value = '';
            document.getElementById('notifPersonalizadaCorpo').value = '';
            atualizarPreviaNotificacao();
        })
        .catch(err => {
            msgEl.textContent = 'Erro ao enviar: ' + err.message;
        });
}

// Mostra as últimas notificações enviadas — vem direto do que a Cloud Function salvou,
// nunca inventado. Pega só as 20 mais recentes, pra não deixar a lista gigante com o tempo.
function escutarHistoricoNotificacoes() {
    const container = document.getElementById('listaHistoricoNotificacoes');
    if (!container) return;
    db.ref('notificacoesEnviadas').limitToLast(50).on('value', snap => {
        const registros = snap.val() || {};
        const lista = Object.entries(registros)
            .map(([id, n]) => ({ id, ...n }))
            .sort((a, b) => (b.timestamp || b.agendadoPara || b.criadoEm || 0) - (a.timestamp || a.agendadoPara || a.criadoEm || 0));

        if (lista.length === 0) {
            container.innerHTML = '<p class="dica-secao">Nenhuma notificação enviada ainda.</p>';
            return;
        }

        const tagsPorStatus = {
            agendada: '🟡 Agendada',
            enviada: '🟢 Enviada',
            falhou: '🔴 Falhou',
            cancelada: '❌ Cancelada'
        };

        container.innerHTML = lista.map(n => {
            // Pra agendada, mostra a data/hora agendada; pra já processada, mostra quando foi enviada
            const dataReferencia = n.status === 'agendada' ? n.agendadoPara : (n.timestamp || n.enviadoEm || n.agendadoPara);
            const data = dataReferencia ? new Date(dataReferencia) : null;
            const dataTexto = data ? data.toLocaleDateString('pt-BR') : '';
            const horaTexto = data ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
            const prefixoData = n.status === 'agendada' ? 'Agendada pra' : '';

            let linhaStatus = tagsPorStatus[n.status] || '🟢 Enviada'; // registros antigos, de antes do status existir
            if (n.status === 'enviada' && n.falhas > 0) {
                linhaStatus = `🟡 ${n.enviados} enviadas, ${n.falhas} falharam`;
            } else if (n.status === 'enviada' || !n.status) {
                linhaStatus = `🟢 Enviada · 👥 ${n.destinatarios || 0} destinatário(s)`;
            }

            const botaoCancelar = n.status === 'agendada'
                ? `<button class="btn-secondary" style="margin-top:6px;" onclick="cancelarNotificacaoAgendadaDoPainel('${n.id}')">Cancelar</button>`
                : '';

            return `
                <div class="loja-status-card" style="margin-bottom:8px;">
                    <strong>${n.titulo || ''}</strong>
                    <p style="margin:4px 0;">${n.corpo || ''}</p>
                    <p class="dica-secao" style="margin:0;">📅 ${prefixoData} ${dataTexto} 🕐 ${horaTexto} · ${linhaStatus}</p>
                    ${botaoCancelar}
                </div>
            `;
        }).join('');
    });
}

// Agenda a notificação pra ser enviada mais tarde — a Cloud Function processarNotificacoesAgendadas
// (rodando de 5 em 5 min) é quem realmente dispara, na hora certa
function agendarNotificacaoDoPainel() {
    const titulo = document.getElementById('notifPersonalizadaTitulo').value.trim();
    const corpo = document.getElementById('notifPersonalizadaCorpo').value.trim();
    const data = document.getElementById('notifAgendarData').value;
    const hora = document.getElementById('notifAgendarHora').value;
    const msgEl = document.getElementById('notifPersonalizadaMsg');

    if (!titulo || !corpo) {
        msgEl.textContent = 'Preenche o título e a mensagem antes de agendar.';
        return;
    }
    if (!data || !hora) {
        msgEl.textContent = 'Escolhe a data e o horário antes de agendar.';
        return;
    }

    const agendadoPara = new Date(`${data}T${hora}`).getTime();
    if (isNaN(agendadoPara) || agendadoPara <= Date.now()) {
        msgEl.textContent = 'Escolhe uma data/horário no futuro.';
        return;
    }

    msgEl.textContent = 'Agendando...';
    firebase.functions().httpsCallable('agendarNotificacao')({ titulo, corpo, agendadoPara })
        .then(() => {
            msgEl.textContent = '📅 Agendada com sucesso!';
            document.getElementById('notifPersonalizadaTitulo').value = '';
            document.getElementById('notifPersonalizadaCorpo').value = '';
            document.getElementById('notifAgendarData').value = '';
            document.getElementById('notifAgendarHora').value = '';
            atualizarPreviaNotificacao();
        })
        .catch(err => { msgEl.textContent = 'Erro ao agendar: ' + err.message; });
}

// Cancela uma notificação que ainda está agendada (a Cloud Function confere de novo se
// ainda dá tempo, então não tem risco de cancelar algo que já foi enviado)
function cancelarNotificacaoAgendadaDoPainel(id) {
    if (!confirm('Cancelar essa notificação agendada?')) return;
    firebase.functions().httpsCallable('cancelarNotificacaoAgendada')({ id })
        .catch(err => alert('Não foi possível cancelar: ' + err.message));
}

// ---------- Sistema de Gestão — Ingredientes ----------
let ingredientes = [];
let editingIngredienteId = null;

function escutarIngredientes() {
    db.ref('ingredientes').on('value', snap => {
        const val = snap.val() || {};
        ingredientes = Object.entries(val).map(([id, ing]) => ({ id, ...ing }));
        renderIngredientes();
        if (typeof popularSelectComponenteBase === 'function') popularSelectComponenteBase();
        if (typeof popularSelectComponenteFichaTecnica === 'function') popularSelectComponenteFichaTecnica();
        if (typeof popularSelectEstoqueIngrediente === 'function') popularSelectEstoqueIngrediente();
        if (typeof renderEstoque === 'function') renderEstoque();
    });
}

function custoUnitIngrediente(ing) {
    if (!ing || !ing.qtdComprada) return 0;
    return ing.precoComprado / ing.qtdComprada;
}

function salvarIngrediente() {
    const nome = document.getElementById('ingNome').value.trim();
    const unidade = document.getElementById('ingUnidade').value;
    const qtdComprada = parseFloat(document.getElementById('ingQtdComprada').value.replace(',', '.'));
    const precoComprado = parseFloat(document.getElementById('ingPreco').value.replace(',', '.'));
    const estoqueAtual = parseFloat(document.getElementById('ingEstoqueAtual').value.replace(',', '.'));
    const estoqueMinimo = parseFloat(document.getElementById('ingEstoqueMinimo').value.replace(',', '.'));
    const msgEl = document.getElementById('msgIngrediente');

    if (!nome || !qtdComprada || !precoComprado || isNaN(estoqueAtual) || isNaN(estoqueMinimo)) {
        msgEl.textContent = 'Preenche todos os campos.';
        return;
    }

    const obj = { nome, unidade, qtdComprada, precoComprado, estoqueAtual, estoqueMinimo };
    msgEl.textContent = 'Salvando...';

    const promessa = editingIngredienteId
        ? db.ref('ingredientes/' + editingIngredienteId).update(obj)
        : db.ref('ingredientes').push(obj);

    promessa.then(() => {
        msgEl.textContent = 'Salvo!';
        ['ingNome', 'ingQtdComprada', 'ingPreco', 'ingEstoqueAtual', 'ingEstoqueMinimo'].forEach(id => document.getElementById(id).value = '');
        if (editingIngredienteId) {
            editingIngredienteId = null;
            document.getElementById('btnSalvarIngrediente').textContent = '+ Adicionar Ingrediente';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function renderIngredientes() {
    const busca = (document.getElementById('buscaIngrediente').value || '').toLowerCase();
    const container = document.getElementById('listaIngredientes');
    const filtrados = ingredientes.filter(i => i.nome.toLowerCase().includes(busca));

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhum ingrediente cadastrado ainda.</p>';
        return;
    }

    container.innerHTML = filtrados.map(ing => {
        const custoUnit = custoUnitIngrediente(ing);
        const baixo = (ing.estoqueAtual || 0) < (ing.estoqueMinimo || 0);
        return `
            <div class="pedido-card" style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${ing.nome}</strong>
                    <span class="pedido-tag ${baixo ? 'tag-pagamento-divergente' : 'tag-pagamento-pago'}">${baixo ? '⚠️ Estoque baixo' : 'OK'}</span>
                </div>
                <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                    ${formatarPreco(custoUnit)}/${ing.unidade} · Estoque: ${(ing.estoqueAtual || 0).toFixed(2)} ${ing.unidade}
                </p>
                <button class="btn-secondary" onclick="editarIngrediente('${ing.id}')">✏️ Editar</button>
                <button class="btn-excluir-cupom" onclick="excluirIngrediente('${ing.id}')">🗑️</button>
            </div>
        `;
    }).join('');
}

function editarIngrediente(id) {
    const ing = ingredientes.find(i => i.id === id);
    if (!ing) return;
    document.getElementById('ingNome').value = ing.nome;
    document.getElementById('ingUnidade').value = ing.unidade;
    document.getElementById('ingQtdComprada').value = ing.qtdComprada;
    document.getElementById('ingPreco').value = ing.precoComprado;
    document.getElementById('ingEstoqueAtual').value = ing.estoqueAtual;
    document.getElementById('ingEstoqueMinimo').value = ing.estoqueMinimo;
    editingIngredienteId = id;
    document.getElementById('btnSalvarIngrediente').textContent = 'Atualizar Ingrediente';
    document.getElementById('tituloCadastroIngrediente').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function excluirIngrediente(id) {
    if (!confirm('Excluir este ingrediente? Se ele estiver em uso em alguma base ou produto, isso pode afetar o cálculo de custo deles.')) return;
    db.ref('ingredientes/' + id).remove().catch(err => alert('Erro ao excluir: ' + err.message));
}

// ---------- Sistema de Gestão — Bases ----------
let bases = [];
let tempBaseComponentes = [];
let editingBaseId = null;

// Troca de sub-aba dentro da mega-aba "Gestão" — mesma lógica das abas
// principais, só que dentro de um container menor (não mexe na URL/localStorage)
function mostrarSubabaGestao(subaba) {
    document.querySelectorAll('.gestao-subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subaba);
    });
    document.querySelectorAll('.gestao-subconteudo').forEach(div => {
        div.style.display = div.dataset.subtabContent === subaba ? 'block' : 'none';
    });
}

function escutarBases() {
    db.ref('bases').on('value', snap => {
        const val = snap.val() || {};
        bases = Object.entries(val).map(([id, b]) => ({ id, ...b }));
        renderBases();
        popularSelectComponenteBase();
        if (typeof popularSelectComponenteFichaTecnica === 'function') popularSelectComponenteFichaTecnica();
        if (typeof renderFichaTecnica === 'function' && fichaTecnica.length > 0) renderFichaTecnica();
    });
}

function getBase(id) { return bases.find(b => b.id === id); }
// Componentes podem vir em 2 formatos: o novo ({tipo:'ingrediente'|'base', id}) e um
// mais antigo do Sistema de Gestão anterior, de antes de existir "base dentro de base"
// ({ingredienteId}, sempre um ingrediente, sem o campo tipo)
function idIngredienteComponente(c) {
    if (c.tipo === 'ingrediente') return c.id;
    if (!c.tipo && c.ingredienteId) return c.ingredienteId; // formato antigo
    return null;
}
function idBaseComponente(c) { return c.tipo === 'base' ? c.id : null; }

// Verifica se "candidataId" já usa (direta ou indiretamente) "baseAlvoId" — evita
// que uma base acabe dependendo dela mesma através de uma cadeia de outras bases
function baseUsaBase(candidataId, baseAlvoId, visitados) {
    if (!baseAlvoId) return false;
    if (candidataId === baseAlvoId) return true;
    visitados = visitados || new Set();
    if (visitados.has(candidataId)) return false;
    visitados.add(candidataId);
    const candidata = getBase(candidataId);
    if (!candidata) return false;
    return candidata.componentes.some(c => {
        const subId = idBaseComponente(c);
        return subId && (subId === baseAlvoId || baseUsaBase(subId, baseAlvoId, visitados));
    });
}

// Calcula o custo total e por unidade de uma base, somando ingredientes e
// outras bases usadas dentro dela (recursivo, com proteção extra contra loop)
function calcularBase(base, visitados) {
    visitados = visitados ? new Set(visitados) : new Set();
    if (visitados.has(base.id)) return { custoTotal: 0, custoPorUnidade: 0 };
    visitados.add(base.id);

    let custoTotal = 0;
    base.componentes.forEach(c => {
        const baseId = idBaseComponente(c);
        if (baseId) {
            const subBase = getBase(baseId);
            if (subBase) {
                const { custoPorUnidade } = calcularBase(subBase, visitados);
                custoTotal += custoPorUnidade * c.quantidade;
            }
        } else {
            const ing = ingredientes.find(i => i.id === idIngredienteComponente(c));
            if (ing) custoTotal += custoUnitIngrediente(ing) * c.quantidade;
        }
    });
    const custoPorUnidade = base.rendimento ? custoTotal / base.rendimento : 0;
    return { custoTotal, custoPorUnidade };
}

function popularSelectComponenteBase() {
    const sel = document.getElementById('selectIngredienteBase');
    const valorAtual = sel.value;
    const outrasBases = bases.filter(b => b.id !== editingBaseId);
    sel.innerHTML = '<option value="">Selecione</option>'
        + '<optgroup label="Ingredientes">' + ingredientes.map(i => `<option value="ingrediente_${i.id}">${i.nome}</option>`).join('') + '</optgroup>'
        + '<optgroup label="Bases">' + outrasBases.map(b => `<option value="base_${b.id}">${b.nome}</option>`).join('') + '</optgroup>';
    sel.value = valorAtual;
}

function adicionarComponenteBase() {
    const val = document.getElementById('selectIngredienteBase').value;
    const qtd = parseFloat(document.getElementById('qtdComponenteBase').value.replace(',', '.'));
    if (!val || !qtd) { alert('Seleciona um item e informa a quantidade.'); return; }
    const idx = val.indexOf('_');
    const tipoRaw = val.substring(0, idx);
    const compId = val.substring(idx + 1);
    if (tipoRaw === 'base' && baseUsaBase(compId, editingBaseId)) {
        alert('Não é possível usar essa base aqui: isso criaria uma referência circular.');
        return;
    }
    tempBaseComponentes.push({ tipo: tipoRaw === 'base' ? 'base' : 'ingrediente', id: compId, quantidade: qtd });
    document.getElementById('qtdComponenteBase').value = '';
    renderTempBaseComponentes();
}

function removerComponenteBase(i) { tempBaseComponentes.splice(i, 1); renderTempBaseComponentes(); }

function renderTempBaseComponentes() {
    const div = document.getElementById('listaComponentesBase');
    div.innerHTML = '';
    let total = 0;
    tempBaseComponentes.forEach((c, i) => {
        let nome = '', custo = 0, unidade = '';
        const baseId = idBaseComponente(c);
        if (baseId) {
            const b = getBase(baseId);
            if (b) { const { custoPorUnidade } = calcularBase(b); nome = b.nome + ' (base)'; custo = custoPorUnidade * c.quantidade; unidade = b.unidadeRendimento; }
            else nome = '(base removida)';
        } else {
            const ing = ingredientes.find(x => x.id === idIngredienteComponente(c));
            if (ing) { nome = ing.nome; custo = custoUnitIngrediente(ing) * c.quantidade; unidade = ing.unidade; }
            else nome = '(removido)';
        }
        total += custo;
        const linha = document.createElement('div');
        linha.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);';
        linha.innerHTML = `<span>${nome} — ${c.quantidade}${unidade} = ${formatarPreco(custo)}</span>
            <button class="btn-excluir-cupom" onclick="removerComponenteBase(${i})">🗑️</button>`;
        div.appendChild(linha);
    });
    document.getElementById('custoTotalBaseTemp').textContent = formatarPreco(total);
}

function salvarBase() {
    const nome = document.getElementById('baseNome').value.trim();
    const tipo = document.getElementById('baseTipo').value;
    const rendimento = parseFloat(document.getElementById('baseRendimento').value.replace(',', '.'));
    const unidadeRendimento = document.getElementById('baseUnidadeRendimento').value;
    const msgEl = document.getElementById('msgBase');

    if (!nome || !rendimento || tempBaseComponentes.length === 0) {
        msgEl.textContent = 'Preenche nome, rendimento e adiciona ao menos um ingrediente/base.';
        return;
    }

    const obj = { nome, tipo, rendimento, unidadeRendimento, componentes: [...tempBaseComponentes] };
    msgEl.textContent = 'Salvando...';

    const promessa = editingBaseId
        ? db.ref('bases/' + editingBaseId).update(obj)
        : db.ref('bases').push(obj);

    promessa.then(() => {
        msgEl.textContent = 'Salvo!';
        tempBaseComponentes = [];
        document.getElementById('baseNome').value = '';
        document.getElementById('baseRendimento').value = '';
        renderTempBaseComponentes();
        if (editingBaseId) {
            editingBaseId = null;
            document.getElementById('btnSalvarBase').textContent = 'Salvar Base';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function renderBases() {
    const container = document.getElementById('listaBases');
    if (bases.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhuma base cadastrada ainda.</p>';
        return;
    }
    container.innerHTML = bases.map(b => {
        const { custoTotal, custoPorUnidade } = calcularBase(b);
        return `
            <div class="pedido-card" style="margin-top:8px;">
                <strong>${b.nome}</strong> <span class="dica-secao">(${b.tipo})</span>
                <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                    Rendimento: ${b.rendimento}${b.unidadeRendimento} · Custo total: ${formatarPreco(custoTotal)} · ${formatarPreco(custoPorUnidade)}/${b.unidadeRendimento}
                </p>
                <button class="btn-secondary" onclick="editarBase('${b.id}')">✏️ Editar</button>
                <button class="btn-excluir-cupom" onclick="excluirBase('${b.id}')">🗑️</button>
            </div>
        `;
    }).join('');
}

function editarBase(id) {
    const b = getBase(id);
    if (!b) return;
    document.getElementById('baseNome').value = b.nome;
    document.getElementById('baseTipo').value = b.tipo;
    document.getElementById('baseRendimento').value = b.rendimento;
    document.getElementById('baseUnidadeRendimento').value = b.unidadeRendimento;
    tempBaseComponentes = b.componentes.map(c => ({ ...c }));
    editingBaseId = id;
    document.getElementById('btnSalvarBase').textContent = 'Atualizar Base';
    popularSelectComponenteBase();
    renderTempBaseComponentes();
    document.getElementById('tituloCadastroBase').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function excluirBase(id) {
    const usadaEmOutrasBases = bases.some(b => b.id !== id && b.componentes.some(c => idBaseComponente(c) === id));
    let msg = 'Excluir esta base?';
    if (usadaEmOutrasBases) msg += '\n\nEla está em uso em outra base — isso pode quebrar o cálculo de custo dela.';
    if (!confirm(msg)) return;
    db.ref('bases/' + id).remove().catch(err => alert('Erro ao excluir: ' + err.message));
}

// Importa um backup exportado do Sistema de Gestão antigo (localStorage). Os ids
// antigos não existem mais quando os dados vão pro Firebase (cada push() gera um id
// novo), então precisamos: 1) criar tudo primeiro guardando um "mapa" antigo->novo,
// 2) só depois corrigir as referências (ex: os componentes de uma base) usando esse mapa.
// Arredonda pra 2 casas decimais, evitando erro de ponto flutuante (ex: 0.1+0.2)
function arred(v) { if (isNaN(v)) return 0; return Math.round((v + Number.EPSILON) * 100) / 100; }

// ---------- Sistema de Gestão — Ficha Técnica (custo/preço dos produtos) ----------
// Nomes com prefixo "ft"/"FichaTecnica" de propósito — o painel já tem salvarProduto/
// excluirProduto pros produtos do CARDÁPIO, então precisa ficar bem separado
let fichaTecnica = [];
let tempFichaTecnicaComponentes = [];
let editingFichaTecnicaId = null;

function escutarFichaTecnica() {
    db.ref('fichaTecnica').on('value', snap => {
        const val = snap.val() || {};
        fichaTecnica = Object.entries(val).map(([id, p]) => ({ id, ...p }));
        renderFichaTecnica();
        if (typeof popularSelectProdutoPedidoManual === 'function') popularSelectProdutoPedidoManual();
        if (typeof renderRelatorioCustos === 'function') renderRelatorioCustos();
        if (typeof popularSelectProdutoOrcamento === 'function') popularSelectProdutoOrcamento();
        if (typeof renderizarListaProdutosAdmin === 'function') renderizarListaProdutosAdmin();
    });
}

function getFichaTecnica(id) { return fichaTecnica.find(p => p.id === id); }

// Calcula custo, preço sugerido e divisão de lucro de uma ficha técnica — mesma
// lógica de sempre (bases/ingredientes -> custo -> margens -> preço -> divisão)
function calcularCustoFichaTecnica(produto) {
    let custoComponentes = 0;
    const detalhes = [];
    produto.componentes.forEach(c => {
        let nome = '', custoItem = 0, unidade = '';
        if (c.tipo === 'base') {
            const base = getBase(c.id);
            if (base) {
                const { custoPorUnidade } = calcularBase(base);
                nome = base.nome + ' (base)';
                custoItem = arred(custoPorUnidade * c.quantidade);
                unidade = base.unidadeRendimento;
            } else nome = '(base removida)';
        } else {
            const ing = ingredientes.find(i => i.id === idIngredienteComponente(c));
            if (ing) {
                nome = ing.nome;
                custoItem = arred(custoUnitIngrediente(ing) * c.quantidade);
                unidade = ing.unidade;
            } else nome = '(ingrediente removido)';
        }
        custoComponentes += custoItem;
        detalhes.push({ nome, quantidade: c.quantidade, unidade, custoItem });
    });
    custoComponentes = arred(custoComponentes);

    const custoMaoObra = arred((produto.horasTrabalho || 0) * (produto.valorHora || 0));
    const custoTotalReceita = arred(custoComponentes + custoMaoObra);
    const custoUnitarioReceita = produto.rendimento > 0 ? arred(custoTotalReceita / produto.rendimento) : 0;
    const custoUnitarioFinal = arred(custoUnitarioReceita + (produto.embalagem || 0) + (produto.custoFixo || 0));

    const margemEmpresa = (produto.margemEmpresa || 0) / 100;
    const margemCasal = (produto.margemCasal || 0) / 100;
    const taxaVenda = (produto.taxaVenda || 0) / 100;

    const fatorMarkup = 1 - (margemEmpresa + margemCasal + taxaVenda);
    const precoVendaCalculado = arred(fatorMarkup > 0 ? custoUnitarioFinal / fatorMarkup : custoUnitarioFinal);

    const temPrecoManual = produto.precoVendaManual != null && produto.precoVendaManual > 0;
    const precoVenda = temPrecoManual ? arred(produto.precoVendaManual) : precoVendaCalculado;

    const lucroBruto = precoVenda - custoUnitarioFinal;
    const valorTaxa = arred(precoVenda * taxaVenda);
    const lucroLiquido = arred(lucroBruto - valorTaxa);
    const margemRealPercent = precoVenda > 0 ? Math.round((lucroLiquido / precoVenda) * 10000) / 100 : 0;

    let lucroEmpresa = 0, lucroCasal = 0;
    const totalMargens = margemEmpresa + margemCasal;
    if (totalMargens > 0) {
        lucroEmpresa = arred(lucroLiquido * (margemEmpresa / totalMargens));
        lucroCasal = arred(lucroLiquido - lucroEmpresa);
    } else {
        lucroEmpresa = lucroLiquido;
    }

    return {
        custoComponentes, custoMaoObra, custoTotalReceita, custoUnitarioReceita, custoUnitarioFinal,
        precoVenda, precoVendaCalculado, temPrecoManual, margemRealPercent, lucroLiquido, lucroEmpresa, lucroCasal,
        detalhes
    };
}

function popularSelectComponenteFichaTecnica() {
    const sel = document.getElementById('ftSelectComponente');
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>'
        + '<optgroup label="Ingredientes">' + ingredientes.map(i => `<option value="ingrediente_${i.id}">${i.nome}</option>`).join('') + '</optgroup>'
        + '<optgroup label="Bases">' + bases.map(b => `<option value="base_${b.id}">${b.nome}</option>`).join('') + '</optgroup>';
    sel.value = valorAtual;
}

function adicionarComponenteFichaTecnica() {
    const val = document.getElementById('ftSelectComponente').value;
    const qtd = parseFloat(document.getElementById('ftQtdComponente').value.replace(',', '.'));
    if (!val || !qtd) { alert('Seleciona um item e informa a quantidade.'); return; }
    const idx = val.indexOf('_');
    const tipoRaw = val.substring(0, idx);
    const compId = val.substring(idx + 1);
    tempFichaTecnicaComponentes.push({ tipo: tipoRaw === 'base' ? 'base' : 'ingrediente', id: compId, quantidade: qtd });
    document.getElementById('ftQtdComponente').value = '';
    renderTempComponentesFichaTecnica();
}

function removerComponenteFichaTecnica(i) { tempFichaTecnicaComponentes.splice(i, 1); renderTempComponentesFichaTecnica(); }

function renderTempComponentesFichaTecnica() {
    const div = document.getElementById('ftListaComponentes');
    div.innerHTML = '';
    let total = 0;
    tempFichaTecnicaComponentes.forEach((c, i) => {
        let nome = '', custo = 0, unidade = '';
        if (c.tipo === 'base') {
            const b = getBase(c.id);
            if (b) { const { custoPorUnidade } = calcularBase(b); nome = b.nome + ' (base)'; custo = custoPorUnidade * c.quantidade; unidade = b.unidadeRendimento; }
            else nome = '(base removida)';
        } else {
            const ing = ingredientes.find(x => x.id === idIngredienteComponente(c));
            if (ing) { nome = ing.nome; custo = custoUnitIngrediente(ing) * c.quantidade; unidade = ing.unidade; }
            else nome = '(removido)';
        }
        total += custo;
        const linha = document.createElement('div');
        linha.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);';
        linha.innerHTML = `<span>${nome} — ${c.quantidade}${unidade} = ${formatarPreco(custo)}</span>
            <button class="btn-excluir-cupom" onclick="removerComponenteFichaTecnica(${i})">🗑️</button>`;
        div.appendChild(linha);
    });
    document.getElementById('ftCustoComponentesTemp').textContent = formatarPreco(total);
}

function salvarFichaTecnica() {
    const nome = document.getElementById('ftNome').value.trim();
    const rendimento = parseFloat(document.getElementById('ftRendimento').value.replace(',', '.'));
    const embalagem = parseFloat(document.getElementById('ftEmbalagem').value.replace(',', '.')) || 0;
    const custoFixo = parseFloat(document.getElementById('ftCustoFixo').value.replace(',', '.')) || 0;
    const horasTrabalho = parseFloat(document.getElementById('ftHoras').value.replace(',', '.')) || 0;
    const valorHora = parseFloat(document.getElementById('ftValorHora').value.replace(',', '.')) || 0;
    const margemEmpresa = parseFloat(document.getElementById('ftMargemEmpresa').value.replace(',', '.')) || 0;
    const margemCasal = parseFloat(document.getElementById('ftMargemCasal').value.replace(',', '.')) || 0;
    const taxaVenda = parseFloat(document.getElementById('ftTaxaVenda').value.replace(',', '.')) || 0;
    const precoManualDigitado = parseFloat(document.getElementById('ftPrecoManual').value.replace(',', '.'));
    const precoVendaManual = (!isNaN(precoManualDigitado) && precoManualDigitado > 0) ? precoManualDigitado : null;
    const msgEl = document.getElementById('msgFichaTecnica');

    if (!nome || !rendimento || tempFichaTecnicaComponentes.length === 0) {
        msgEl.textContent = 'Preenche nome, rendimento e adiciona componentes.';
        return;
    }

    const obj = {
        nome, rendimento, componentes: [...tempFichaTecnicaComponentes],
        embalagem, custoFixo, horasTrabalho, valorHora, margemEmpresa, margemCasal, taxaVenda, precoVendaManual
    };
    msgEl.textContent = 'Salvando...';

    const promessa = editingFichaTecnicaId
        ? db.ref('fichaTecnica/' + editingFichaTecnicaId).update(obj)
        : db.ref('fichaTecnica').push(obj);

    promessa.then(() => {
        msgEl.textContent = 'Salvo!';
        document.getElementById('ftResultado').innerHTML = montarResultadoFichaTecnica(obj);
        tempFichaTecnicaComponentes = [];
        ['ftNome', 'ftRendimento', 'ftEmbalagem', 'ftCustoFixo', 'ftHoras', 'ftValorHora', 'ftMargemEmpresa', 'ftMargemCasal', 'ftTaxaVenda', 'ftPrecoManual'].forEach(id => document.getElementById(id).value = '');
        renderTempComponentesFichaTecnica();
        if (editingFichaTecnicaId) {
            editingFichaTecnicaId = null;
            document.getElementById('btnSalvarFichaTecnica').textContent = 'Calcular e Salvar';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function montarResultadoFichaTecnica(produto) {
    const r = calcularCustoFichaTecnica(produto);
    return `
        <div class="pedido-card">
            <p>Custo total da receita: <strong>${formatarPreco(r.custoTotalReceita)}</strong></p>
            <p>Custo unitário final: <strong>${formatarPreco(r.custoUnitarioFinal)}</strong></p>
            <p>Preço de venda: <strong>${formatarPreco(r.precoVenda)}</strong>${r.temPrecoManual ? ' (fixado manualmente)' : ' (calculado)'}</p>
            <p>Lucro líquido/un.: <strong>${formatarPreco(r.lucroLiquido)}</strong> (${r.margemRealPercent}%)</p>
            <p>Empresa: ${formatarPreco(r.lucroEmpresa)} · Pró-labore: ${formatarPreco(r.lucroCasal)}</p>
        </div>
    `;
}

function renderFichaTecnica() {
    const busca = (document.getElementById('ftBusca').value || '').toLowerCase();
    const container = document.getElementById('ftListaProdutos');
    const filtrados = fichaTecnica.filter(p => p.nome.toLowerCase().includes(busca));

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhuma ficha técnica cadastrada ainda.</p>';
        return;
    }

    container.innerHTML = filtrados.map(p => {
        const r = calcularCustoFichaTecnica(p);
        const cmv = r.precoVenda > 0 ? ((r.custoUnitarioFinal / r.precoVenda) * 100).toFixed(1) : '0';
        return `
            <div class="pedido-card" style="margin-top:8px;">
                <strong>${p.nome}</strong>
                <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                    Rendimento: ${p.rendimento}un · Custo/un.: ${formatarPreco(r.custoUnitarioFinal)} · Preço: ${formatarPreco(r.precoVenda)} · CMV: ${cmv}%
                </p>
                <button class="btn-secondary" onclick="editarFichaTecnica('${p.id}')">✏️ Editar</button>
                <button class="btn-excluir-cupom" onclick="excluirFichaTecnica('${p.id}')">🗑️</button>
            </div>
        `;
    }).join('');
}

function editarFichaTecnica(id) {
    const p = getFichaTecnica(id);
    if (!p) return;
    document.getElementById('ftNome').value = p.nome;
    document.getElementById('ftRendimento').value = p.rendimento;
    document.getElementById('ftEmbalagem').value = p.embalagem || '';
    document.getElementById('ftCustoFixo').value = p.custoFixo || '';
    document.getElementById('ftHoras').value = p.horasTrabalho || '';
    document.getElementById('ftValorHora').value = p.valorHora || '';
    document.getElementById('ftMargemEmpresa').value = p.margemEmpresa || '';
    document.getElementById('ftMargemCasal').value = p.margemCasal || '';
    document.getElementById('ftTaxaVenda').value = p.taxaVenda || '';
    document.getElementById('ftPrecoManual').value = p.precoVendaManual || '';
    tempFichaTecnicaComponentes = p.componentes.map(c => ({ ...c }));
    editingFichaTecnicaId = id;
    document.getElementById('btnSalvarFichaTecnica').textContent = 'Atualizar';
    renderTempComponentesFichaTecnica();
    document.getElementById('tituloCadastroFichaTecnica').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function excluirFichaTecnica(id) {
    if (!confirm('Excluir esta ficha técnica?')) return;
    db.ref('fichaTecnica/' + id).remove().catch(err => alert('Erro ao excluir: ' + err.message));
}

// ---------- Sistema de Gestão — Estoque ----------
// Não tem "gaveta" própria — só lê/escreve os mesmos campos (estoqueAtual,
// precoComprado) que já existem em cada ingrediente
function popularSelectEstoqueIngrediente() {
    const sel = document.getElementById('estSelectIngrediente');
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>' + ingredientes.map(i => `<option value="${i.id}">${i.nome}</option>`).join('');
    sel.value = valorAtual;
}

function registrarEntradaEstoque() {
    const id = document.getElementById('estSelectIngrediente').value;
    const qtd = parseFloat(document.getElementById('estQtdEntrada').value.replace(',', '.'));
    const novoPreco = parseFloat(document.getElementById('estNovoPreco').value.replace(',', '.'));
    const msgEl = document.getElementById('msgEstoque');

    if (!id || !qtd) { msgEl.textContent = 'Seleciona o ingrediente e a quantidade.'; return; }
    const ing = ingredientes.find(i => i.id === id);
    if (!ing) { msgEl.textContent = 'Ingrediente não encontrado.'; return; }

    const dados = { estoqueAtual: (ing.estoqueAtual || 0) + qtd };
    if (!isNaN(novoPreco) && novoPreco > 0) dados.precoComprado = novoPreco;

    msgEl.textContent = 'Registrando...';
    db.ref('ingredientes/' + id).update(dados).then(() => {
        msgEl.textContent = 'Entrada registrada!';
        document.getElementById('estQtdEntrada').value = '';
        document.getElementById('estNovoPreco').value = '';
    }).catch(err => { msgEl.textContent = 'Erro: ' + err.message; });
}

function renderEstoque() {
    const container = document.getElementById('listaEstoque');
    if (!container) return;
    let baixos = 0;

    container.innerHTML = ingredientes.map(ing => {
        const baixo = (ing.estoqueAtual || 0) < (ing.estoqueMinimo || 0);
        if (baixo) baixos++;
        return `
            <div class="pedido-card" style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${ing.nome}</strong>
                    <p style="margin:2px 0; font-size:0.85em; color:var(--muted);">
                        ${(ing.estoqueAtual || 0).toFixed(2)} ${ing.unidade} · mínimo: ${(ing.estoqueMinimo || 0).toFixed(2)} ${ing.unidade}
                    </p>
                </div>
                <span class="pedido-tag ${baixo ? 'tag-pagamento-divergente' : 'tag-pagamento-pago'}">${baixo ? '⚠️ Baixo' : 'OK'}</span>
            </div>
        `;
    }).join('') || '<p class="dica-secao">Nenhum ingrediente cadastrado ainda.</p>';

    document.getElementById('cardEstoqueTotal').textContent = ingredientes.length;
    document.getElementById('cardEstoqueBaixo').textContent = baixos;
}

// ---------- Sistema de Gestão — Clientes (CRM) ----------
// Fica num nó separado (clientesGestao) de propósito — não mexe no "fidelidade"
// que já está funcionando ao vivo no cardápio
let clientesGestao = [];
let editingClienteGestaoId = null;

function escutarClientesGestao() {
    db.ref('clientesGestao').on('value', snap => {
        const val = snap.val() || {};
        clientesGestao = Object.entries(val).map(([id, c]) => ({ id, ...c }));
        renderClientesGestao();
        if (typeof popularSelectClientePedidoManual === 'function') popularSelectClientePedidoManual();
    });
}

function getClienteGestao(id) { return clientesGestao.find(c => c.id === id); }

function salvarClienteGestao() {
    const nome = document.getElementById('cgNome').value.trim();
    const telefone = document.getElementById('cgTelefone').value.trim();
    const email = document.getElementById('cgEmail').value.trim();
    const endereco = document.getElementById('cgEndereco').value.trim();
    const msgEl = document.getElementById('msgClienteGestao');

    if (!nome) { msgEl.textContent = 'Informa o nome do cliente.'; return; }

    const obj = { nome, telefone: telefone || null, email: email || null, endereco: endereco || null };
    msgEl.textContent = 'Salvando...';

    const promessa = editingClienteGestaoId
        ? db.ref('clientesGestao/' + editingClienteGestaoId).update(obj)
        : db.ref('clientesGestao').push(obj);

    promessa.then(() => {
        msgEl.textContent = 'Salvo!';
        ['cgNome', 'cgTelefone', 'cgEmail', 'cgEndereco'].forEach(id => document.getElementById(id).value = '');
        if (editingClienteGestaoId) {
            editingClienteGestaoId = null;
            document.getElementById('btnSalvarClienteGestao').textContent = '+ Adicionar Cliente';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function renderClientesGestao() {
    const busca = (document.getElementById('cgBusca').value || '').toLowerCase();
    const container = document.getElementById('listaClientesGestao');
    const filtrados = clientesGestao.filter(c => c.nome.toLowerCase().includes(busca));

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhum cliente cadastrado ainda.</p>';
        return;
    }

    container.innerHTML = filtrados.map(c => `
        <div class="pedido-card" style="margin-top:8px;">
            <strong>${c.nome}</strong>
            <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                ${c.telefone ? '📱 ' + c.telefone : ''}${c.email ? ' · ✉️ ' + c.email : ''}
            </p>
            ${c.endereco ? `<p style="margin:0 0 6px; font-size:0.85em; color:var(--muted);">📍 ${c.endereco}</p>` : ''}
            <button class="btn-secondary" onclick="editarClienteGestao('${c.id}')">✏️ Editar</button>
            <button class="btn-excluir-cupom" onclick="excluirClienteGestao('${c.id}')">🗑️</button>
        </div>
    `).join('');
}

function editarClienteGestao(id) {
    const c = getClienteGestao(id);
    if (!c) return;
    document.getElementById('cgNome').value = c.nome;
    document.getElementById('cgTelefone').value = c.telefone || '';
    document.getElementById('cgEmail').value = c.email || '';
    document.getElementById('cgEndereco').value = c.endereco || '';
    editingClienteGestaoId = id;
    document.getElementById('btnSalvarClienteGestao').textContent = 'Atualizar Cliente';
    document.getElementById('tituloCadastroClienteGestao').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function excluirClienteGestao(id) {
    if (!confirm('Excluir este cliente do CRM?')) return;
    db.ref('clientesGestao/' + id).remove().catch(err => alert('Erro ao excluir: ' + err.message));
}

// ---------- Sistema de Gestão — Pedidos manuais ----------
// Escreve no MESMO nó "pedidos" que o cardápio usa (com origem:'manual'), pra
// fechamento e relatórios sempre verem tudo junto, nunca separado
let tempItensPedidoManual = [];
let editingPedidoManualId = null;

function popularSelectClientePedidoManual() {
    const dl = document.getElementById('pmClientesDatalist');
    if (!dl) return;
    dl.innerHTML = clientesGestao.map(c => `<option value="${c.nome}">`).join('');
}

// Acha um cliente pelo nome digitado, ou cria um novo na hora se não existir —
// mesmo comportamento do sistema antigo (obterOuCriarClientePorNome)
async function obterOuCriarClienteGestaoPorNome(nomeDigitado) {
    if (!nomeDigitado) return null;
    const jaExiste = acharPorNome(clientesGestao, nomeDigitado);
    if (jaExiste) return jaExiste;
    const ref = await db.ref('clientesGestao').push({ nome: nomeDigitado, telefone: null, email: null, endereco: null });
    return { id: ref.key, nome: nomeDigitado };
}

function popularSelectProdutoPedidoManual() {
    const sel = document.getElementById('pmSelectProduto');
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>' + fichaTecnica.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    sel.value = valorAtual;
}

function adicionarItemPedidoManual() {
    const ftId = document.getElementById('pmSelectProduto').value;
    const qtd = parseFloat(document.getElementById('pmQtdItem').value.replace(',', '.'));
    if (!ftId || !qtd) { alert('Seleciona o produto e a quantidade.'); return; }
    const ft = getFichaTecnica(ftId);
    if (!ft) return;
    const { precoVenda } = calcularCustoFichaTecnica(ft);
    tempItensPedidoManual.push({ fichaTecnicaId: ftId, nome: ft.nome, preco: precoVenda, quantidade: qtd });
    document.getElementById('pmQtdItem').value = '1';
    renderItensPedidoManual();
}

function removerItemPedidoManual(i) { tempItensPedidoManual.splice(i, 1); renderItensPedidoManual(); }

function renderItensPedidoManual() {
    const div = document.getElementById('pmListaItens');
    div.innerHTML = '';
    let subtotal = 0;
    tempItensPedidoManual.forEach((item, i) => {
        const totalItem = item.preco * item.quantidade;
        subtotal += totalItem;
        const linha = document.createElement('div');
        linha.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);';
        linha.innerHTML = `<span>${item.quantidade}x ${item.nome} = ${formatarPreco(totalItem)}</span>
            <button class="btn-excluir-cupom" onclick="removerItemPedidoManual(${i})">🗑️</button>`;
        div.appendChild(linha);
    });
    document.getElementById('pmSubtotalTemp').textContent = formatarPreco(subtotal);

    const descontoPercent = parseFloat(document.getElementById('pmDesconto').value.replace(',', '.')) || 0;
    const frete = parseFloat(document.getElementById('pmFrete').value.replace(',', '.')) || 0;
    const valorDesconto = arred(subtotal * (descontoPercent / 100));
    const total = arred(subtotal - valorDesconto + frete);
    document.getElementById('pmTotalTemp').textContent = formatarPreco(total);
}

// Lista os últimos pedidos lançados manualmente (não os do cardápio) — mesmo nó
// "pedidos", só filtra por origem no navegador mesmo (evita precisar de outro índice)
let ultimosPedidosManuais = []; // guarda a lista pra imprimir/enviar/editar sem reler o Firebase

function escutarPedidosManuais() {
    db.ref('pedidos').limitToLast(150).on('value', snap => {
        const val = snap.val() || {};
        const manuais = Object.entries(val)
            .map(([id, p]) => ({ id, ...p }))
            .filter(p => p.origem === 'manual')
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 30); // só os 30 mais recentes, pra não ficar gigante
        ultimosPedidosManuais = manuais;

        const div = document.getElementById('listaPedidosManuais');
        if (!div) return;
        if (manuais.length === 0) {
            div.innerHTML = '<p class="dica-secao">Nenhum pedido lançado ainda.</p>';
            return;
        }

        const rotulosStatus = { pendente: '🕒 Pendente', aceito: '✅ Aceito', em_rota: '🛵 Em rota', entregue: '🎉 Entregue', recusado: '❌ Cancelado' };
        div.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:0.85em;">
                <thead><tr style="text-align:left; border-bottom:2px solid var(--border);">
                    <th style="padding:6px;">#</th><th style="padding:6px;">Cliente</th><th style="padding:6px;">Data</th>
                    <th style="padding:6px;">Itens</th><th style="padding:6px;">Total</th><th style="padding:6px;">Desconto</th>
                    <th style="padding:6px;">Pagamento</th><th style="padding:6px;">Status</th><th style="padding:6px;">Ações</th>
                </tr></thead>
                <tbody>
                    ${manuais.map(p => {
                        const dataFormatada = p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—';
                        return `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:6px;">#${p.numero || '—'}</td>
                            <td style="padding:6px;">${p.nome || '—'}</td>
                            <td style="padding:6px;">${dataFormatada}</td>
                            <td style="padding:6px;">${(p.itens || []).length}</td>
                            <td style="padding:6px;">${formatarPreco(p.total || 0)}</td>
                            <td style="padding:6px;">${p.desconto > 0 ? formatarPreco(p.desconto) : '-'}</td>
                            <td style="padding:6px;">${p.formaPagamento || '—'}</td>
                            <td style="padding:6px;">${rotulosStatus[p.status] || p.status}</td>
                            <td style="padding:6px; white-space:nowrap;">
                                <button class="btn-secondary" style="padding:4px 8px;" onclick="enviarPedidoWhatsAppClienteGestao('${p.id}')" title="WhatsApp Cliente">📲</button>
                                <button class="btn-secondary" style="padding:4px 8px;" onclick="enviarPedidoWhatsAppLojaGestao('${p.id}')" title="WhatsApp Loja">📲🏪</button>
                                <button class="btn-secondary" style="padding:4px 8px;" onclick="imprimirPedidoGestao('${p.id}')" title="Imprimir">🖨️</button>
                                <button class="btn-secondary" style="padding:4px 8px;" onclick="editarPedidoManual('${p.id}')" title="Editar">✏️</button>
                                <button class="btn-excluir-cupom" onclick="excluirPedidoManualDireto('${p.id}', ${p.numero})" title="Excluir">🗑️</button>
                            </td>
                        </tr>
                    `; }).join('')}
                </tbody>
            </table>
        `;
    });
}

function formatarTelefoneWhatsAppGestao(telefone) {
    let digits = (telefone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    if (digits.length < 12) return null;
    return digits;
}

function gerarTextoPedidoWhatsAppGestao(pedido, paraCliente) {
    const linhas = (pedido.itens || []).map(item => `❤ ${item.nome} x${item.quantidade} = ${formatarPreco(item.preco * item.quantidade)}`).join('\n');
    const dataFormatada = pedido.timestamp ? new Date(pedido.timestamp).toLocaleDateString('pt-BR') : '—';
    const rotulosStatus = { pendente: 'Pendente', aceito: 'Aceito', em_rota: 'Em rota', entregue: 'Entregue', recusado: 'Cancelado' };

    let texto = '';
    if (paraCliente) {
        texto += `Olá${pedido.nome ? ', ' + pedido.nome : ''}! ❤\n\n`;
        texto += `Aqui está o resumo do seu pedido na ${LOJA_CONFIG.nome}:\n\n`;
    } else {
        texto += `*Pedido - ${LOJA_CONFIG.nome}*\n\n`;
        texto += `*Cliente:* ${pedido.nome || '-'}\n`;
    }
    texto += `*Data:* ${dataFormatada}\n`;
    texto += `*Status:* ${rotulosStatus[pedido.status] || pedido.status}\n\n`;
    texto += `*Itens:*\n${linhas}\n\n`;
    if (pedido.desconto > 0) texto += `*Desconto:* -${formatarPreco(pedido.desconto)}\n`;
    if (pedido.frete > 0) texto += `*Taxa de entrega:* ${formatarPreco(pedido.frete)}\n`;
    texto += `*Total: ${formatarPreco(pedido.total || 0)}*\n`;
    texto += `*Forma de Pagamento:* ${pedido.formaPagamento || '-'}\n`;
    if (pedido.observacoes) texto += `\n*Observações:* ${pedido.observacoes}\n`;
    if (paraCliente) texto += `\n${LOJA_CONFIG.nome} agradece a preferência! ❤`;
    return texto;
}

function enviarPedidoWhatsAppClienteGestao(id) {
    const p = ultimosPedidosManuais.find(x => x.id === id);
    if (!p) return;
    if (!p.telefone) { alert('Esse cliente ainda não tem telefone cadastrado.\nAdiciona o telefone dele na aba Clientes antes de enviar.'); return; }
    const numero = formatarTelefoneWhatsAppGestao(p.telefone);
    if (!numero) { alert('O telefone desse cliente parece inválido (formato esperado: DDD + número).'); return; }
    const texto = gerarTextoPedidoWhatsAppGestao(p, true);
    window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`, '_blank');
}

function enviarPedidoWhatsAppLojaGestao(id) {
    const p = ultimosPedidosManuais.find(x => x.id === id);
    if (!p) return;
    const numero = formatarTelefoneWhatsAppGestao(LOJA_CONFIG.whatsappPedidos);
    if (!numero) { alert('O WhatsApp da loja não está configurado (Identidade e Marca).'); return; }
    const texto = gerarTextoPedidoWhatsAppGestao(p, false);
    window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`, '_blank');
}

function imprimirPedidoGestao(id) {
    const p = ultimosPedidosManuais.find(x => x.id === id);
    if (!p) return;
    const dataFormatada = p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—';
    const rotulosStatus = { pendente: 'Pendente', aceito: 'Aceito', em_rota: 'Em rota', entregue: 'Entregue', recusado: 'Cancelado' };
    const linhas = (p.itens || []).map(item => `<tr><td>${item.nome}</td><td>${item.quantidade}</td><td>${formatarPreco(item.preco * item.quantidade)}</td></tr>`).join('');

    const janela = window.open('', '_blank');
    janela.document.write(`
        <html><head><title>Pedido #${p.numero}</title></head><body style="font-family:sans-serif;">
        <h2>Pedido #${p.numero} — ${LOJA_CONFIG.nome}</h2>
        <p><strong>Cliente:</strong> ${p.nome || '-'} &nbsp; <strong>Data:</strong> ${dataFormatada} &nbsp; <strong>Status:</strong> ${rotulosStatus[p.status] || p.status}</p>
        <table border="1" cellpadding="6" style="border-collapse:collapse; width:100%;">
            <thead><tr><th>Produto</th><th>Qtd.</th><th>Subtotal</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>
        ${p.desconto > 0 ? `<p style="text-align:right;"><strong>Desconto:</strong> -${formatarPreco(p.desconto)}</p>` : ''}
        ${p.frete > 0 ? `<p style="text-align:right;"><strong>Taxa de entrega:</strong> ${formatarPreco(p.frete)}</p>` : ''}
        <p style="text-align:right; font-size:1.2em;"><strong>Total: ${formatarPreco(p.total || 0)}</strong></p>
        <p><strong>Forma de Pagamento:</strong> ${p.formaPagamento || '-'}</p>
        ${p.observacoes ? `<p>Obs: ${p.observacoes}</p>` : ''}
        </body></html>
    `);
    janela.document.close();
    janela.print();
}

function editarPedidoManual(id) {
    const p = ultimosPedidosManuais.find(x => x.id === id);
    if (!p) return;
    document.getElementById('pmCliente').value = p.nome || '';
    document.getElementById('pmStatus').value = p.status || 'pendente';
    document.getElementById('pmFormaPagamento').value = p.formaPagamento || '';
    document.getElementById('pmObs').value = p.observacoes || '';
    document.getElementById('pmDesconto').value = '0'; // desconto já vem embutido nos itens/total originais
    document.getElementById('pmFrete').value = p.frete || 0;
    tempItensPedidoManual = (p.itens || []).map(item => ({ ...item }));
    editingPedidoManualId = id;
    document.getElementById('btnSalvarPedidoManual').textContent = 'Atualizar Pedido';
    renderItensPedidoManual();
    document.getElementById('pmCliente').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirPedidoManualDireto(id, numero) {
    if (!confirm(`Excluir o pedido #${numero || ''} de vez? Não dá pra desfazer.`)) return;
    await db.ref('pedidos/' + id).remove();
}

async function salvarPedidoManual() {
    const nomeClienteDigitado = document.getElementById('pmCliente').value.trim();
    const status = document.getElementById('pmStatus').value;
    const formaPagamento = document.getElementById('pmFormaPagamento').value;
    const obs = document.getElementById('pmObs').value.trim();
    const msgEl = document.getElementById('msgPedidoManual');

    if (tempItensPedidoManual.length === 0) { msgEl.textContent = 'Adiciona pelo menos 1 item.'; return; }

    msgEl.textContent = 'Salvando...';
    const cliente = await obterOuCriarClienteGestaoPorNome(nomeClienteDigitado);
    const subtotal = tempItensPedidoManual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const descontoPercent = parseFloat(document.getElementById('pmDesconto').value.replace(',', '.')) || 0;
    const frete = parseFloat(document.getElementById('pmFrete').value.replace(',', '.')) || 0;
    const desconto = arred(subtotal * (descontoPercent / 100));
    const total = arred(subtotal - desconto + frete);

    const dadosPedido = {
        origem: 'manual',
        nome: cliente ? cliente.nome : 'Cliente balcão',
        telefone: cliente ? cliente.telefone : null,
        tipoEntrega: 'retirada',
        endereco: null,
        formaPagamento: formaPagamento || null,
        observacoes: obs || null,
        itens: tempItensPedidoManual.map(item => ({ produtoId: null, fichaTecnicaId: item.fichaTecnicaId, nome: item.nome, preco: item.preco, quantidade: item.quantidade })),
        subtotal: arred(subtotal),
        desconto,
        frete,
        total,
        status
    };

    // Editando um pedido que já existe — atualiza direto (a mudança de status, se
    // houver, já dispara a Cloud Function normalmente, sem precisar do truque
    // "cria como pendente primeiro" que só é necessário na CRIAÇÃO)
    if (editingPedidoManualId) {
        msgEl.textContent = 'Atualizando...';
        try {
            await db.ref('pedidos/' + editingPedidoManualId).update(dadosPedido);
            msgEl.textContent = 'Pedido atualizado!';
            editingPedidoManualId = null;
            document.getElementById('btnSalvarPedidoManual').textContent = 'Salvar Pedido';
            tempItensPedidoManual = [];
            document.getElementById('pmCliente').value = '';
            document.getElementById('pmDesconto').value = '0';
            document.getElementById('pmFrete').value = '0';
            document.getElementById('pmObs').value = '';
            document.getElementById('pmStatus').value = 'pendente';
            renderItensPedidoManual();
        } catch (err) {
            msgEl.textContent = 'Erro ao atualizar: ' + err.message;
        }
        return;
    }

    const statusDesejado = dadosPedido.status;
    dadosPedido.status = 'pendente'; // sempre cria como pendente — se o status real for diferente,
    // atualiza logo em seguida (um passo a mais), pra Cloud Function (que só reage a MUDANÇA de
    // status, não à criação) disparar certinho mesmo quando o pedido já nasce "Entregue"

    msgEl.textContent = 'Salvando...';
    const novoPedidoRef = db.ref('pedidos').push();
    db.ref('contadores/proximoPedido').transaction(atual => (atual || 0) + 1)
        .then(resultado => {
            const numeroAtribuido = resultado.committed ? resultado.snapshot.val() : null;
            return novoPedidoRef.set({
                ...dadosPedido,
                numero: numeroAtribuido,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            if (statusDesejado !== 'pendente') return novoPedidoRef.child('status').set(statusDesejado);
        })
        .then(() => {
            msgEl.textContent = 'Pedido salvo!';
            tempItensPedidoManual = [];
            document.getElementById('pmCliente').value = '';
            document.getElementById('pmDesconto').value = '0';
            document.getElementById('pmFrete').value = '0';
            document.getElementById('pmObs').value = '';
            document.getElementById('pmStatus').value = 'pendente';
            renderItensPedidoManual();
        })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// ---------- Sistema de Gestão — Dashboard e Relatórios ----------
let chartFaturamentoInstancia = null, chartLucroInstancia = null, chartTopProdutosInstancia = null;

function filtrarDashboardPeriodo(tipo) {
    const hoje = new Date();
    let inicio, fim, rotulo;
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    if (tipo === 'hoje') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
        rotulo = 'Hoje';
    } else if (tipo === '7') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6, 0, 0, 0, 0);
        rotulo = 'Últimos 7 dias';
    } else if (tipo === '30') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29, 0, 0, 0, 0);
        rotulo = 'Últimos 30 dias';
    } else if (tipo === 'mes') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
        rotulo = 'Este mês';
    } else if (tipo === 'tudo') {
        inicio = new Date(2000, 0, 1);
        rotulo = 'Tudo';
    } else { // custom
        const de = document.getElementById('dashPeriodoDe').value;
        const ate = document.getElementById('dashPeriodoAte').value;
        if (!de || !ate) { alert('Escolhe as duas datas.'); return; }
        const [aI, mI, dI] = de.split('-').map(Number);
        const [aF, mF, dF] = ate.split('-').map(Number);
        inicio = new Date(aI, mI - 1, dI, 0, 0, 0, 0);
        fim = new Date(aF, mF - 1, dF, 23, 59, 59, 999);
        rotulo = `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`;
    }

    document.getElementById('dashPeriodoLabel').textContent = 'Período selecionado: ' + rotulo;
    carregarDashboard(inicio.getTime(), fim.getTime());
}

function carregarDashboard(inicio, fim) {
    db.ref('pedidos').once('value').then(snap => {
        const val = snap.val() || {};
        const pedidosDoPeriodo = Object.values(val).filter(p => {
            const dataPedido = p.timestamp || p.criadoEm || 0;
            return p.status === 'entregue' && dataPedido >= inicio && dataPedido <= fim;
        });

        let faturamento = 0, cmv = 0, lucroEmpresaTotal = 0, lucroCasalTotal = 0;
        const porMes = {}; // "AAAA-MM" -> { faturamento, lucro }
        const porProduto = {}; // nome -> quantidade vendida

        pedidosDoPeriodo.forEach(p => {
            faturamento += p.total || 0;
            const dataPedido = new Date(p.timestamp || p.criadoEm || 0);
            const chaveMes = `${dataPedido.getFullYear()}-${String(dataPedido.getMonth() + 1).padStart(2, '0')}`;
            if (!porMes[chaveMes]) porMes[chaveMes] = { faturamento: 0, lucro: 0 };
            porMes[chaveMes].faturamento += p.total || 0;

            let cmvDoPedido = 0, lucroEmpresaDoPedido = 0, lucroCasalDoPedido = 0;
            (p.itens || []).forEach(item => {
                porProduto[item.nome] = (porProduto[item.nome] || 0) + item.quantidade;
                const ftId = item.fichaTecnicaId || null;
                if (ftId) {
                    const ft = getFichaTecnica(ftId);
                    if (ft) {
                        const r = calcularCustoFichaTecnica(ft);
                        cmvDoPedido += r.custoUnitarioFinal * item.quantidade;
                        lucroEmpresaDoPedido += r.lucroEmpresa * item.quantidade;
                        lucroCasalDoPedido += r.lucroCasal * item.quantidade;
                    }
                }
            });
            cmv += cmvDoPedido;
            lucroEmpresaTotal += lucroEmpresaDoPedido;
            lucroCasalTotal += lucroCasalDoPedido;
            porMes[chaveMes].lucro += (p.total || 0) - cmvDoPedido;
        });

        const lucro = arred(faturamento - cmv);
        const qtdPedidos = pedidosDoPeriodo.length;
        const ticketMedio = qtdPedidos > 0 ? arred(faturamento / qtdPedidos) : 0;
        const cmvPercent = faturamento > 0 ? Math.round((cmv / faturamento) * 1000) / 10 : 0;

        document.getElementById('dashFaturamento').textContent = formatarPreco(arred(faturamento));
        document.getElementById('dashCMV').textContent = formatarPreco(arred(cmv));
        document.getElementById('dashCMVPercent').textContent = `(${cmvPercent}%)`;
        document.getElementById('dashLucro').textContent = formatarPreco(lucro);
        document.getElementById('dashPedidos').textContent = qtdPedidos;
        document.getElementById('dashTicket').textContent = formatarPreco(ticketMedio);
        document.getElementById('dashLucroEmpresa').textContent = formatarPreco(arred(lucroEmpresaTotal));
        document.getElementById('dashLucroCasal').textContent = formatarPreco(arred(lucroCasalTotal));

        desenharGraficosDashboard(porMes, porProduto);
    });
}

function desenharGraficosDashboard(porMes, porProduto) {
    if (typeof Chart === 'undefined') return; // biblioteca ainda não carregou

    const mesesOrdenados = Object.keys(porMes).sort();
    const rotulosMeses = mesesOrdenados.map(m => {
        const [ano, mes] = m.split('-');
        return `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][mes - 1]}/${ano.slice(2)}`;
    });

    if (chartFaturamentoInstancia) chartFaturamentoInstancia.destroy();
    chartFaturamentoInstancia = new Chart(document.getElementById('chartFaturamento'), {
        type: 'bar',
        data: { labels: rotulosMeses, datasets: [{ label: 'Faturamento', data: mesesOrdenados.map(m => arred(porMes[m].faturamento)), backgroundColor: '#a0522d' }] },
        options: { responsive: true }
    });

    if (chartLucroInstancia) chartLucroInstancia.destroy();
    chartLucroInstancia = new Chart(document.getElementById('chartLucro'), {
        type: 'bar',
        data: { labels: rotulosMeses, datasets: [{ label: 'Lucro', data: mesesOrdenados.map(m => arred(porMes[m].lucro)), backgroundColor: '#c9974c' }] },
        options: { responsive: true }
    });

    const topProdutos = Object.entries(porProduto).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (chartTopProdutosInstancia) chartTopProdutosInstancia.destroy();
    chartTopProdutosInstancia = new Chart(document.getElementById('chartTopProdutos'), {
        type: 'bar',
        data: { labels: topProdutos.map(p => p[0]), datasets: [{ label: 'Quantidade vendida', data: topProdutos.map(p => p[1]), backgroundColor: '#a0522d' }] },
        options: { indexAxis: 'y', responsive: true }
    });
}

function renderRelatorioCustos() {
    const tbody = document.getElementById('tbodyRelatorio');
    if (!tbody) return;
    tbody.innerHTML = fichaTecnica.map(p => {
        const r = calcularCustoFichaTecnica(p);
        return `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px;">${p.nome}</td>
                <td style="padding:6px;">${formatarPreco(r.custoUnitarioFinal)}</td>
                <td style="padding:6px;">${formatarPreco(r.precoVenda)}</td>
                <td style="padding:6px;">${formatarPreco(r.lucroLiquido)}</td>
                <td style="padding:6px;">${r.margemRealPercent}%</td>
            </tr>
        `;
    }).join('');

    const sel = document.getElementById('selectProdutoDetalheRelatorio');
    if (sel) {
        const valorAtual = sel.value;
        sel.innerHTML = '<option value="">Selecione um produto</option>' + fichaTecnica.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        sel.value = valorAtual;
    }
}

function mostrarDetalheProdutoRelatorio() {
    const id = document.getElementById('selectProdutoDetalheRelatorio').value;
    const div = document.getElementById('detalheProdutoRelatorio');
    if (!id) { div.innerHTML = ''; return; }
    const p = getFichaTecnica(id);
    if (!p) return;
    const r = calcularCustoFichaTecnica(p);
    div.innerHTML = `
        <p><strong>Rendimento:</strong> ${p.rendimento} un.</p>
        <p><strong>Componentes:</strong></p>
        <ul>${r.detalhes.map(d => `<li>${d.nome}: ${d.quantidade}${d.unidade} = ${formatarPreco(d.custoItem)}</li>`).join('')}</ul>
        <p><strong>Custo total da receita:</strong> ${formatarPreco(r.custoTotalReceita)}</p>
        <p><strong>Custo unitário final:</strong> ${formatarPreco(r.custoUnitarioFinal)}</p>
        <p><strong>Preço de venda:</strong> ${formatarPreco(r.precoVenda)}</p>
        <p><strong>Lucro líquido/un.:</strong> ${formatarPreco(r.lucroLiquido)} (${r.margemRealPercent}%)</p>
        <p><strong>Divisão:</strong> Empresa ${formatarPreco(r.lucroEmpresa)} · Pró-labore ${formatarPreco(r.lucroCasal)}</p>
    `;
}

// ---------- Sistema de Gestão — Orçamento (proposta pro cliente) ----------
let tempItensOrcamento = [];

function popularSelectProdutoOrcamento() {
    const sel = document.getElementById('orcSelectProduto');
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>' + fichaTecnica.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    sel.value = valorAtual;
}

function adicionarItemOrcamento() {
    const ftId = document.getElementById('orcSelectProduto').value;
    const qtd = parseFloat(document.getElementById('orcQtdItem').value.replace(',', '.'));
    if (!ftId || !qtd) { alert('Seleciona o produto e a quantidade.'); return; }
    const ft = getFichaTecnica(ftId);
    if (!ft) return;
    const { precoVenda } = calcularCustoFichaTecnica(ft);
    tempItensOrcamento.push({ nome: ft.nome, preco: precoVenda, quantidade: qtd });
    document.getElementById('orcQtdItem').value = '1';
    renderItensOrcamento();
}

function removerItemOrcamento(i) { tempItensOrcamento.splice(i, 1); renderItensOrcamento(); }

function renderItensOrcamento() {
    const div = document.getElementById('orcListaItens');
    div.innerHTML = '';
    let total = 0;
    tempItensOrcamento.forEach((item, i) => {
        const totalItem = item.preco * item.quantidade;
        total += totalItem;
        const linha = document.createElement('div');
        linha.style.cssText = 'display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);';
        linha.innerHTML = `<span>${item.quantidade}x ${item.nome} = ${formatarPreco(totalItem)}</span>
            <button class="btn-excluir-cupom" onclick="removerItemOrcamento(${i})">🗑️</button>`;
        div.appendChild(linha);
    });
    document.getElementById('orcTotalTemp').textContent = formatarPreco(total);
}

function gerarHtmlOrcamento() {
    const cliente = document.getElementById('orcCliente').value.trim() || 'Cliente';
    const validade = document.getElementById('orcValidade').value.trim();
    const obs = document.getElementById('orcObs').value.trim();
    const total = tempItensOrcamento.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    return `
        <div style="padding:16px; font-family:inherit;">
            <h2 style="margin-bottom:4px;">${LOJA_CONFIG.nome || 'Orçamento'}</h2>
            <p class="dica-secao">Orçamento gerado em ${dataHoje}${validade ? ' · Válido por ' + validade : ''}</p>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);">
            ${tempItensOrcamento.map(item => `<p>${item.quantidade}x ${item.nome} — ${formatarPreco(item.preco * item.quantidade)}</p>`).join('')}
            <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);">
            <p style="font-size:1.2em;"><strong>Total: ${formatarPreco(total)}</strong></p>
            ${obs ? `<p style="margin-top:10px;"><strong>Observações:</strong> ${obs}</p>` : ''}
        </div>
    `;
}

function gerarPreviewOrcamento() {
    if (tempItensOrcamento.length === 0) { alert('Adiciona pelo menos 1 item ao orçamento.'); return; }
    document.getElementById('previewOrcamento').innerHTML = gerarHtmlOrcamento();
    document.getElementById('cardPreviewOrcamento').style.display = 'block';
    document.getElementById('cardPreviewOrcamento').scrollIntoView({ behavior: 'smooth' });
}

function baixarOrcamentoPDF() {
    if (tempItensOrcamento.length === 0) { alert('Adiciona pelo menos 1 item ao orçamento.'); return; }
    if (typeof window.jspdf === 'undefined') { alert('A biblioteca de exportação ainda está carregando, tenta de novo em instantes.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const cliente = document.getElementById('orcCliente').value.trim() || 'Cliente';
    const validade = document.getElementById('orcValidade').value.trim();
    const obs = document.getElementById('orcObs').value.trim();

    doc.setFontSize(14);
    doc.text(LOJA_CONFIG.nome || 'Orçamento', 14, 15);
    doc.setFontSize(10);
    doc.text('Cliente: ' + cliente + (validade ? ' — Válido por ' + validade : ''), 14, 22);

    const linhas = tempItensOrcamento.map(item => [`${item.quantidade}x ${item.nome}`, formatarPreco(item.preco * item.quantidade)]);
    doc.autoTable({ head: [['Item', 'Valor']], body: linhas, startY: 28 });

    const total = tempItensOrcamento.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const yFinal = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.text('Total: ' + formatarPreco(total), 14, yFinal);
    if (obs) doc.text('Obs: ' + obs, 14, yFinal + 8);

    doc.save('orcamento-' + cliente.toLowerCase().replace(/\s+/g, '-') + '.pdf');
}

// ---------- Sistema de Gestão — Backup completo ----------
// Baixa TUDO que já está no Firebase (ingredientes, bases, fichaTecnica, clientesGestao)
// num arquivo JSON — cópia extra, útil offline; os dados já ficam salvos na nuvem sozinhos
async function exportarBackupGestaoCompleto() {
    const msgEl = document.getElementById('msgExportarBackupGestao');
    msgEl.textContent = 'Preparando backup...';
    try {
        const backup = {
            ingredientes,
            bases,
            fichaTecnica,
            clientesGestao,
            exportadoEm: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup-gestao-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        msgEl.textContent = 'Backup baixado!';
    } catch (err) {
        msgEl.textContent = 'Erro ao gerar backup: ' + err.message;
    }
}

function exportarRelatorioPDF() {
    if (typeof window.jspdf === 'undefined') { alert('A biblioteca de exportação ainda está carregando, tenta de novo em instantes.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Relatório de Custos — ' + (LOJA_CONFIG.nome || ''), 14, 15);
    const linhas = fichaTecnica.map(p => {
        const r = calcularCustoFichaTecnica(p);
        return [p.nome, formatarPreco(r.custoUnitarioFinal), formatarPreco(r.precoVenda), formatarPreco(r.lucroLiquido), r.margemRealPercent + '%'];
    });
    doc.autoTable({ head: [['Produto', 'Custo/un.', 'Preço', 'Lucro/un.', 'Margem']], body: linhas, startY: 22 });
    doc.save('relatorio-custos.pdf');
}

function exportarRelatorioExcel() {
    if (typeof XLSX === 'undefined') { alert('A biblioteca de exportação ainda está carregando, tenta de novo em instantes.'); return; }
    const linhas = fichaTecnica.map(p => {
        const r = calcularCustoFichaTecnica(p);
        return { Produto: p.nome, 'Custo/un.': r.custoUnitarioFinal, 'Preço': r.precoVenda, 'Lucro/un.': r.lucroLiquido, 'Margem (%)': r.margemRealPercent };
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Custos');
    XLSX.writeFile(wb, 'relatorio-custos.xlsx');
}

// Acha, no array já carregado, um item com o mesmo nome (ignorando maiúsculas/
// espaços) — usado pra não duplicar o que já foi importado numa rodada anterior
function acharPorNome(lista, nome) {
    const alvo = (nome || '').trim().toLowerCase();
    return lista.find(item => (item.nome || '').trim().toLowerCase() === alvo);
}

const MAPA_STATUS_PEDIDO_ANTIGO = { pendente: 'pendente', 'produção': 'aceito', em_rota: 'em_rota', entregue: 'entregue', cancelado: 'recusado' };

// Verifica bases e fichas técnicas com componentes "órfãos" (apontando pra um
// ingrediente/base que não existe mais) — útil pra achar dados de uma importação
// antiga, feita antes desse reconhecimento de formato existir
// Remove itens duplicados (mesmo nome, ou mesmo telefone pra clientes) — mantém o
// PRIMEIRO de cada grupo, e redireciona qualquer referência (bases usando outra base,
// fichas técnicas usando ingrediente/base) pro id mantido antes de excluir o resto,
// pra nunca quebrar nada que já estivesse referenciando o duplicado que está saindo
async function removerDuplicatas() {
    if (!confirm('Vai procurar ingredientes, bases, fichas técnicas e clientes com o mesmo nome (ou telefone), manter só o primeiro de cada grupo, e apagar o resto — corrigindo as referências antes de apagar. Confirma?')) return;
    const msgEl = document.getElementById('resultadoDiagnostico');
    msgEl.innerHTML = '<p class="dica-secao">Removendo duplicatas...</p>';

    function agrupar(lista, chaveFn) {
        const grupos = {};
        lista.forEach(item => {
            const chave = chaveFn(item);
            if (!chave) return;
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push(item);
        });
        return Object.values(grupos).filter(g => g.length > 1);
    }

    async function redirecionarReferencias(idAntigo, idNovo, tipoAlvo) {
        for (const b of bases) {
            if (!b.componentes) continue;
            let mudou = false;
            const corrigidos = b.componentes.map(c => {
                if (tipoAlvo === 'base' && c.tipo === 'base' && c.id === idAntigo) { mudou = true; return { ...c, id: idNovo }; }
                if (tipoAlvo === 'ingrediente' && c.tipo === 'ingrediente' && c.id === idAntigo) { mudou = true; return { ...c, id: idNovo }; }
                return c;
            });
            if (mudou) await db.ref('bases/' + b.id + '/componentes').set(corrigidos);
        }
        for (const p of fichaTecnica) {
            if (!p.componentes) continue;
            let mudou = false;
            const corrigidos = p.componentes.map(c => {
                if (tipoAlvo === 'base' && c.tipo === 'base' && c.id === idAntigo) { mudou = true; return { ...c, id: idNovo }; }
                if (tipoAlvo === 'ingrediente' && c.tipo === 'ingrediente' && c.id === idAntigo) { mudou = true; return { ...c, id: idNovo }; }
                return c;
            });
            if (mudou) await db.ref('fichaTecnica/' + p.id + '/componentes').set(corrigidos);
        }
    }

    let totalRemovidos = 0;

    for (const grupo of agrupar(ingredientes, i => (i.nome || '').trim().toLowerCase())) {
        const manter = grupo[0];
        for (const dup of grupo.slice(1)) {
            await redirecionarReferencias(dup.id, manter.id, 'ingrediente');
            await db.ref('ingredientes/' + dup.id).remove();
            totalRemovidos++;
        }
    }
    for (const grupo of agrupar(bases, b => (b.nome || '').trim().toLowerCase())) {
        const manter = grupo[0];
        for (const dup of grupo.slice(1)) {
            await redirecionarReferencias(dup.id, manter.id, 'base');
            await db.ref('bases/' + dup.id).remove();
            totalRemovidos++;
        }
    }
    for (const grupo of agrupar(fichaTecnica, p => (p.nome || '').trim().toLowerCase())) {
        for (const dup of grupo.slice(1)) {
            await db.ref('fichaTecnica/' + dup.id).remove();
            totalRemovidos++;
        }
    }
    for (const grupo of agrupar(clientesGestao, c => c.telefone || (c.nome || '').trim().toLowerCase())) {
        for (const dup of grupo.slice(1)) {
            await db.ref('clientesGestao/' + dup.id).remove();
            totalRemovidos++;
        }
    }

    msgEl.innerHTML = `<p class="dica-secao">✅ Removidas ${totalRemovidos} duplicata(s). Rodando o diagnóstico de novo...</p>`;
    setTimeout(diagnosticarComponentesQuebrados, 1000); // espera os listeners atualizarem os arrays
}

function diagnosticarComponentesQuebrados() {
    const div = document.getElementById('resultadoDiagnostico');
    const problemas = [];

    function componenteQuebrado(c) {
        const idBase = idBaseComponente(c);
        if (idBase) return !getBase(idBase);
        const idIng = idIngredienteComponente(c);
        if (idIng) return !ingredientes.find(i => i.id === idIng);
        return true; // nem base nem ingrediente reconhecido — formato desconhecido
    }

    bases.forEach(b => {
        const quebrados = (b.componentes || []).filter(componenteQuebrado);
        if (quebrados.length > 0) problemas.push({ tipo: 'Base', id: b.id, nome: b.nome, qtdQuebrados: quebrados.length, qtdTotal: (b.componentes || []).length });
    });
    fichaTecnica.forEach(p => {
        const quebrados = (p.componentes || []).filter(componenteQuebrado);
        if (quebrados.length > 0) problemas.push({ tipo: 'Ficha Técnica', id: p.id, nome: p.nome, qtdQuebrados: quebrados.length, qtdTotal: (p.componentes || []).length });
    });

    if (problemas.length === 0) {
        div.innerHTML = '<p class="dica-secao">✅ Nenhum problema encontrado — todas as referências estão certinhas.</p>';
        return;
    }

    window._problemasDiagnostico = problemas; // guarda pro botão de excluir tudo usar
    div.innerHTML = `
        <p class="dica-secao">⚠️ Achei ${problemas.length} item(ns) com referência quebrada. Exclui tudo de uma vez (botão abaixo) e roda a importação de novo com o mesmo arquivo de backup — serão recriados certinho.</p>
        <button class="btn-excluir-cupom" style="width:auto; padding:6px 12px;" onclick="excluirTodosOsQuebrados()">🗑️ Excluir todos os ${problemas.length} quebrados</button>
        ${problemas.map(p => `<p>🔴 <strong>${p.tipo}:</strong> ${p.nome} (${p.qtdQuebrados} de ${p.qtdTotal} componente(s) quebrado(s))</p>`).join('')}
    `;
}

async function excluirTodosOsQuebrados() {
    const problemas = window._problemasDiagnostico || [];
    if (problemas.length === 0) return;
    if (!confirm(`Excluir ${problemas.length} item(ns) quebrado(s)? Depois é só importar o backup de novo com o mesmo arquivo, pra recriar certinho.`)) return;

    const div = document.getElementById('resultadoDiagnostico');
    div.innerHTML = '<p class="dica-secao">Excluindo...</p>';
    for (const p of problemas) {
        const caminho = p.tipo === 'Base' ? 'bases' : 'fichaTecnica';
        await db.ref(caminho + '/' + p.id).remove();
    }
    div.innerHTML = `<p class="dica-secao">✅ ${problemas.length} item(ns) excluído(s). Agora é só importar o backup de novo com o mesmo arquivo.</p>`;
}

// Remapeia um componente (ingrediente ou base) do id antigo pro novo — reconhece tanto
// o formato novo ({tipo, id}) quanto um mais antigo do Sistema de Gestão anterior
// ({ingredienteId}, sempre ingrediente) — e SEMPRE devolve já no formato novo,
// corrigindo dados antigos de uma vez por todas na hora de importar
function remapComponenteImportado(c, mapaIngredientes, mapaBases) {
    if (c.tipo === 'ingrediente') return { tipo: 'ingrediente', id: mapaIngredientes[c.id] || c.id, quantidade: c.quantidade };
    if (c.tipo === 'base') return { tipo: 'base', id: mapaBases[c.id] || c.id, quantidade: c.quantidade };
    if (!c.tipo && c.ingredienteId) return { tipo: 'ingrediente', id: mapaIngredientes[c.ingredienteId] || c.ingredienteId, quantidade: c.quantidade };
    return c;
}

async function importarBackupSistemaGestao() {
    const input = document.getElementById('inputImportarBackupGestao');
    const msgEl = document.getElementById('msgImportarBackup');
    if (!input.files.length) { msgEl.textContent = 'Escolhe o arquivo de backup (.json) primeiro.'; return; }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.ingredientes) { msgEl.textContent = 'Esse arquivo não parece ser um backup válido.'; return; }

            const qtdIng = (dados.ingredientes || []).length;
            const qtdBases = (dados.bases || []).length;
            const qtdProdutos = (dados.produtos || []).length;
            const qtdClientes = (dados.clientes || []).length;
            const qtdPedidos = (dados.pedidos || []).length;
            if (!confirm(`Vai importar ${qtdIng} ingrediente(s), ${qtdBases} base(s), ${qtdProdutos} produto(s), ${qtdClientes} cliente(s) e ${qtdPedidos} pedido(s) — itens já importados antes (mesmo nome/telefone) são reaproveitados, não duplicados. Confirma?`)) return;

            window._importandoBackupGestao = true; // silencia o som de "pedido novo" durante a importação

            // 1) Ingredientes — reaproveita se já existe um com o mesmo nome
            msgEl.textContent = 'Importando ingredientes...';
            const mapaIngredientes = {};
            for (const ing of (dados.ingredientes || [])) {
                const jaExiste = acharPorNome(ingredientes, ing.nome);
                if (jaExiste) { mapaIngredientes[ing.id] = jaExiste.id; continue; }
                const { id: idAntigo, ...resto } = ing;
                const ref = await db.ref('ingredientes').push(resto);
                mapaIngredientes[idAntigo] = ref.key;
            }

            // 2) Bases — mesma lógica, e ainda precisa corrigir as referências internas depois
            msgEl.textContent = 'Importando bases...';
            const mapaBases = {};
            const basesCriadasAgora = [];
            for (const base of (dados.bases || [])) {
                const jaExiste = acharPorNome(bases, base.nome);
                if (jaExiste) { mapaBases[base.id] = jaExiste.id; continue; }
                const { id: idAntigo, ...resto } = base;
                const ref = await db.ref('bases').push(resto);
                mapaBases[idAntigo] = ref.key;
                basesCriadasAgora.push({ novoId: ref.key, componentesOriginais: base.componentes || [] });
            }
            for (const b of basesCriadasAgora) {
                const corrigidos = b.componentesOriginais.map(c => remapComponenteImportado(c, mapaIngredientes, mapaBases));
                await db.ref('bases/' + b.novoId + '/componentes').set(corrigidos);
            }

            // 3) Produtos antigos -> Ficha Técnica (nó fichaTecnica)
            msgEl.textContent = 'Importando fichas técnicas...';
            const mapaProdutos = {};
            const produtosCriadosAgora = [];
            for (const prod of (dados.produtos || [])) {
                const jaExiste = acharPorNome(fichaTecnica, prod.nome);
                if (jaExiste) { mapaProdutos[prod.id] = jaExiste.id; continue; }
                const { id: idAntigo, componentes, ...resto } = prod;
                const ref = await db.ref('fichaTecnica').push({ ...resto, componentes: [] });
                mapaProdutos[idAntigo] = ref.key;
                produtosCriadosAgora.push({ novoId: ref.key, componentesOriginais: componentes || [] });
            }
            for (const p of produtosCriadosAgora) {
                const corrigidos = p.componentesOriginais.map(c => remapComponenteImportado(c, mapaIngredientes, mapaBases));
                await db.ref('fichaTecnica/' + p.novoId + '/componentes').set(corrigidos);
            }

            // 4) Clientes -> clientesGestao (reaproveita por telefone, se tiver; senão por nome)
            msgEl.textContent = 'Importando clientes...';
            const mapaClientes = {};
            for (const cli of (dados.clientes || [])) {
                const jaExiste = cli.telefone
                    ? clientesGestao.find(c => c.telefone === cli.telefone)
                    : acharPorNome(clientesGestao, cli.nome);
                if (jaExiste) { mapaClientes[cli.id] = jaExiste.id; continue; }
                const { id: idAntigo, ...resto } = cli;
                const ref = await db.ref('clientesGestao').push(resto);
                mapaClientes[idAntigo] = ref.key;
            }

            // 5) Pedidos antigos -> nó "pedidos" (mesmo que o cardápio usa, origem:'manual')
            msgEl.textContent = 'Importando pedidos...';
            for (const ped of (dados.pedidos || [])) {
                const cliente = mapaClientes[ped.clienteId] ? getClienteGestao(mapaClientes[ped.clienteId]) : null;
                const itensConvertidos = (ped.itens || []).map(item => {
                    const ftIdNovo = mapaProdutos[item.produtoId] || null;
                    const ft = ftIdNovo ? getFichaTecnica(ftIdNovo) : null;
                    const r = ft ? calcularCustoFichaTecnica(ft) : null;
                    return { fichaTecnicaId: ftIdNovo, produtoId: null, nome: ft ? ft.nome : '(produto removido)', preco: r ? r.precoVenda : 0, quantidade: item.quantidade };
                });
                const [ano, mes, dia] = (ped.data || '').split('-').map(Number);
                const timestampPedido = (ano && mes && dia) ? new Date(ano, mes - 1, dia).getTime() : Date.now();

                const dadosPedido = {
                    origem: 'manual',
                    nome: cliente ? cliente.nome : 'Cliente importado',
                    telefone: cliente ? cliente.telefone : null,
                    tipoEntrega: 'retirada',
                    endereco: null,
                    formaPagamento: ped.formaPagamento || null,
                    observacoes: ped.obs || null,
                    itens: itensConvertidos,
                    subtotal: ped.subtotalBruto || 0,
                    desconto: ped.descontoPercentual ? arred((ped.subtotalBruto || 0) * (ped.descontoPercentual / 100)) : 0,
                    frete: ped.frete || 0,
                    total: ped.valorTotal || 0,
                    status: MAPA_STATUS_PEDIDO_ANTIGO[ped.status] || 'pendente',
                    timestamp: timestampPedido
                };

                const novoPedidoRef = db.ref('pedidos').push();
                const resultado = await db.ref('contadores/proximoPedido').transaction(atual => (atual || 0) + 1);
                const numeroAtribuido = resultado.committed ? resultado.snapshot.val() : null;
                const statusRealDoPedido = dadosPedido.status;
                dadosPedido.status = 'pendente';
                await novoPedidoRef.set({ ...dadosPedido, numero: numeroAtribuido });
                if (statusRealDoPedido !== 'pendente') await novoPedidoRef.child('status').set(statusRealDoPedido);
            }

            msgEl.textContent = `✅ Importado! ${qtdIng} ingrediente(s), ${qtdBases} base(s), ${qtdProdutos} produto(s), ${qtdClientes} cliente(s) e ${qtdPedidos} pedido(s) — o que já existia foi reaproveitado, nada duplicado.`;
        } catch (err) {
            msgEl.textContent = 'Erro ao importar: ' + err.message;
        } finally {
            window._importandoBackupGestao = false;
            input.value = '';
        }
    };
    reader.readAsText(input.files[0]);
}

function carregarClientesInativos() {
    const diasLimite = parseInt(document.getElementById('diasInatividade').value, 10) || 0;
    const container = document.getElementById('listaClientesInativos');
    container.innerHTML = '<p class="dica-secao">Buscando...</p>';

    Promise.all([
        db.ref('fidelidade').once('value'),
        db.ref('pedidos').once('value'),
        db.ref('configuracao/fidelidade').once('value')
    ]).then(([snapFidelidade, snapPedidos, snapConfigFidelidade]) => {
        const clubeFidelidade = snapFidelidade.val() || {};
        const pedidos = snapPedidos.val() || {};
        const cfgNiveis = snapConfigFidelidade.val() || {};

        // Monta um resumo por telefone, olhando TODOS os pedidos — assim aparece qualquer
        // cliente que já comprou, esteja ele cadastrado no Clube ou não (o Clube é opcional,
        // pedido não é). Também junta as recompensas resgatadas E entregues.
        const resumoPorTelefone = {};
        Object.values(pedidos).forEach(pedido => {
            if (!pedido.telefone) return;
            if (!resumoPorTelefone[pedido.telefone]) {
                resumoPorTelefone[pedido.telefone] = { nome: pedido.nome, ultimaCompra: 0, totalGasto: 0, recompensas: [] };
            }
            const resumo = resumoPorTelefone[pedido.telefone];
            if (pedido.timestamp && pedido.timestamp > resumo.ultimaCompra) {
                resumo.ultimaCompra = pedido.timestamp;
                resumo.nome = pedido.nome || resumo.nome; // usa o nome do pedido mais recente
            }
            if (pedido.status === 'entregue') {
                resumo.totalGasto += totalDoPedido(pedido) || 0;
            }
            if (pedido.recompensaResgatada && pedido.status === 'entregue') {
                resumo.recompensas.push({ descricao: pedido.recompensaResgatada.descricao, data: pedido.timestamp });
            }
        });

        // Garante que quem está no Clube mas ainda não tem nenhum pedido também apareça
        Object.entries(clubeFidelidade).forEach(([telefone, dados]) => {
            if (!resumoPorTelefone[telefone]) {
                resumoPorTelefone[telefone] = { nome: dados.nome, ultimaCompra: 0, totalGasto: 0, recompensas: [] };
            }
        });

        const agora = Date.now();
        const listaClientes = Object.entries(resumoPorTelefone).map(([telefone, resumo]) => {
            const dadosClube = clubeFidelidade[telefone] || null; // null = não é do Clube
            const referencia = resumo.ultimaCompra || (dadosClube && dadosClube.criadoEm) || agora;
            const diasSemComprar = Math.floor((agora - referencia) / (1000 * 60 * 60 * 24));
            return {
                telefone,
                nome: resumo.nome || (dadosClube && dadosClube.nome) || 'Sem nome',
                diasSemComprar,
                nuncaComprou: !resumo.ultimaCompra,
                ehDoClube: !!dadosClube,
                pontos: dadosClube ? (dadosClube.pontos || 0) : 0,
                totalGasto: dadosClube ? (dadosClube.totalGasto || resumo.totalGasto) : resumo.totalGasto,
                recompensas: resumo.recompensas.sort((a, b) => b.data - a.data)
            };
        })
        .filter(c => c.diasSemComprar >= diasLimite)
        .sort((a, b) => b.diasSemComprar - a.diasSemComprar);

        if (listaClientes.length === 0) {
            container.innerHTML = '<p class="dica-secao">Nenhum cliente encontrado com esse filtro — ainda não tem pedido registrado com telefone.</p>';
            return;
        }

        container.innerHTML = listaClientes.map((c, i) => {
            const nivel = c.ehDoClube ? calcularNivelAdmin(c.pontos, cfgNiveis) : { nome: 'Não é do Clube', emoji: '👤' };
            const modeloMensagem = document.getElementById('mensagemClientes').value.trim()
                || 'Oi {nome}! Sentimos sua falta por aqui na {loja} 🥹';
            const mensagem = encodeURIComponent(
                modeloMensagem
                    .replace(/\{nome\}/gi, c.nome)
                    .replace(/\{loja\}/gi, LOJA_CONFIG.nome)
                    .replace(/\{link\}/gi, LOJA_CONFIG.urlCardapio)
            );
            const linkWhats = `https://api.whatsapp.com/send?phone=55${c.telefone.replace(/\D/g, '')}&text=${mensagem}`;
            const textoTempo = c.nuncaComprou ? 'nunca fez um pedido registrado' : `última compra há ${c.diasSemComprar} dias`;
            const textoNivel = c.ehDoClube ? ` · ${c.pontos} pontos (${nivel.nome})` : ' · não é do Clube';

            const recompensasHtml = c.recompensas.length > 0
                ? c.recompensas.map(r => `<li>🎁 ${r.descricao} — ${new Date(r.data).toLocaleDateString('pt-BR')}</li>`).join('')
                : '<li class="dica-secao">Nenhuma recompensa resgatada ainda</li>';

            return `
                <div class="loja-status-card" style="margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; cursor:pointer;" onclick="document.getElementById('detalheCliente_${i}').style.display = document.getElementById('detalheCliente_${i}').style.display === 'none' ? 'block' : 'none';">
                        <div>
                            <strong>${nivel.emoji} ${c.nome}</strong>
                            <div class="dica-secao" style="margin:2px 0 0;">${textoTempo}${textoNivel}</div>
                        </div>
                        <a href="${linkWhats}" target="_blank" rel="noopener noreferrer" class="btn-salvar-ordem" style="text-decoration:none;" onclick="event.stopPropagation();">💬 Mandar mensagem</a>
                    </div>
                    <div id="detalheCliente_${i}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
                        <p style="margin:0 0 6px;"><strong>Telefone:</strong> ${c.telefone}</p>
                        <p style="margin:0 0 6px;"><strong>Total já gasto:</strong> ${formatarPreco(c.totalGasto)}</p>
                        <p style="margin:0 0 4px;"><strong>Recompensas resgatadas:</strong></p>
                        <ul style="margin:0; padding-left:20px;">${recompensasHtml}</ul>
                    </div>
                </div>
            `;
        }).join('');
    }).catch(err => {
        container.innerHTML = '<p class="dica-secao">Não foi possível carregar a lista agora.</p>';
        console.log('Erro ao carregar clientes inativos:', err);
    });
}

function escutarConfigLoja() {
    db.ref('configuracao/loja').on('value', snap => {
        const config = snap.val() || {};
        montarLinhasHorario(config.horarios);

        const modo = config.modoManual || 'auto';
        marcarModoSelecionado(modo);

        let aberta;
        if (modo === 'aberto') aberta = true;
        else if (modo === 'fechado') aberta = false;
        else aberta = calcularAbertoPorHorarioAdmin(config.horarios);

        document.getElementById('lojaStatusAtual').textContent = aberta ? '🟢 Aberta' : '🔴 Fechada';

        const chkPagamento = document.getElementById('chkPagamentoOnlineAtivo');
        if (chkPagamento) chkPagamento.checked = !!config.pagamentoOnlineAtivo;

        adicionaisAtivo = !!config.adicionaisAtivo;
        const chkAdicionais = document.getElementById('chkAdicionaisAtivo');
        if (chkAdicionais) chkAdicionais.checked = adicionaisAtivo;

        const chkAgendamento = document.getElementById('chkAgendamentoAtivo');
        if (chkAgendamento) chkAgendamento.checked = !!config.agendamentoAtivo;

        const painelLogo = document.getElementById('painelLogo');
        if (painelLogo && config.logoUrl) painelLogo.src = config.logoUrl;

        const campoPedidoMinimo = document.getElementById('valorPedidoMinimo');
        const campoFreteGratis = document.getElementById('valorFreteGratisAcima');
        if (campoPedidoMinimo) campoPedidoMinimo.value = config.pedidoMinimo || '';
        if (campoFreteGratis) campoFreteGratis.value = config.freteGratisAcima || '';
    });
}

// ---------- IMPORTAÇÃO ÚNICA DOS DADOS QUE JÁ EXISTIAM NO CARDÁPIO ----------
// Só usada uma vez, pra transferir os produtos/cupons que estavam fixos no código pro Firebase.
// É seguro: só escreve em /produtos e /cupons, nunca mexe em pedidos ou configurações.

const DADOS_INICIAIS = {
    produtos: {
        p1: { nome: "Bolo de Cenoura com Brigadeiro", descricao: "Delicioso bolo de cenoura fofinho com uma generosa cobertura de brigadeiro cremoso.", preco: 45.00, imagem: "bolo_cenoura.jpg", disponivel: true, categoria: "Bolo" },
        p2: { nome: "Torta de Limão", descricao: "Clássica torta de limão com base crocante e merengue suíço maçaricado.", preco: 38.00, imagem: "torta_limao.jpg", disponivel: true, categoria: "Sobremesa" },
        p3: { nome: "Brigadeiro Gourmet", descricao: "Caixa com 6 unidades de brigadeiros gourmet variados (tradicional, ninho, churros).", preco: 25.00, imagem: "brigadeiro_gourmet.jpg", disponivel: true, categoria: "Brigadeiro" },
        p4: { nome: "Cupcake de Chocolate", descricao: "Cupcake macio de chocolate com cobertura de ganache e granulado.", preco: 12.00, imagem: "cupcake_chocolate.jpg", disponivel: false, categoria: "Bolo" },
        p5: { nome: "Pudim de Leite Condensado", descricao: "Tradicional pudim de leite condensado com calda de caramelo.", preco: 30.00, imagem: "pudim_leite.jpg", disponivel: true, categoria: "Sobremesa" },
        p6: { nome: "Bolo de Chocolate Trufado", descricao: "Bolo intenso de chocolate com recheio e cobertura de trufa cremosa.", preco: 60.00, imagem: "bolo_chocolate_trufado.jpg", disponivel: true, categoria: "Bolo" },
        p7: { nome: "Bolo no Pote de Morango", descricao: "Delicioso bolo no pote com camadas de massa, creme e morangos frescos.", preco: 18.00, imagem: "bolo_pote_morango.jpg", disponivel: true, categoria: "Bolo no Pote" },
        p8: { nome: "Copo da Felicidade", descricao: "Camadas de brownie, brigadeiro, chantilly e frutas vermelhas no copo.", preco: 25.00, imagem: "copo_felicidade.jpg", disponivel: true, categoria: "Copo" },
        p9: { nome: "Coxinha de Frango", descricao: "Tradicional coxinha de frango com catupiry, crocante por fora e cremosa por dentro.", preco: 8.00, imagem: "coxinha_frango.jpg", disponivel: true, categoria: "Salgados" },
        p10: { nome: "Refrigerante Lata", descricao: "Coca-Cola, Guaraná ou Soda Limonada (350ml).", preco: 6.00, imagem: "refrigerante.jpg", disponivel: true, categoria: "Bebidas" }
    },
    cupons: {
        BRITS10: { tipo: "percentual", valor: 10 },
        BEMVINDO5: { tipo: "fixo", valor: 5 },
        FRETEGRATIS: { tipo: "frete_gratis" }
    }
};

function importarDadosIniciais() {
    if (!confirm('Isso vai cadastrar os produtos e cupons que já existiam no cardápio. Só faça isso uma vez. Continuar?')) return;
    Promise.all([
        db.ref('produtos').set(DADOS_INICIAIS.produtos),
        db.ref('cupons').set(DADOS_INICIAIS.cupons)
    ]).then(() => {
        alert('Importado com sucesso! Os produtos e cupons já aparecem abaixo.');
    }).catch(err => alert('Erro ao importar: ' + err.message));
}

// ---------- PRODUTOS ----------

function montarLinhaProduto(id, produto) {
    const div = document.createElement('div');
    div.classList.add('produto-admin-item');
    div.innerHTML = `
        <div class="produto-admin-linha">
            <input type="text" id="prodNome_${id}" value="${produto.nome || ''}" placeholder="Nome do produto">
            <label class="produto-disponivel-check">
                <input type="checkbox" id="prodDisp_${id}" ${produto.disponivel !== false ? 'checked' : ''}> Disponível
            </label>
            <label class="produto-disponivel-check campo-esconder-produto">
                <input type="checkbox" id="prodEscondido_${id}" ${produto.escondido ? 'checked' : ''}> Esconder do cardápio
            </label>
            <label class="produto-disponivel-check campo-encomenda-produto">
                <input type="checkbox" id="prodEncomenda_${id}" ${produto.disponivelParaEncomenda ? 'checked' : ''}> 🎂 Disponível pra Encomenda
            </label>
        </div>
        <div class="campo-vincular-ficha-tecnica" style="margin-top:8px;">
            <label class="campo-label">📋 Vincular à Ficha Técnica (opcional — permite consumir estoque automaticamente)</label>
            <select id="prodFichaTecnica_${id}">
                <option value="">— Nenhuma —</option>
                ${fichaTecnica.map(ft => `<option value="${ft.id}" ${produto.fichaTecnicaId === ft.id ? 'selected' : ''}>${ft.nome}</option>`).join('')}
            </select>
        </div>
        <textarea id="prodDesc_${id}" placeholder="Descrição" rows="2">${produto.descricao || ''}</textarea>

        <div class="produto-admin-linha">
            <div class="campo-com-label">
                <label class="campo-label">Preço atual</label>
                <input type="text" inputmode="decimal" id="prodPreco_${id}" value="${produto.preco != null ? produto.preco : ''}" placeholder="Ex: 45,00">
            </div>
            <div class="campo-com-label">
                <label class="campo-label">Preço "de" (oferta — precisa ser MAIOR)</label>
                <input type="text" inputmode="decimal" id="prodPrecoOriginal_${id}" value="${produto.precoOriginal != null ? produto.precoOriginal : ''}" placeholder="Ex: 55,00 (opcional)">
            </div>
        </div>

        <label class="campo-label">Foto(s) do produto (nomes dos arquivos, separados por VÍRGULA — a primeira é a foto principal)</label>
        <input type="text" id="prodImagens_${id}" value="${(Array.isArray(produto.imagens) && produto.imagens.length ? produto.imagens : (produto.imagem ? [produto.imagem] : [])).join(', ')}" placeholder="Ex: bolo1.jpg, bolo2.jpg, bolo3.jpg" oninput="atualizarPreviaImagens('${id}')">
        <div id="previaImagens_${id}" class="previa-imagens"></div>

        <input type="text" id="prodCategoria_${id}" value="${produto.categoria || ''}" placeholder="Categoria" list="categoriasDatalist">

        <label class="campo-label">Sabores/opções (digite cada um separado por VÍRGULA — deixe em branco se não tiver)</label>
        <input type="text" id="prodVariantes_${id}" value="${(produto.variantes || []).join(', ')}" placeholder="Ex: Chocolate, Morango, Baunilha" oninput="atualizarPreviaVariantes('${id}')">
        <div id="previaVariantes_${id}" class="previa-variantes"></div>

        <div id="blocoAdicionais_${id}" style="display:${adicionaisAtivo ? 'block' : 'none'};">
            <label class="campo-label">
                Grupos de adicionais (opcional) — um grupo por linha, formato:
                <code>Nome do grupo (obrigatório ou opcional): opção1, opção2 +preço, opção3</code>
            </label>
            <textarea id="prodAdicionais_${id}" class="campo-adicionais" placeholder="Escolha o recheio (obrigatório): Chocolate, Ninho com Morango +2, Doce de Leite
Adicione extras (opcional): Granola +2, Chantilly extra +3, Confete +1.5">${montarTextoAdicionaisParaEdicao(produto.grupoAdicionais)}</textarea>
            <p class="dica-secao">Grupo "obrigatório" = o cliente tem que escolher 1. Grupo "opcional" = pode escolher quantos quiser (ou nenhum). Opção sem "+preço" fica de graça. ⚠️ Pros centavos, use PONTO, não vírgula (ex: "+1.50", não "+1,50" — a vírgula aqui é só pra separar as opções).</p>
            <p id="avisoAdicionais_${id}" class="aviso-adicionais" style="display:none;"></p>
        </div>

        <div class="produto-admin-acoes">
            <button class="btn-salvar-produto" onclick="salvarProduto('${id}')">💾 Salvar</button>
            <button class="btn-excluir-produto" onclick="excluirProduto('${id}')">🗑️ Excluir</button>
        </div>
    `;
    return div;
}

// Mostra na hora quantos "sabores" foram reconhecidos, pra confirmar que separou certo por vírgula
// Mostra as fotos de verdade (miniaturas), pra confirmar visualmente que os nomes dos arquivos estão certos
function atualizarPreviaImagens(id) {
    const input = document.getElementById('prodImagens_' + id);
    const previa = document.getElementById('previaImagens_' + id);
    if (!input || !previa) return;
    const nomes = input.value.trim().split(',').map(v => v.trim()).filter(v => v.length > 0);
    if (nomes.length === 0) { previa.innerHTML = ''; return; }
    previa.innerHTML = nomes.map(nome =>
        `<img src="${nome}" alt="${nome}" class="previa-imagem-thumb" onerror="this.classList.add('previa-imagem-erro')">`
    ).join('');
}

function atualizarPreviaVariantes(id) {
    const texto = document.getElementById('prodVariantes_' + id).value.trim();
    const previa = document.getElementById('previaVariantes_' + id);
    if (!texto) { previa.innerHTML = ''; return; }
    const partes = texto.split(',').map(v => v.trim()).filter(v => v.length > 0);
    if (partes.length <= 1) {
        previa.innerHTML = `<span class="previa-aviso">⚠️ Só reconheci ${partes.length} opção. Se quiser mais de uma, separe com vírgula (,).</span>`;
    } else {
        previa.innerHTML = `Vai aparecer assim: ` + partes.map(v => `<span class="previa-pill">${v}</span>`).join(' ');
    }
}

// Guarda as categorias reais que existem nos produtos, pra conferir o que o dono digitar na ordem
let categoriasConhecidas = [];
let produtosConhecidos = [];

// Preenche a lista suspensa (datalist) do campo de categoria com as categorias que já existem,
// pra facilitar escolher uma existente em vez de digitar (e evitar duplicar por causa de erro de digitação)
function atualizarDatalistCategorias() {
    const datalist = document.getElementById('categoriasDatalist');
    if (!datalist) return;
    datalist.innerHTML = categoriasConhecidas
        .slice()
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map(cat => `<option value="${cat}"></option>`)
        .join('');
}

let ultimoValProdutosAdmin = null; // guarda os últimos dados, pra poder re-renderizar
// a lista sem precisar reler o Firebase (ex: quando a Ficha Técnica carrega depois)

function escutarProdutos() {
    db.ref('produtos').on('value', snap => {
        ultimoValProdutosAdmin = snap.val() || {};
        renderizarListaProdutosAdmin();
    });
}

function renderizarListaProdutosAdmin() {
    const lista = document.getElementById('produtosAdminList');
    const btnImportar = document.getElementById('btnImportarDados');
    if (!lista) return;

    const val = ultimoValProdutosAdmin || {};
    const itens = Object.entries(val).map(([id, produto]) => ({ id, produto }));
    itens.sort((a, b) => (a.produto.criadoEm || 0) - (b.produto.criadoEm || 0));

    categoriasConhecidas = [...new Set(itens.map(i => i.produto.categoria).filter(Boolean))];
    produtosConhecidos = itens.map(i => i.produto.nome).filter(Boolean);
    atualizarDatalistCategorias();
    atualizarPreviaOrdemCategorias();
    atualizarSelectProdutoRecompensa();

    btnImportar.style.display = itens.length === 0 ? 'block' : 'none';

    lista.innerHTML = '';
    if (itens.length === 0) {
        lista.innerHTML = '<p class="vazio">Nenhum produto cadastrado ainda.</p>';
        return;
    }
    itens.forEach(({ id, produto }) => {
        lista.appendChild(montarLinhaProduto(id, produto));
        atualizarPreviaImagens(id);
    });
}

// Aceita tanto vírgula quanto ponto como separador decimal (ex: "45,00" ou "45.00")
function paraNumero(texto) {
    if (!texto) return NaN;
    return parseFloat(String(texto).trim().replace(',', '.'));
}

// Converte uma linha de texto (ex: "Escolha o recheio (obrigatório): Chocolate, Ninho +2")
// num grupo de adicionais estruturado. Retorna null se a linha não fizer sentido.
function parseLinhaAdicionais(linha) {
    const partesLinha = linha.split(':');
    if (partesLinha.length < 2) return null;

    const cabecalho = partesLinha[0].trim();
    const opcoesTexto = partesLinha.slice(1).join(':').trim();
    if (!opcoesTexto) return null;

    const obrigatorio = /\(obrigat[oó]rio\)/i.test(cabecalho);
    const nomeGrupo = cabecalho.replace(/\(obrigat[oó]rio\)/i, '').replace(/\(opcional\)/i, '').trim();
    if (!nomeGrupo) return null;

    const opcoes = opcoesTexto.split(',').map(opcaoTexto => {
        opcaoTexto = opcaoTexto.trim();
        // Só aceita PONTO pra decimais aqui (não vírgula) — a vírgula já é usada pra
        // separar as opções, então "+1,50" quebraria ao dividir a linha
        const precoMatch = opcaoTexto.match(/\+\s*([\d.]+)\s*$/);
        if (!precoMatch) return { nome: opcaoTexto, preco: 0 };
        const preco = parseFloat(precoMatch[1]) || 0;
        return { nome: opcaoTexto.slice(0, precoMatch.index).trim(), preco };
    }).filter(o => o.nome.length > 0);

    return opcoes.length > 0 ? { nome: nomeGrupo, obrigatorio, opcoes } : null;
}

// Converte o texto inteiro do campo (várias linhas, uma por grupo) na estrutura de dados —
// usado ao SALVAR o produto
function parseTextoAdicionais(texto) {
    if (!texto || !texto.trim()) return null;
    const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const grupos = linhas.map(parseLinhaAdicionais).filter(g => g !== null);
    return grupos.length > 0 ? grupos : null;
}

// Faz o caminho inverso: pega a estrutura de dados já salva e monta o texto de volta,
// pra preencher o campo quando abrir o produto pra editar de novo
function montarTextoAdicionaisParaEdicao(grupoAdicionais) {
    if (!Array.isArray(grupoAdicionais) || grupoAdicionais.length === 0) return '';
    return grupoAdicionais.map(g => {
        const tag = g.obrigatorio ? '(obrigatório)' : '(opcional)';
        const opcoesTexto = (g.opcoes || []).map(o => o.preco > 0 ? `${o.nome} +${o.preco}` : o.nome).join(', ');
        return `${g.nome} ${tag}: ${opcoesTexto}`;
    }).join('\n');
}

// Confere se algum "nome de opção" ficou só com números — sinal quase certo de que a
// pessoa usou vírgula pro preço (ex: "+1,50") e a linha quebrou ao meio sem querer
function detectarPossivelErroDeVirgula(grupos) {
    if (!grupos) return false;
    return grupos.some(g => (g.opcoes || []).some(o => /^\d+$/.test(o.nome)));
}

function salvarProduto(id) {
    const nome = document.getElementById('prodNome_' + id).value.trim();
    const descricao = document.getElementById('prodDesc_' + id).value.trim();
    const preco = paraNumero(document.getElementById('prodPreco_' + id).value);
    const precoOriginal = paraNumero(document.getElementById('prodPrecoOriginal_' + id).value);
    const imagensTexto = document.getElementById('prodImagens_' + id).value.trim();
    const categoria = document.getElementById('prodCategoria_' + id).value.trim();
    const disponivel = document.getElementById('prodDisp_' + id).checked;
    const escondido = document.getElementById('prodEscondido_' + id).checked;
    const disponivelParaEncomenda = document.getElementById('prodEncomenda_' + id).checked;
    const campoFichaTecnica = document.getElementById('prodFichaTecnica_' + id);
    const fichaTecnicaId = campoFichaTecnica ? (campoFichaTecnica.value || null) : null;
    const variantesTexto = document.getElementById('prodVariantes_' + id).value.trim();
    const adicionaisTexto = document.getElementById('prodAdicionais_' + id).value.trim();

    const imagens = imagensTexto ? imagensTexto.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];

    if (!nome || isNaN(preco) || imagens.length === 0 || !categoria) {
        alert('Preencha nome, preço, ao menos uma foto e categoria antes de salvar.');
        return;
    }

    const dados = { nome, descricao, preco, imagem: imagens[0], imagens, categoria, disponivel, escondido, disponivelParaEncomenda, fichaTecnicaId, precoOriginal: null, variantes: null, grupoAdicionais: null };

    if (!isNaN(precoOriginal) && precoOriginal > preco) {
        dados.precoOriginal = precoOriginal;
    }

    if (variantesTexto) {
        dados.variantes = variantesTexto.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }

    dados.grupoAdicionais = parseTextoAdicionais(adicionaisTexto);

    const avisoEl = document.getElementById('avisoAdicionais_' + id);
    if (detectarPossivelErroDeVirgula(dados.grupoAdicionais)) {
        if (avisoEl) {
            avisoEl.style.display = 'block';
            avisoEl.textContent = '⚠️ Parece que você usou vírgula num preço (ex: "+1,50") — troca por ponto (ex: "+1.50") e salva de novo, senão o preço fica errado.';
        }
        return; // não salva até corrigir, pra não gravar um preço errado sem querer
    }
    if (avisoEl) avisoEl.style.display = 'none';

    db.ref('produtos/' + id).update(dados)
        .then(() => alert('Produto salvo!'))
        .catch(err => alert('Erro ao salvar produto: ' + err.message));
}


function excluirProduto(id) {
    if (!confirm('Excluir este produto do cardápio? Essa ação não pode ser desfeita.')) return;
    db.ref('produtos/' + id).remove().catch(err => alert('Erro ao excluir produto: ' + err.message));
}

function adicionarNovoProduto() {
    const novoRef = db.ref('produtos').push();
    novoRef.set({
        nome: 'Novo produto',
        descricao: '',
        preco: 0,
        imagem: '',
        imagens: [],
        categoria: 'Outros',
        disponivel: false,
        criadoEm: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => alert('Erro ao criar produto: ' + err.message));
}

// ---------- CUPONS ----------

let cuponsCache = {}; // guarda os cupons carregados, pra "Editar" conseguir preencher o formulário

function montarCupomLinha(codigo, cupom) {
    const div = document.createElement('div');
    div.classList.add('cupom-admin-item');
    let detalhe = 'Frete grátis';
    if (cupom.tipo === 'percentual') detalhe = `${cupom.valor}% de desconto`;
    else if (cupom.tipo === 'fixo') detalhe = `R$ ${Number(cupom.valor).toFixed(2).replace('.', ',')} de desconto`;

    const partesExtra = [];
    if (cupom.limiteUsos) partesExtra.push(`${cupom.usosContados || 0}/${cupom.limiteUsos} usado(s)`);
    if (cupom.validoDe || cupom.validoAte) {
        const de = cupom.validoDe ? cupom.validoDe.split('-').reverse().join('/') : '—';
        const ate = cupom.validoAte ? cupom.validoAte.split('-').reverse().join('/') : '—';
        partesExtra.push(`válido ${de} a ${ate}`);
    }
    const extraHtml = partesExtra.length > 0 ? `<small>${partesExtra.join(' · ')}</small>` : '';

    div.innerHTML = `
        <div class="cupom-admin-info">
            <strong>${codigo}</strong>
            <span>${detalhe}</span>
            ${extraHtml}
        </div>
        <button class="btn-secondary" onclick="editarCupom('${codigo}')" title="Editar">✏️</button>
        <button class="btn-excluir-cupom" onclick="excluirCupom('${codigo}')">🗑️</button>
    `;
    return div;
}

// Preenche o formulário com os valores atuais do cupom, pra editar sem precisar
// lembrar/adivinhar o que já estava configurado antes
function editarCupom(codigo) {
    const cupom = cuponsCache[codigo];
    if (!cupom) return;
    document.getElementById('novoCupomCodigo').value = codigo;
    document.getElementById('novoCupomTipo').value = cupom.tipo;
    document.getElementById('novoCupomValor').value = cupom.valor || '';
    document.getElementById('novoCupomLimiteUsos').value = cupom.limiteUsos || '';
    document.getElementById('novoCupomValidoDe').value = cupom.validoDe || '';
    document.getElementById('novoCupomValidoAte').value = cupom.validoAte || '';
    atualizarCampoValorCupom();
    document.getElementById('novoCupomCodigo').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escutarCupons() {
    db.ref('cupons').on('value', snap => {
        const val = snap.val() || {};
        cuponsCache = val;
        const codigos = Object.keys(val);
        const lista = document.getElementById('cuponsAdminList');
        lista.innerHTML = '';
        if (codigos.length === 0) {
            lista.innerHTML = '<p class="vazio">Nenhum cupom cadastrado.</p>';
            return;
        }
        codigos.forEach(codigo => lista.appendChild(montarCupomLinha(codigo, val[codigo])));
    });
}

function atualizarCampoValorCupom() {
    const tipo = document.getElementById('novoCupomTipo').value;
    document.getElementById('novoCupomValor').style.display = tipo === 'frete_gratis' ? 'none' : 'block';
}

function adicionarCupom() {
    const codigo = document.getElementById('novoCupomCodigo').value.trim().toUpperCase();
    const tipo = document.getElementById('novoCupomTipo').value;
    const valorInput = paraNumero(document.getElementById('novoCupomValor').value);
    const limiteUsosInput = document.getElementById('novoCupomLimiteUsos').value.trim();
    const validoDe = document.getElementById('novoCupomValidoDe').value || null;
    const validoAte = document.getElementById('novoCupomValidoAte').value || null;

    if (!codigo) { alert('Digite um código pro cupom.'); return; }
    if (tipo !== 'frete_gratis' && (isNaN(valorInput) || valorInput <= 0)) {
        alert('Digite um valor válido pro desconto.');
        return;
    }
    if (validoDe && validoAte && validoAte < validoDe) {
        alert('A data final não pode ser antes da inicial.');
        return;
    }

    const dadosCupom = tipo === 'frete_gratis' ? { tipo } : { tipo, valor: valorInput };
    if (limiteUsosInput) dadosCupom.limiteUsos = parseInt(limiteUsosInput, 10);
    if (validoDe) dadosCupom.validoDe = validoDe;
    if (validoAte) dadosCupom.validoAte = validoAte;

    // Se já existir um cupom com esse código (editando de novo), preserva o contador de
    // usos que já tinha — só zera de verdade quando o código é genuinamente novo
    db.ref('cupons/' + codigo).once('value').then(snap => {
        const existente = snap.val();
        dadosCupom.usosContados = (existente && existente.usosContados) || 0;
        return db.ref('cupons/' + codigo).set(dadosCupom);
    })
        .then(() => {
            document.getElementById('novoCupomCodigo').value = '';
            document.getElementById('novoCupomValor').value = '';
            document.getElementById('novoCupomLimiteUsos').value = '';
            document.getElementById('novoCupomValidoDe').value = '';
            document.getElementById('novoCupomValidoAte').value = '';
        })
        .catch(err => alert('Erro ao salvar cupom: ' + err.message));
}

function excluirCupom(codigo) {
    if (!confirm(`Excluir o cupom "${codigo}"?`)) return;
    db.ref('cupons/' + codigo).remove().catch(err => alert('Erro ao excluir cupom: ' + err.message));
}

// ---------- ORDEM DAS CATEGORIAS ----------

function escutarOrdemCategorias() {
    db.ref('configuracao/ordemCategorias').on('value', snap => {
        const input = document.getElementById('ordemCategoriasInput');
        // Não sobrescreve o que o dono está digitando no momento
        if (document.activeElement === input) return;
        const ordem = snap.val() || [];
        input.value = ordem.join(', ');
        atualizarPreviaOrdemCategorias();
    });
}

// Mostra quais categorias digitadas realmente existem nos produtos, e avisa quando alguma não bater
function atualizarPreviaOrdemCategorias() {
    const input = document.getElementById('ordemCategoriasInput');
    const previa = document.getElementById('previaOrdemCategorias');
    if (!input || !previa) return;

    const texto = input.value.trim();
    if (!texto) { previa.innerHTML = ''; return; }

    const digitadas = texto.split(',').map(v => v.trim()).filter(v => v.length > 0);
    const partes = digitadas.map(cat => {
        const existe = categoriasConhecidas.includes(cat);
        return existe
            ? `<span class="previa-pill">${cat}</span>`
            : `<span class="previa-pill previa-pill-erro">${cat} ⚠️ não encontrada</span>`;
    });
    previa.innerHTML = partes.join(' ');
}

function salvarOrdemCategorias() {
    const texto = document.getElementById('ordemCategoriasInput').value.trim();
    const ordem = texto ? texto.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];
    db.ref('configuracao/ordemCategorias').set(ordem)
        .then(() => {
            const msg = document.getElementById('ordemCategoriasMsg');
            msg.textContent = '✅ Ordem salva!';
            setTimeout(() => { msg.textContent = ''; }, 3000);
        })
        .catch(err => alert('Erro ao salvar ordem: ' + err.message));
}

// ---------- FOTOS EM USO (ajuda a achar imagens sem uso no GitHub) ----------

// ---------- VISITANTES ----------

function escutarVisitantesOnline() {
    db.ref('presenca').on('value', snap => {
        const total = snap.numChildren();
        const el = document.getElementById('visitantesOnlineCount');
        const elTopo = document.getElementById('visitantesOnlineCountTopo');
        if (el) el.textContent = total;
        if (elTopo) elTopo.textContent = total;
    });
}

function carregarVisitasPeriodo() {
    const dataIni = document.getElementById('visitasDataInicio').value;
    const dataFim = document.getElementById('visitasDataFim').value;
    if (!dataIni || !dataFim) { alert('Escolha as duas datas.'); return; }
    if (dataIni > dataFim) { alert('A data "De" precisa ser antes (ou igual) da data "Até".'); return; }

    db.ref('visitasPorDia').once('value').then(snap => {
        const dados = snap.val() || {};
        let total = 0;
        Object.entries(dados).forEach(([data, contador]) => {
            if (data >= dataIni && data <= dataFim) total += (contador || 0);
        });
        document.getElementById('visitasPeriodoResultado').textContent = `${total} visita(s) no período selecionado`;
    }).catch(err => alert('Não foi possível carregar as visitas: ' + err.message));
}

// ---------- FECHAMENTO DIÁRIO DE PEDIDOS ----------

// Usa só os status que já existem no sistema — não inventa nenhum novo
const STATUS_LABELS_FECHAMENTO = {
    pendente: 'Recebido',
    aceito: 'Em preparo',
    em_rota: 'Saiu para entrega',
    entregue: 'Entregue',
    recusado: 'Cancelado'
};

// Preço final do pedido, com um fallback seguro caso o frete ainda não tenha sido confirmado
function totalDoPedido(p) {
    if (p.total != null) return p.total;
    return Math.max(0, (p.subtotal || 0) - (p.desconto || 0) + (p.frete || 0));
}

function formatarEnderecoResumo(e) {
    if (!e) return 'Não informado';
    const partes = [e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.estado, e.cep].filter(Boolean);
    return partes.length ? partes.join(', ') : 'Não informado';
}

function formatarHorario(timestamp) {
    if (typeof timestamp !== 'number') return 'Não informado';
    const d = new Date(timestamp);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Guarda os pedidos do fechamento em memória, pra usar nos botões de copiar/marcar sem buscar de novo
let fechamentoPedidosAtuais = {};

function carregarFechamentoDiario() {
    const dataInicioInput = document.getElementById('fechamentoDataInicio').value; // formato yyyy-mm-dd
    const dataFimInput = document.getElementById('fechamentoDataFim').value;
    if (!dataInicioInput || !dataFimInput) { alert('Escolha as datas "De" e "Até".'); return; }
    if (dataInicioInput > dataFimInput) { alert('A data "De" precisa ser antes (ou igual) da data "Até".'); return; }
    const filtroStatus = document.getElementById('fechamentoFiltroStatus').value;
    const filtroTipo = document.getElementById('fechamentoFiltroTipo').value;

    const [anoI, mesI, diaI] = dataInicioInput.split('-').map(Number);
    const [anoF, mesF, diaF] = dataFimInput.split('-').map(Number);
    const inicio = new Date(anoI, mesI - 1, diaI, 0, 0, 0, 0).getTime();
    const fim = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999).getTime();

    // Busca todos os pedidos e filtra o período aqui mesmo (mais confiável do que depender
    // de um índice do Firebase, que exigiria configuração extra na regra de segurança)
    db.ref('pedidos').once('value').then(snap => {
        let pedidosDoDia = [];
        snap.forEach(child => {
            const p = child.val();
            const ts = typeof p.timestamp === 'number' ? p.timestamp : 0;
            if (ts >= inicio && ts <= fim) pedidosDoDia.push({ id: child.key, ...p });
        });
        pedidosDoDia.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let pedidosFiltrados = pedidosDoDia;
        if (filtroStatus !== 'todos') pedidosFiltrados = pedidosFiltrados.filter(p => p.status === filtroStatus);
        if (filtroTipo !== 'todos') pedidosFiltrados = pedidosFiltrados.filter(p => p.tipoEntrega === filtroTipo);

        fechamentoPedidosAtuais = {};
        pedidosFiltrados.forEach(p => { fechamentoPedidosAtuais[p.id] = p; });

        renderFechamentoDiario(pedidosFiltrados, dataInicioInput, dataFimInput);
    }).catch(err => alert('Não foi possível carregar o fechamento: ' + err.message));
}

function renderFechamentoDiario(pedidos, dataInicioInput, dataFimInput) {
    const div = document.getElementById('fechamentoConteudo');
    const dataInicioFormatada = dataInicioInput.split('-').reverse().join('/');
    const dataFimFormatada = dataFimInput.split('-').reverse().join('/');
    const mesmodia = dataInicioInput === dataFimInput;
    const dataFormatada = mesmodia ? dataInicioFormatada : `${dataInicioFormatada} a ${dataFimFormatada}`;
    const rotuloData = mesmodia ? 'Data' : 'Período';

    if (pedidos.length === 0) {
        div.innerHTML = '<p class="vazio">Nenhum pedido encontrado com esse filtro, nesse período.</p>';
        return;
    }

    const cancelados = pedidos.filter(p => p.status === 'recusado');
    const validos = pedidos.filter(p => p.status !== 'recusado');
    const concluidos = pedidos.filter(p => p.status === 'entregue');
    const emAndamento = pedidos.filter(p => ['pendente', 'aceito', 'em_rota'].includes(p.status));
    const totalValidos = validos.reduce((s, p) => s + totalDoPedido(p), 0);

    const resumoHtml = `
        <div class="pedido-total-linha"><span>📦 Pedidos recebidos</span><span><strong>${pedidos.length}</strong></span></div>
        <div class="pedido-total-linha"><span>✅ Pedidos concluídos</span><span><strong>${concluidos.length}</strong></span></div>
        <div class="pedido-total-linha"><span>⏳ Em andamento</span><span><strong>${emAndamento.length}</strong></span></div>
        <div class="pedido-total-linha"><span>❌ Cancelados</span><span><strong>${cancelados.length}</strong></span></div>
        <div class="pedido-total-linha total-final"><span>💰 Total dos pedidos válidos</span><span><strong>${formatarPreco(totalValidos)}</strong></span></div>
    `;

    const listaValidosHtml = validos.map(p => montarCardPedidoFechamento(p)).join('');
    const listaCanceladosHtml = cancelados.length > 0 ? `
        <h3 style="margin-top:20px; color:#a53238;">❌ Pedidos cancelados</h3>
        ${cancelados.map(p => montarCardPedidoFechamento(p)).join('')}
    ` : '';

    // Produtos vendidos (só conta pedidos válidos, não cancelados)
    const produtosAgregados = {};
    validos.forEach(p => (p.itens || []).forEach(item => {
        if (!produtosAgregados[item.nome]) produtosAgregados[item.nome] = { quantidade: 0, subtotal: 0 };
        produtosAgregados[item.nome].quantidade += item.quantidade;
        produtosAgregados[item.nome].subtotal += (item.preco || 0) * item.quantidade;
    }));
    const produtosOrdenados = Object.entries(produtosAgregados).sort((a, b) => b[1].quantidade - a[1].quantidade);
    const produtosHtml = produtosOrdenados.length > 0 ? `
        <h3 style="margin-top:20px;">🛍️ Produtos vendidos no dia</h3>
        ${produtosOrdenados.map(([nome, dados]) => `<div class="pedido-total-linha"><span>${nome} — ${dados.quantidade} un.</span><span>${formatarPreco(dados.subtotal)}</span></div>`).join('')}
    ` : '';

    // Formas de pagamento (só pedidos válidos, e só as formas que realmente aparecem)
    const pagamentosAgregados = {};
    validos.forEach(p => {
        const forma = p.formaPagamento || 'Não informado';
        pagamentosAgregados[forma] = (pagamentosAgregados[forma] || 0) + totalDoPedido(p);
    });
    const pagamentosHtml = Object.keys(pagamentosAgregados).length > 0 ? `
        <h3 style="margin-top:20px;">💳 Formas de pagamento</h3>
        ${Object.entries(pagamentosAgregados).map(([forma, valor]) => `<div class="pedido-total-linha"><span>${forma}</span><span>${formatarPreco(valor)}</span></div>`).join('')}
    ` : '';

    div.innerHTML = `
        <div class="fechamento-print-cabecalho">
            <h2>${LOJA_CONFIG.nome} — Fechamento Diário de Pedidos</h2>
            <p>${rotuloData}: ${dataFormatada}</p>
        </div>
        <h3>📊 Resumo do ${mesmodia ? 'Dia' : 'Período'}</h3>
        ${resumoHtml}
        <h3 style="margin-top:20px;">📋 Pedidos do ${mesmodia ? 'dia' : 'período'}</h3>
        ${listaValidosHtml}
        ${listaCanceladosHtml}
        ${produtosHtml}
        ${pagamentosHtml}
        <div class="fechamento-acoes">
            <button class="btn-secondary" onclick="copiarTodosPedidos('${dataFormatada}')">📋 Copiar todos os pedidos</button>
            <button class="btn-secondary" onclick="imprimirFechamento()">🖨️ Imprimir relatório</button>
        </div>
    `;
}

function montarCardPedidoFechamento(p) {
    const statusLabel = STATUS_LABELS_FECHAMENTO[p.status] || p.status;
    const tipoLabel = p.tipoEntrega === 'entrega' ? '🛵 Delivery' : (p.tipoEntrega === 'retirada' ? '🏪 Retirada no local' : 'Não informado');
    const itensHtml = (p.itens || []).map(item =>
        `<div class="pedido-total-linha"><span>${item.quantidade}x ${item.nome}${item.adicionaisTexto ? ` <em>(${item.adicionaisTexto})</em>` : ''}</span><span>${formatarPreco((item.preco || 0) * item.quantidade)}</span></div>`
    ).join('');
    const lancado = !!p.lancado;

    return `
    <div class="fechamento-pedido-card">
        <div class="fechamento-pedido-topo">
            <strong>🛒 Pedido #${p.numero ? String(p.numero).padStart(3, '0') : '—'}</strong>
            <span class="fechamento-status-badge tag-status-${p.status.replace('_', '-')}">${statusLabel}</span>
        </div>
        <p class="dica-secao">
            <strong>Cliente:</strong> ${p.nome || 'Não informado'} &nbsp;|&nbsp;
            <strong>Horário:</strong> ${formatarHorario(p.timestamp)} &nbsp;|&nbsp;
            <strong>${tipoLabel}</strong>
        </p>
        ${itensHtml}
        <div class="pedido-total-linha"><span>Subtotal</span><span>${formatarPreco(p.subtotal || 0)}</span></div>
        <div class="pedido-total-linha"><span>Desconto</span><span>${formatarPreco(p.desconto || 0)}</span></div>
        <div class="pedido-total-linha"><span>Frete</span><span>${formatarPreco(p.frete || 0)}</span></div>
        <div class="pedido-total-linha total-final"><span>Total</span><span>${formatarPreco(totalDoPedido(p))}</span></div>
        <p class="dica-secao"><strong>Pagamento:</strong> ${p.formaPagamento || 'Não informado'}${p.pagamento ? ` &nbsp;|&nbsp; <strong>Status:</strong> ${montarTagPagamento(p)}` : ''}</p>
        ${p.observacoes ? `<p class="dica-secao"><strong>Observações:</strong> ${p.observacoes}</p>` : ''}
        ${p.tipoEntrega === 'entrega' ? `<p class="dica-secao"><strong>Endereço:</strong> ${formatarEnderecoResumo(p.endereco)}</p>` : ''}

        <div class="fechamento-pedido-acoes">
            <button class="btn-secondary" onclick="copiarPedidoIndividual('${p.id}')">📋 Copiar pedido</button>
            <button class="btn-secondary" onclick="copiarPedidoParaSistemaGestao('${p.id}')">📥 Copiar p/ Sistema de Gestão</button>
            <button class="btn-lancado ${lancado ? 'lancado' : ''}" id="btn-lancado-${p.id}" onclick="alternarLancado('${p.id}')">${lancado ? '🟢 Lançado' : '🟠 Pendente de lançamento'}</button>
        </div>
    </div>`;
}

function montarTextoPedido(p) {
    const statusLabel = STATUS_LABELS_FECHAMENTO[p.status] || p.status;
    const tipoLabel = p.tipoEntrega === 'entrega' ? 'Delivery' : (p.tipoEntrega === 'retirada' ? 'Retirada no local' : 'Não informado');
    let texto = `PEDIDO #${p.numero ? String(p.numero).padStart(3, '0') : '—'}\n\n`;
    texto += `Cliente: ${p.nome || 'Não informado'}\n`;
    texto += `Horário: ${formatarHorario(p.timestamp)}\n`;
    texto += `Status: ${statusLabel}\n`;
    texto += `Tipo: ${tipoLabel}\n\n`;
    texto += `Itens:\n`;
    (p.itens || []).forEach(item => { texto += `${item.quantidade}x ${item.nome}${item.adicionaisTexto ? ' (' + item.adicionaisTexto + ')' : ''}\n`; });
    texto += `\nSubtotal: ${formatarPreco(p.subtotal || 0)}\n`;
    texto += `Desconto: ${formatarPreco(p.desconto || 0)}\n`;
    texto += `Frete: ${formatarPreco(p.frete || 0)}\n`;
    texto += `Total: ${formatarPreco(totalDoPedido(p))}\n\n`;
    texto += `Forma de pagamento: ${p.formaPagamento || 'Não informado'}\n`;
    if (p.pagamento) {
        const statusPagamentoLabel = { aguardando: 'Aguardando pagamento', pago: 'PAGO', divergente: 'VALOR DIVERGENTE - conferir' }[p.pagamento.status] || p.pagamento.status;
        texto += `Status do pagamento: ${statusPagamentoLabel}${p.pagamento.metodo ? ' (' + p.pagamento.metodo + ')' : ''}\n`;
    }
    if (p.observacoes) texto += `\nObservação: ${p.observacoes}\n`;
    if (p.tipoEntrega === 'entrega') texto += `\nEndereço: ${formatarEnderecoResumo(p.endereco)}\n`;
    return texto;
}

function copiarPedidoIndividual(id) {
    const p = fechamentoPedidosAtuais[id];
    if (!p) return;
    copiarTexto(montarTextoPedido(p));
}

// Gera um "código" com os dados do pedido organizados, pra colar no Sistema de Gestão
// e ele preencher o formulário de pedido sozinho (sem precisar digitar tudo de novo)
function copiarPedidoParaSistemaGestao(id) {
    const p = fechamentoPedidosAtuais[id];
    if (!p) return;

    const subtotal = p.subtotal || 0;
    // O cardápio guarda o desconto em R$, mas o Sistema de Gestão usa %, então convertemos aqui
    const descontoPercentual = subtotal > 0 ? Math.round(((p.desconto || 0) / subtotal) * 10000) / 100 : 0;

    // "Cartão" no cardápio não distingue crédito/débito — mapeamos pra crédito por padrão
    const mapaFormaPagamento = { 'Pix': 'pix', 'Dinheiro': 'dinheiro', 'Cartão': 'cartao_credito' };
    const formaPagamentoConvertida = mapaFormaPagamento[p.formaPagamento] || 'outros';

    const dataObj = typeof p.timestamp === 'number' ? new Date(p.timestamp) : new Date();
    const dataFormatada = dataObj.getFullYear() + '-' + String(dataObj.getMonth() + 1).padStart(2, '0') + '-' + String(dataObj.getDate()).padStart(2, '0');

    const dados = {
        origem: 'brits-cardapio',
        versao: 2,
        cliente: { nome: p.nome || '', telefone: p.telefone || '' },
        data: dataFormatada,
        dataEncomenda: p.dataEncomenda || null,
        itens: (p.itens || []).map(item => ({
            nome: item.nome,
            quantidade: item.quantidade,
            adicionais: item.adicionaisTexto || '',
            observacao: item.observacao || ''
        })),
        descontoPercentual,
        frete: p.frete || 0,
        sinal: (p.pagamento && p.pagamento.tipoPagamento === 'sinal') ? {
            percentual: p.pagamento.percentualSinal || 0,
            valorPago: p.pagamento.status === 'pago' ? (p.pagamento.valorSinal || 0) : 0,
            statusPagamento: p.pagamento.status || 'aguardando'
        } : null,
        formaPagamento: formaPagamentoConvertida,
        observacoes: p.observacoes || ''
    };

    const texto = '###PEDIDO_BRITS###\n' + JSON.stringify(dados) + '\n###FIM_PEDIDO_BRITS###';
    copiarTexto(texto);
}

function copiarTodosPedidos(dataFormatada) {
    const todos = Object.values(fechamentoPedidosAtuais).sort((a, b) => (a.numero || a.timestamp || 0) - (b.numero || b.timestamp || 0));
    if (todos.length === 0) return;

    const validos = todos.filter(p => p.status !== 'recusado');
    const totalDia = validos.reduce((s, p) => s + totalDoPedido(p), 0);

    let texto = `📋 FECHAMENTO DE PEDIDOS\n${LOJA_CONFIG.nome.toUpperCase()}\nData: ${dataFormatada}\n\n--------------------------------\n\n`;
    todos.forEach(p => {
        texto += montarTextoPedido(p);
        texto += `\n--------------------------------\n\n`;
    });
    texto += `TOTAL DO DIA: ${formatarPreco(totalDia)}\nPEDIDOS: ${todos.length}\n`;

    copiarTexto(texto);
}

function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto)
            .then(() => alert('Copiado! Já pode colar onde precisar.'))
            .catch(() => alert('Não foi possível copiar automaticamente. Copie o texto manualmente.'));
    } else {
        alert('Seu navegador não permite copiar automaticamente. Copie o texto manualmente.');
    }
}

// Marca/desmarca um pedido como já lançado no Sistema de Gestão — fica salvo no Firebase,
// então continua valendo mesmo trocando de aparelho ou recarregando a página
function alternarLancado(id) {
    const p = fechamentoPedidosAtuais[id];
    if (!p) return;
    const novoValor = !p.lancado;
    db.ref('pedidos/' + id).update({ lancado: novoValor }).then(() => {
        p.lancado = novoValor;
        const btn = document.getElementById('btn-lancado-' + id);
        if (btn) {
            btn.textContent = novoValor ? '🟢 Lançado' : '🟠 Pendente de lançamento';
            btn.classList.toggle('lancado', novoValor);
        }
    }).catch(err => alert('Não foi possível salvar: ' + err.message));
}

// ---------- CLUBE DE FIDELIDADE ----------

let configFidelidadeAtual = {};

function escutarConfigFidelidade() {
    db.ref('configuracao/fidelidade').on('value', snap => {
        const cfg = snap.val() || {};
        configFidelidadeAtual = cfg;
        const ativoEl = document.getElementById('fidelidadeAtiva');
        const dobroEl = document.getElementById('fidelidadePontosDobro');
        if (document.activeElement !== document.getElementById('fidelidadeValorPorPonto')) {
            document.getElementById('fidelidadeValorPorPonto').value = cfg.valorPorPonto != null ? cfg.valorPorPonto : '';
        }
        if (document.activeElement !== document.getElementById('fidelidadeMinPrata')) {
            document.getElementById('fidelidadeMinPrata').value = cfg.minPrata != null ? cfg.minPrata : '';
        }
        if (document.activeElement !== document.getElementById('fidelidadeMinOuro')) {
            document.getElementById('fidelidadeMinOuro').value = cfg.minOuro != null ? cfg.minOuro : '';
        }
        if (document.activeElement !== document.getElementById('fidelidadeMinVip')) {
            document.getElementById('fidelidadeMinVip').value = cfg.minVip != null ? cfg.minVip : '';
        }
        ativoEl.checked = !!cfg.ativo;
        dobroEl.checked = !!cfg.pontosDobro;
    });
}

// Credita os pontos ganhos (e desconta os de uma recompensa resgatada) só quando o pedido é
// marcado como Entregue — nunca antes disso, pra não premiar pedidos recusados/cancelados
function creditarPontosFidelidade(pedido) {
    if (!pedido || !pedido.telefone) return;
    const tel = String(pedido.telefone).replace(/\D/g, '');
    if (tel.length < 10) return;

    const cfg = configFidelidadeAtual || {};
    const valorBase = Math.max(0, (pedido.subtotal || 0) - (pedido.desconto || 0));
    let pontosGanhos = 0;
    if (cfg.ativo) {
        const valorPorPonto = cfg.valorPorPonto || 10;
        pontosGanhos = Math.floor(valorBase / valorPorPonto);
        if (cfg.pontosDobro) pontosGanhos *= 2;
    }
    const pontosResgatados = (pedido.recompensaResgatada && pedido.recompensaResgatada.pontos) || 0;

    const ref = db.ref('fidelidade/' + tel);
    ref.once('value').then(snap => {
        const atual = snap.val() || { pontos: 0, totalGasto: 0 };
        const novosPontos = Math.max(0, (atual.pontos || 0) + pontosGanhos - pontosResgatados);
        ref.set({
            nome: pedido.nome || atual.nome || '',
            pontos: novosPontos,
            totalGasto: Math.round(((atual.totalGasto || 0) + valorBase) * 100) / 100,
            ultimoPedido: {
                itens: (pedido.itens || []).map(i => ({ nome: i.nome, preco: i.preco, quantidade: i.quantidade, observacao: i.observacao || null })),
                tipoEntrega: pedido.tipoEntrega,
                data: Date.now()
            },
            atualizadoEm: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => console.log('Erro ao creditar fidelidade:', err));
    }).catch(err => console.log('Erro ao ler fidelidade:', err));
}

function salvarConfigFidelidade() {
    const dados = {
        ativo: document.getElementById('fidelidadeAtiva').checked,
        pontosDobro: document.getElementById('fidelidadePontosDobro').checked,
        valorPorPonto: paraNumero(document.getElementById('fidelidadeValorPorPonto').value) || 10,
        minPrata: parseInt(document.getElementById('fidelidadeMinPrata').value, 10) || 50,
        minOuro: parseInt(document.getElementById('fidelidadeMinOuro').value, 10) || 100,
        minVip: parseInt(document.getElementById('fidelidadeMinVip').value, 10) || 200
    };
    db.ref('configuracao/fidelidade').set(dados)
        .then(() => {
            const msg = document.getElementById('fidelidadeMsg');
            msg.textContent = '✅ Configuração salva!';
            setTimeout(() => { msg.textContent = ''; }, 3000);
        })
        .catch(err => alert('Erro ao salvar configuração do clube: ' + err.message));
}

function atualizarSelectProdutoRecompensa() {
    const sel = document.getElementById('novaRecompensaProduto');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '';
    produtosConhecidos.forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome; opt.textContent = nome;
        sel.appendChild(opt);
    });
    if (produtosConhecidos.includes(atual)) sel.value = atual;
}

function atualizarCampoRecompensa() {
    const tipo = document.getElementById('novaRecompensaTipo').value;
    document.getElementById('novaRecompensaValor').style.display = tipo === 'produto' ? 'none' : 'block';
    document.getElementById('novaRecompensaProduto').style.display = tipo === 'produto' ? 'block' : 'none';
}

function montarLinhaRecompensa(index, r) {
    const div = document.createElement('div');
    div.classList.add('cupom-admin-item');
    const detalhe = r.tipo === 'produto' ? `🎁 ${r.produtoNome}` : `💰 R$ ${Number(r.valor || 0).toFixed(2).replace('.', ',')} de desconto`;
    div.innerHTML = `
        <div class="cupom-admin-info">
            <strong>${r.pontos} pontos</strong>
            <span>${r.descricao} — ${detalhe}</span>
        </div>
        <button class="btn-excluir-cupom" onclick="removerRecompensa(${index})">🗑️</button>
    `;
    return div;
}

function escutarRecompensas() {
    db.ref('configuracao/recompensasFidelidade').on('value', snap => {
        const lista = snap.val() || [];
        const div = document.getElementById('recompensasAdminList');
        div.innerHTML = '';
        if (lista.length === 0) {
            div.innerHTML = '<p class="vazio">Nenhuma recompensa cadastrada ainda.</p>';
            return;
        }
        lista.forEach((r, i) => { if (r) div.appendChild(montarLinhaRecompensa(i, r)); });
    });
}

function adicionarRecompensa() {
    const pontos = parseInt(document.getElementById('novaRecompensaPontos').value, 10);
    const descricao = document.getElementById('novaRecompensaDescricao').value.trim();
    const tipo = document.getElementById('novaRecompensaTipo').value;

    if (!pontos || pontos <= 0 || !descricao) {
        alert('Preencha os pontos necessários e a descrição da recompensa.');
        return;
    }

    const recompensa = { pontos, descricao, tipo };
    if (tipo === 'produto') {
        const produtoNome = document.getElementById('novaRecompensaProduto').value;
        if (!produtoNome) { alert('Selecione o produto que será dado de graça.'); return; }
        recompensa.produtoNome = produtoNome;
    } else {
        const valor = paraNumero(document.getElementById('novaRecompensaValor').value);
        if (!valor || valor <= 0) { alert('Informe o valor do desconto.'); return; }
        recompensa.valor = valor;
    }

    db.ref('configuracao/recompensasFidelidade').once('value').then(snap => {
        const lista = snap.val() || [];
        lista.push(recompensa);
        return db.ref('configuracao/recompensasFidelidade').set(lista);
    }).then(() => {
        document.getElementById('novaRecompensaPontos').value = '';
        document.getElementById('novaRecompensaDescricao').value = '';
        document.getElementById('novaRecompensaValor').value = '';
    }).catch(err => alert('Erro ao adicionar recompensa: ' + err.message));
}

function removerRecompensa(index) {
    if (!confirm('Remover essa recompensa do catálogo?')) return;
    db.ref('configuracao/recompensasFidelidade').once('value').then(snap => {
        const lista = snap.val() || [];
        lista.splice(index, 1);
        return db.ref('configuracao/recompensasFidelidade').set(lista);
    }).catch(err => alert('Erro ao remover recompensa: ' + err.message));
}

function iniciarEscutaPedidos() {
    document.getElementById('statusConexao').textContent = 'Conectado — atualizando em tempo real';

    escutarConfigLoja();
    escutarProdutos();
    escutarCupons();
    escutarOrdemCategorias();
    escutarConfigFidelidade();
    escutarVisitantesOnline();
    escutarStatusAssinatura();
    escutarFormatoImpressao();
    escutarContadorDestinatarios();
    escutarConfigAgenda();
    escutarConfigFrete();
    escutarRecursosLiberados();
    renderizarListaPendenteBloqueio();
    escutarHistoricoNotificacoes();
    escutarIngredientes();
    escutarBases();
    escutarFichaTecnica();
    escutarClientesGestao();
    escutarPedidosManuais();
    const previaLojaNomeEl = document.getElementById('previaLojaNome');
    if (previaLojaNomeEl) previaLojaNomeEl.textContent = LOJA_CONFIG.nome;
    escutarConfigSomAlerta();
    inicializarAbasPainel();

    // Já deixa o campo de data do Resumo do Dia preenchido com hoje
    const hoje = new Date();
    const hojeFormatado = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    document.getElementById('fechamentoDataInicio').value = hojeFormatado;
    document.getElementById('fechamentoDataFim').value = hojeFormatado;

    // E o período de visitas já vem com os últimos 7 dias
    const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
    const seteDiasAtrasFormatado = seteDiasAtras.getFullYear() + '-' + String(seteDiasAtras.getMonth() + 1).padStart(2, '0') + '-' + String(seteDiasAtras.getDate()).padStart(2, '0');
    document.getElementById('visitasDataInicio').value = seteDiasAtrasFormatado;
    document.getElementById('visitasDataFim').value = hojeFormatado;
    escutarRecompensas();

    const refPedidos = db.ref('pedidos');
    const listaPendentesEl = document.getElementById('listaPendentes');
    const statusFinais = ['entregue', 'recusado'];
    const ehStatusFinal = pedido => statusFinais.includes(pedido.status);

    // Carrega os pedidos ainda ativos (pendente/aceito/em rota) já existentes, sem tocar som
    refPedidos.limitToLast(60).once('value').then(snapshot => {
        listaPendentesEl.innerHTML = '';
        const itens = [];
        snapshot.forEach(child => itens.push({ id: child.key, pedido: child.val() }));
        itens.reverse(); // mais recentes primeiro
        itens.forEach(({ id, pedido }) => {
            if (ehStatusFinal(pedido)) return;
            listaPendentesEl.appendChild(montarCardPedido(id, pedido, true));
            idsRenderizados.add(id);
        });
        if (idsRenderizados.size === 0) {
            listaPendentesEl.innerHTML = '<p class="vazio">Nenhum pedido novo no momento.</p>';
        }
        atualizarContador();
        primeiraCargaConcluida = true;
        restaurarPosicaoRolagem();

        // A partir daqui, qualquer pedido novo dispara som + aparece na hora
        refPedidos.on('child_added', snap => {
            if (idsRenderizados.has(snap.key)) return; // já estava na carga inicial
            const pedido = snap.val();
            if (ehStatusFinal(pedido)) return; // pedido antigo carregado já finalizado, ignora
            const vazio = listaPendentesEl.querySelector('.vazio');
            if (vazio) vazio.remove();
            listaPendentesEl.prepend(montarCardPedido(snap.key, pedido, true));
            idsRenderizados.add(snap.key);
            atualizarContador();
            if (primeiraCargaConcluida && pedido.status === 'pendente' && !window._importandoBackupGestao) tocarAlerta();
        });

        // Quando o status do pedido muda (aceitar, sair pra entrega, entregar, recusar)
        refPedidos.on('child_changed', snap => {
            const pedido = snap.val();
            const cardAtual = document.getElementById('pendente-' + snap.key);

            if (ehStatusFinal(pedido)) {
                // Chegou num status final -> sai da lista de pedidos ativos
                if (cardAtual) cardAtual.remove();
                idsRenderizados.delete(snap.key);
                if (idsRenderizados.size === 0) {
                    listaPendentesEl.innerHTML = '<p class="vazio">Nenhum pedido novo no momento.</p>';
                }
            } else if (idsRenderizados.has(snap.key) && cardAtual) {
                // Atualiza o card no lugar, com os botões certos pro novo estágio
                cardAtual.replaceWith(montarCardPedido(snap.key, pedido, true));
            }
            atualizarContador();
        });

        refPedidos.on('child_removed', snap => {
            idsRenderizados.delete(snap.key);
            const card = document.getElementById('pendente-' + snap.key);
            if (card) card.remove();
            if (idsRenderizados.size === 0) {
                listaPendentesEl.innerHTML = '<p class="vazio">Nenhum pedido novo no momento.</p>';
            }
            atualizarContador();
        });
    });

    // Histórico: pedidos das últimas 24 horas (qualquer status), só pra consulta.
    // Usa a ordenação padrão por chave (o Firebase já cria as chaves em ordem cronológica sozinho),
    // em vez de orderByChild('timestamp'), que exigiria um índice configurado na regra pra ser confiável.
    db.ref('pedidos').limitToLast(60).on('value', snapshot => {
        const listaHistoricoEl = document.getElementById('listaHistorico');
        const limite24h = Date.now() - (24 * 60 * 60 * 1000);
        const itens = [];
        snapshot.forEach(child => {
            const p = child.val();
            const ts = typeof p.timestamp === 'number' ? p.timestamp : 0;
            if (ts >= limite24h) itens.push({ id: child.key, pedido: p });
        });
        itens.reverse();
        listaHistoricoEl.innerHTML = '';
        if (itens.length === 0) {
            listaHistoricoEl.innerHTML = '<p class="vazio">Nenhum pedido nas últimas 24 horas.</p>';
            return;
        }
        itens.forEach(({ id, pedido }) => {
            listaHistoricoEl.appendChild(montarCardPedido(id, pedido, false));
        });
    });
}
