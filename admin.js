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
function hojeIsoLocal() {
    const partes = {};
    new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).forEach(parte => {
        if (parte.type !== 'literal') partes[parte.type] = parte.value;
    });
    return `${partes.year}-${partes.month}-${partes.day}`;
}

function escaparHtmlSeguro(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, caractere => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[caractere]);
}

function dataIsoParaDateLocal(dataIso) {
    if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return null;
    const d = new Date(dataIso + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatarDataIsoBr(dataIso) {
    const d = dataIsoParaDateLocal(dataIso);
    return d ? d.toLocaleDateString('pt-BR') : '—';
}

function diferencaDiasDataIso(dataIso) {
    const alvo = dataIsoParaDateLocal(dataIso);
    if (!alvo) return null;
    const hojeMeioDia = dataIsoParaDateLocal(hojeIsoLocal());
    if (!hojeMeioDia) return null;
    return Math.ceil((alvo.getTime() - hojeMeioDia.getTime()) / 86400000);
}

function aplicarVariaveisMensagemAssinatura(texto, dados, dias) {
    const plano = String((dados && dados.plano) || '').toUpperCase() || 'PedeAki';
    const nomeLoja = (typeof LOJA_CONFIG !== 'undefined' && LOJA_CONFIG.nome) ? LOJA_CONFIG.nome : 'sua loja';
    return String(texto || '')
        .replaceAll('{dias}', String(Math.max(0, Number(dias) || 0)))
        .replaceAll('{dataVencimento}', formatarDataIsoBr(dados && dados.dataVencimento))
        .replaceAll('{plano}', plano)
        .replaceAll('{nomeLoja}', nomeLoja);
}

/**
 * Aviso de renovação da assinatura. Continua compatível com o formato antigo
 * { status: 'atencao'|'bloqueado', mensagem: '...' }, mas agora também calcula
 * automaticamente o aviso usando data de vencimento + regras editáveis salvas no Firebase.
 */
function escutarStatusAssinatura() {
    const banner = document.getElementById('bannerAssinatura');
    if (!banner) return;

    db.ref('configuracao/assinatura').on('value', snap => {
        const dados = snap.val();
        if (!dados) {
            banner.style.display = 'none';
            return;
        }

        // Compatibilidade com o formato antigo enquanto o cliente ainda não tem ciclo configurado.
        if (!dados.dataVencimento) {
            const statusLegado = dados.status || 'ativo';
            const mensagemCustom = dados.mensagem;
            if (statusLegado === 'atencao' || statusLegado === 'bloqueado') {
                banner.className = 'banner-assinatura banner-assinatura-' + statusLegado;
                banner.textContent = mensagemCustom || (statusLegado === 'atencao'
                    ? '🔔 Existe uma pendência no seu sistema. Qualquer dúvida, é só entrar em contato com o suporte.'
                    : '⚠️ Seu acesso está temporariamente limitado. Entre em contato com o suporte pra regularizar e voltar ao normal.');
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
            return;
        }

        const dias = diferencaDiasDataIso(dados.dataVencimento);
        if (dias == null) { banner.style.display = 'none'; return; }
        const alertas = dados.alertas || {};
        const tolerancia = Math.max(0, Number(dados.diasTolerancia) || 0);
        let tipo = null;
        let mensagem = '';

        if (dias > 0) {
            const previos = [alertas.previo1, alertas.previo2, alertas.previo3]
                .filter(a => a && a.ativo !== false && Number(a.dias) >= dias)
                .sort((a, b) => Number(a.dias) - Number(b.dias));
            if (previos.length) {
                tipo = 'atencao';
                mensagem = aplicarVariaveisMensagemAssinatura(previos[0].mensagem, dados, dias);
            }
        } else if (dias === 0) {
            const a = alertas.vencimento;
            if (!a || a.ativo !== false) {
                tipo = 'atencao';
                mensagem = aplicarVariaveisMensagemAssinatura((a && a.mensagem) || '📅 Seu plano PedeAki vence hoje. Entre em contato para renovar e manter todos os recursos ativos.', dados, 0);
            }
        } else {
            const atraso = Math.abs(dias);
            if (atraso <= tolerancia) {
                const a = alertas.tolerancia;
                if (!a || a.ativo !== false) {
                    tipo = 'atencao';
                    mensagem = aplicarVariaveisMensagemAssinatura((a && a.mensagem) || '⚠️ Seu plano venceu em {dataVencimento} e está no período de tolerância. Regularize a renovação para evitar interrupções.', dados, 0);
                }
            } else {
                const a = alertas.vencido;
                if (!a || a.ativo !== false) {
                    tipo = 'bloqueado';
                    mensagem = aplicarVariaveisMensagemAssinatura((a && a.mensagem) || '🚨 Seu plano PedeAki está vencido. Entre em contato com o suporte para renovar e regularizar o acesso.', dados, 0);
                }
            }
        }

        if (!tipo || !mensagem) {
            banner.style.display = 'none';
            return;
        }

        banner.className = 'banner-assinatura banner-assinatura-' + tipo;
        banner.textContent = mensagem;
        banner.style.display = 'block';
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
            if (btn.dataset.tab === 'resumo') recalcularResumoGeral();
            // Ao clicar na aba de Administração, sempre reconfere se já está logado
            // no Firebase Mestre de verdade (evita pedir login de novo à toa, caso
            // algo tenha "escondido" visualmente o conteúdo sem realmente deslogar)
            if (btn.dataset.tab === 'administracao-mestre') sincronizarTelaDoMestre();
        });
    });

    // Abre na mesma aba que estava da última vez (ou "pedidos" se for a primeira vez)
    let abaSalva = localStorage.getItem('painelAbaAtiva') || 'pedidos';
    // Migração visual: abas antigas agora vivem dentro dos novos hubs.
    if (['cupons', 'fidelidade', 'mensagens'].includes(abaSalva)) abaSalva = 'clientes-marketing';
    if (abaSalva === 'visitantes') abaSalva = 'loja';
    mostrarAba(abaSalva, false);
    if (abaSalva === 'resumo') recalcularResumoGeral();
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
    const dataContratacaoNova = document.getElementById('novoClienteDataContratacaoMestre');
    if (logado && dataContratacaoNova && !dataContratacaoNova.value) dataContratacaoNova.value = hojeIsoLocal();

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
        const dataContratacaoNova = document.getElementById('novoClienteDataContratacaoMestre');
        if (dataContratacaoNova && !dataContratacaoNova.value) dataContratacaoNova.value = hojeIsoLocal();
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
    { chave: 'gestaoCompleta', nome: '📊 Gestão Completa (ingredientes, ficha técnica, estoque)' },
    { chave: 'vendedorInteligente', nome: '🧠 Vendedor Inteligente' },
    { chave: 'carrossel', nome: '🎠 Carrossel de Destaques e Campanhas' },
    { chave: 'ofertasCarrinho', nome: '🛒 Ofertas no Carrinho' },
    { chave: 'mensagemMassa', nome: '💬 Mensagem em Massa' },
    { chave: 'repetirUltimoPedido', nome: '🔁 Repetir Último Pedido' }
];

// Definição oficial dos planos PedeAki (mesma do flyer de vendas) — cada plano de cima
// inclui tudo do de baixo. Só pré-marca os interruptores na tela; ainda precisa clicar
// em "Aplicar nesse cliente" pra salvar de verdade, e dá pra ajustar manualmente antes
// de salvar (não trava em plano nenhum).
const RECURSOS_POR_PLANO = {
    start: ['areasDeEntrega', 'pedidoMinimo', 'esconderProduto', 'repetirUltimoPedido'],
    pro: ['areasDeEntrega', 'pedidoMinimo', 'esconderProduto', 'cupons', 'fidelidade', 'notificacoes', 'pagamentoOnline', 'adicionais', 'agenda', 'visitantes', 'vendedorInteligente', 'carrossel', 'ofertasCarrinho', 'mensagemMassa', 'repetirUltimoPedido'],
    premium: ['areasDeEntrega', 'pedidoMinimo', 'esconderProduto', 'cupons', 'fidelidade', 'notificacoes', 'pagamentoOnline', 'adicionais', 'agenda', 'visitantes', 'vendedorInteligente', 'carrossel', 'ofertasCarrinho', 'mensagemMassa', 'repetirUltimoPedido', 'gestaoCompleta']
};

function aplicarPlanoPadraoMestre(plano) {
    const chavesDoPlano = RECURSOS_POR_PLANO[plano] || [];
    RECURSOS_MESTRE.forEach(r => {
        const chk = document.getElementById('recursoMestre_' + r.chave);
        if (chk) chk.checked = chavesDoPlano.includes(r.chave);
    });
}

const appsClientesMestre = {}; // indice -> { app, auth, db, autenticado }
let clientesRegistroMestre = [];
let clienteMestreSelecionadoIndice = null;


const TEXTO_PADRAO_CONTRATO_PEDEAKI = `TERMO DE CONTRATAÇÃO PEDEAKI\n\nEste documento registra a contratação da plataforma PedeAki por {nomeLoja}.\n\n1. OBJETO\nDisponibilização de acesso à plataforma PedeAki conforme os recursos do plano {plano}, configurados para o estabelecimento.\n\n2. CONDIÇÃO COMERCIAL\nCondição informada nesta contratação: {valor}.\n\n3. ATIVAÇÃO\nO período do plano começa somente na data em que o PedeAki liberar o acesso operacional à plataforma. A assinatura deste termo, sozinha, não inicia a contagem do período contratado.\n\n4. USO DA PLATAFORMA\nO estabelecimento é responsável pelas informações, produtos, preços, horários, dados comerciais e demais conteúdos cadastrados em sua operação.\n\n5. RENOVAÇÃO E CONTINUIDADE\nAs condições de renovação, vencimento e eventual período de tolerância seguem o que estiver registrado na contratação vigente.\n\n6. ACEITE\nAo confirmar abaixo, o responsável declara que leu e concorda com o conteúdo desta versão do termo.\n\nIMPORTANTE: este texto é um modelo operacional editável. Revise a versão final com orientação jurídica antes de utilizá-la como contrato comercial definitivo.`;

function statusContratoMestre(contrato) {
    contrato = contrato || {};
    if (contrato.obrigatorio !== true) return { chave:'dispensado', rotulo:'🔓 Não obrigatório' };
    const ass = contrato.assinatura || {};
    if (contrato.status === 'assinado' && String(ass.versao || '') === String(contrato.versao || '1.0')) {
        return { chave:'assinado', rotulo:'✅ Assinado' };
    }
    return { chave:'aguardando', rotulo:'🟠 Aguardando assinatura' };
}

function preencherContratoMestre(contrato, assinaturaPlano) {
    contrato = contrato || {};
    assinaturaPlano = assinaturaPlano || {};
    document.getElementById('contratoObrigatorioMestre').checked = contrato.obrigatorio !== false;
    document.getElementById('contratoVersaoMestre').value = contrato.versao || '1.0';
    document.getElementById('contratoValorMestre').value = contrato.valor || '';
    document.getElementById('contratoTituloMestre').value = contrato.titulo || 'Termo de Contratação PedeAki';
    document.getElementById('contratoTextoMestre').value = contrato.texto || TEXTO_PADRAO_CONTRATO_PEDEAKI;
    atualizarResumoContratoMestre(contrato, assinaturaPlano);
}

function atualizarResumoContratoMestre(contrato, assinaturaPlano) {
    contrato = contrato || {};
    assinaturaPlano = assinaturaPlano || {};
    const chip = document.getElementById('resumoStatusContratoMestre');
    const resumo = document.getElementById('contratoAssinaturaResumoMestre');
    if (!chip || !resumo) return;
    const estado = statusContratoMestre(contrato);
    chip.className = 'contrato-status-chip contrato-status-' + estado.chave;
    chip.textContent = estado.rotulo;
    const ass = contrato.assinatura || {};
    if (estado.chave === 'assinado' && ass.nomeCompleto) {
        const data = ass.assinadoEm ? new Date(ass.assinadoEm).toLocaleString('pt-BR') : 'data registrada no Firebase';
        resumo.style.display = 'block';
        resumo.innerHTML = `<strong>✅ Assinatura registrada</strong><br>${ass.nomeCompleto}${ass.email ? ' · ' + ass.email : ''}<br>Versão ${ass.versao || contrato.versao || '1.0'} · ${data}${assinaturaPlano.dataAtivacao ? `<br><strong>Acesso ativado em:</strong> ${formatarDataIsoBr(assinaturaPlano.dataAtivacao)}` : '<br><strong>Próxima etapa:</strong> definir a data de ativação para liberar o painel operacional.'}`;
    } else {
        resumo.style.display = 'none';
        resumo.innerHTML = '';
    }
}

async function carregarContratoClienteMestre(registro) {
    try {
        const [contratoSnap, assinaturaSnap] = await Promise.all([
            registro.db.ref('configuracao/contrato').once('value'),
            registro.db.ref('configuracao/assinatura').once('value')
        ]);
        preencherContratoMestre(contratoSnap.val() || {}, assinaturaSnap.val() || {});
    } catch (err) {
        preencherContratoMestre({}, {});
        console.log('Não foi possível ler o contrato do cliente:', err.message);
    }
}

async function salvarContratoClienteMestre() {
    const msgEl = document.getElementById('msgContratoMestre');
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const cliente = clientesRegistroMestre[clienteMestreSelecionadoIndice];
    if (!registro || !registro.autenticado || !cliente) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const obrigatorio = document.getElementById('contratoObrigatorioMestre').checked;
    const versao = document.getElementById('contratoVersaoMestre').value.trim() || '1.0';
    const titulo = document.getElementById('contratoTituloMestre').value.trim() || 'Termo de Contratação PedeAki';
    const valor = document.getElementById('contratoValorMestre').value.trim() || null;
    const texto = document.getElementById('contratoTextoMestre').value.trim();
    if (obrigatorio && texto.length < 80) { msgEl.textContent = 'O texto do contrato está muito curto. Revise antes de disponibilizar.'; return; }

    msgEl.textContent = 'Salvando contrato...';
    try {
        const plano = (document.getElementById('planoAssinaturaMestre').value || (cliente.assinatura && cliente.assinatura.plano) || 'pro');
        const dados = {
            obrigatorio,
            status: obrigatorio ? 'aguardando_assinatura' : 'dispensado',
            versao,
            titulo,
            valor,
            plano,
            texto,
            assinatura: null,
            atualizadoEm: firebase.database.ServerValue.TIMESTAMP
        };
        await registro.db.ref('configuracao/contrato').update(dados);
        await registro.db.ref('configuracao/contrato/historico').push({
            evento: obrigatorio ? 'contrato_disponibilizado' : 'contrato_dispensado',
            versao,
            quando: firebase.database.ServerValue.TIMESTAMP
        });
        const resumoMestre = { obrigatorio, status: dados.status, versao, titulo, valor, plano, atualizadoEm: firebase.database.ServerValue.TIMESTAMP };
        await dbMestre.ref('clientes/' + cliente.id + '/contrato').set(resumoMestre);
        cliente.contrato = { ...resumoMestre };
        preencherContratoMestre(dados, obterAssinaturaMestreDoFormulario());
        msgEl.textContent = obrigatorio
            ? '✅ Contrato disponível. No próximo login, o cliente precisará assinar antes de prosseguir.'
            : '✅ Exigência de contrato desativada para este cliente.';
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar contrato: ' + err.message;
    }
}

async function desativarObrigatoriedadeContratoMestre() {
    const chk = document.getElementById('contratoObrigatorioMestre');
    chk.checked = false;
    await salvarContratoClienteMestre();
}

function somarMesesDataIso(dataIso, meses) {
    const d = dataIsoParaDateLocal(dataIso);
    if (!d) return '';
    const diaOriginal = d.getDate();
    const alvo = new Date(d.getFullYear(), d.getMonth() + (Number(meses) || 1), 1, 12, 0, 0, 0);
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(diaOriginal, ultimoDia));
    return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
}

function calcularEstadoAssinatura(dados) {
    dados = dados || {};
    if (!dados.dataAtivacao) {
        return dados.dataContratacao
            ? { chave: 'implantacao', rotulo: '🟠 Em implantação', dias: null }
            : { chave: 'sem-config', rotulo: 'Sem configuração', dias: null };
    }
    if (!dados.dataVencimento) return { chave: 'ativo', rotulo: '🟢 Ativo', dias: null };

    const dias = diferencaDiasDataIso(dados.dataVencimento);
    if (dias == null) return { chave: 'sem-config', rotulo: 'Data inválida', dias: null };
    const tolerancia = Math.max(0, Number(dados.diasTolerancia) || 0);
    const limites = [dados.alertas && dados.alertas.previo1, dados.alertas && dados.alertas.previo2, dados.alertas && dados.alertas.previo3]
        .filter(a => a && a.ativo !== false && Number(a.dias) > 0)
        .map(a => Number(a.dias));
    const maiorAlerta = limites.length ? Math.max(...limites) : 7;

    if (dias > maiorAlerta) return { chave: 'ativo', rotulo: `🟢 Ativo · faltam ${dias} dias`, dias };
    if (dias > 0) return { chave: 'vencendo', rotulo: `🟡 Vencendo · faltam ${dias} dias`, dias };
    if (dias === 0) return { chave: 'vence-hoje', rotulo: '🟠 Vence hoje', dias };
    const atraso = Math.abs(dias);
    if (atraso <= tolerancia) return { chave: 'tolerancia', rotulo: `🟠 Em tolerância · ${atraso} dia(s) em atraso`, dias };
    return { chave: 'vencido', rotulo: `🔴 Vencido · ${atraso} dia(s) em atraso`, dias };
}

function obterAlertasAssinaturaMestreDoFormulario() {
    return {
        previo1: {
            ativo: document.getElementById('alertaRenovacao1Ativo').checked,
            dias: Math.max(1, Number(document.getElementById('alertaRenovacao1Dias').value) || 7),
            mensagem: document.getElementById('alertaRenovacao1Mensagem').value.trim()
        },
        previo2: {
            ativo: document.getElementById('alertaRenovacao2Ativo').checked,
            dias: Math.max(1, Number(document.getElementById('alertaRenovacao2Dias').value) || 3),
            mensagem: document.getElementById('alertaRenovacao2Mensagem').value.trim()
        },
        previo3: {
            ativo: document.getElementById('alertaRenovacao3Ativo').checked,
            dias: Math.max(1, Number(document.getElementById('alertaRenovacao3Dias').value) || 1),
            mensagem: document.getElementById('alertaRenovacao3Mensagem').value.trim()
        },
        vencimento: {
            ativo: document.getElementById('alertaVencimentoAtivo').checked,
            mensagem: document.getElementById('alertaVencimentoMensagem').value.trim()
        },
        tolerancia: {
            ativo: document.getElementById('alertaToleranciaAtivo').checked,
            mensagem: document.getElementById('alertaToleranciaMensagem').value.trim()
        },
        vencido: {
            ativo: document.getElementById('alertaVencidoAtivo').checked,
            mensagem: document.getElementById('alertaVencidoMensagem').value.trim()
        }
    };
}

function obterAssinaturaMestreDoFormulario() {
    return {
        plano: document.getElementById('planoAssinaturaMestre').value || 'pro',
        dataContratacao: document.getElementById('dataContratacaoAssinaturaMestre').value || null,
        dataAtivacao: document.getElementById('dataAtivacaoAssinaturaMestre').value || null,
        dataVencimento: document.getElementById('dataVencimentoAssinaturaMestre').value || null,
        responsavelAtivacao: document.getElementById('responsavelAtivacaoAssinaturaMestre').value.trim() || null,
        observacaoInterna: document.getElementById('observacaoAssinaturaMestre').value.trim() || null,
        diasTolerancia: Math.max(0, Number(document.getElementById('diasToleranciaAssinaturaMestre').value) || 0),
        alertas: obterAlertasAssinaturaMestreDoFormulario()
    };
}

function preencherAlertasAssinaturaMestre(alertas) {
    alertas = alertas || {};
    const defs = {
        previo1: { ativo: true, dias: 7, mensagem: '🔔 Seu plano PedeAki vence em {dias} dias, em {dataVencimento}. Fale com a gente para renovar sem interrupções.' },
        previo2: { ativo: true, dias: 3, mensagem: '⚠️ Faltam {dias} dias para a renovação do seu plano PedeAki. Vencimento: {dataVencimento}.' },
        previo3: { ativo: true, dias: 1, mensagem: '⏰ Seu plano PedeAki vence amanhã ({dataVencimento}). Renove para manter o serviço funcionando normalmente.' },
        vencimento: { ativo: true, mensagem: '📅 Seu plano PedeAki vence hoje. Entre em contato para renovar e manter todos os recursos ativos.' },
        tolerancia: { ativo: true, mensagem: '⚠️ Seu plano venceu em {dataVencimento} e está no período de tolerância. Regularize a renovação para evitar interrupções.' },
        vencido: { ativo: true, mensagem: '🚨 Seu plano PedeAki está vencido. Entre em contato com o suporte para renovar e regularizar o acesso.' }
    };
    ['previo1','previo2','previo3'].forEach((chave, i) => {
        const a = { ...defs[chave], ...(alertas[chave] || {}) };
        document.getElementById(`alertaRenovacao${i+1}Ativo`).checked = a.ativo !== false;
        document.getElementById(`alertaRenovacao${i+1}Dias`).value = a.dias;
        document.getElementById(`alertaRenovacao${i+1}Mensagem`).value = a.mensagem || '';
    });
    ['vencimento','tolerancia','vencido'].forEach(chave => {
        const a = { ...defs[chave], ...(alertas[chave] || {}) };
        const prefixo = chave === 'vencimento' ? 'alertaVencimento' : chave === 'tolerancia' ? 'alertaTolerancia' : 'alertaVencido';
        document.getElementById(prefixo + 'Ativo').checked = a.ativo !== false;
        document.getElementById(prefixo + 'Mensagem').value = a.mensagem || '';
    });
}

function preencherAssinaturaMestre(dados) {
    dados = dados || {};
    document.getElementById('planoAssinaturaMestre').value = dados.plano || 'pro';
    document.getElementById('dataContratacaoAssinaturaMestre').value = dados.dataContratacao || '';
    document.getElementById('dataAtivacaoAssinaturaMestre').value = dados.dataAtivacao || '';
    document.getElementById('dataVencimentoAssinaturaMestre').value = dados.dataVencimento || '';
    document.getElementById('responsavelAtivacaoAssinaturaMestre').value = dados.responsavelAtivacao || '';
    document.getElementById('observacaoAssinaturaMestre').value = dados.observacaoInterna || '';
    document.getElementById('diasToleranciaAssinaturaMestre').value = dados.diasTolerancia != null ? dados.diasTolerancia : 3;
    preencherAlertasAssinaturaMestre(dados.alertas);
    atualizarResumoAssinaturaMestre();
}

function sugerirVencimentoAssinaturaMestre() {
    const ativacao = document.getElementById('dataAtivacaoAssinaturaMestre').value;
    const vencimento = document.getElementById('dataVencimentoAssinaturaMestre');
    if (ativacao && !vencimento.value) vencimento.value = somarMesesDataIso(ativacao, 1);
    atualizarResumoAssinaturaMestre();
}

function calcularVencimentoAssinaturaMestre() {
    const ativacao = document.getElementById('dataAtivacaoAssinaturaMestre').value;
    if (!ativacao) { alert('Informe primeiro a data de ativação.'); return; }
    document.getElementById('dataVencimentoAssinaturaMestre').value = somarMesesDataIso(ativacao, 1);
    atualizarResumoAssinaturaMestre();
}

function atualizarResumoAssinaturaMestre() {
    const chip = document.getElementById('resumoStatusAssinaturaMestre');
    if (!chip) return;
    const dados = obterAssinaturaMestreDoFormulario();
    const estado = calcularEstadoAssinatura(dados);
    chip.className = 'assinatura-status-chip assinatura-status-' + estado.chave;
    chip.textContent = estado.rotulo;
}

async function carregarAssinaturaClienteMestre(registro) {
    const cliente = clientesRegistroMestre[clienteMestreSelecionadoIndice] || {};
    try {
        const snapCliente = await registro.db.ref('configuracao/assinatura').once('value');
        const dadosCliente = snapCliente.val();
        const dados = dadosCliente && (dadosCliente.dataContratacao || dadosCliente.dataAtivacao || dadosCliente.dataVencimento || dadosCliente.plano)
            ? dadosCliente
            : (cliente.assinatura || {});
        preencherAssinaturaMestre(dados);
    } catch (err) {
        preencherAssinaturaMestre(cliente.assinatura || {});
        console.log('Não foi possível ler assinatura no cliente, usando cadastro Mestre:', err.message);
    }
}

async function salvarAssinaturaClienteMestre() {
    const msgEl = document.getElementById('msgAssinaturaMestre');
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const cliente = clientesRegistroMestre[clienteMestreSelecionadoIndice];
    if (!registro || !registro.autenticado || !cliente) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const dados = obterAssinaturaMestreDoFormulario();
    if (!dados.dataContratacao) { msgEl.textContent = 'Informe a data da contratação.'; return; }
    if (dados.dataAtivacao && !dados.dataVencimento) dados.dataVencimento = somarMesesDataIso(dados.dataAtivacao, 1);
    if (dados.dataVencimento && !dados.dataAtivacao) { msgEl.textContent = 'Informe a data de ativação antes do vencimento.'; return; }

    // Se o contrato é obrigatório, a ativação só pode ser registrada depois do aceite
    // da versão atual. Isso mantém a ordem: contrato -> assinatura -> ativação.
    if (dados.dataAtivacao) {
        try {
            const contratoSnap = await registro.db.ref('configuracao/contrato').once('value');
            const contrato = contratoSnap.val() || {};
            if (contrato.obrigatorio === true) {
                const ass = contrato.assinatura || {};
                const assinadoAtual = contrato.status === 'assinado' && String(ass.versao || '') === String(contrato.versao || '1.0');
                if (!assinadoAtual) {
                    msgEl.textContent = '⚠️ Não dá para ativar ainda: o contrato obrigatório desta versão ainda não foi assinado pelo cliente.';
                    return;
                }
            }
        } catch (e) {
            msgEl.textContent = 'Não foi possível confirmar o contrato antes da ativação. Tente novamente.';
            return;
        }
    }

    msgEl.textContent = 'Salvando...';
    try {
        const dadosCliente = { ...dados, atualizadoEm: firebase.database.ServerValue.TIMESTAMP };
        await Promise.all([
            registro.db.ref('configuracao/assinatura').set(dadosCliente),
            dbMestre.ref('clientes/' + cliente.id + '/assinatura').set(dadosCliente)
        ]);
        cliente.assinatura = dados;
        preencherAssinaturaMestre(dados);
        renderizarVisaoAssinaturasMestre();
        msgEl.textContent = '✅ Assinatura e alertas salvos. O aviso do cliente passa a ser calculado automaticamente pelas datas.';
        try {
            const contratoSnap = await registro.db.ref('configuracao/contrato').once('value');
            atualizarResumoContratoMestre(contratoSnap.val() || {}, dados);
        } catch (e) {}
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar assinatura: ' + err.message;
    }
}

function renderizarVisaoAssinaturasMestre() {
    const container = document.getElementById('visaoAssinaturasMestre');
    if (!container) return;
    if (!clientesRegistroMestre.length) { container.innerHTML = ''; return; }

    const cards = clientesRegistroMestre.map((c, i) => {
        const a = c.assinatura || {};
        const estado = calcularEstadoAssinatura(a);
        const plano = (a.plano || '—').toUpperCase();
        const venc = a.dataVencimento ? formatarDataIsoBr(a.dataVencimento) : '—';
        return `<button type="button" class="assinatura-cliente-resumo" onclick="selecionarClienteMestrePeloIndice(${i})">
            <span><strong>${c.nome}</strong><small>${plano} · Venc.: ${venc}</small></span>
            <span class="assinatura-status-mini assinatura-status-${estado.chave}">${estado.rotulo}</span>
        </button>`;
    }).join('');
    container.innerHTML = `<div class="visao-assinaturas-titulo">📌 Visão rápida das assinaturas</div>${cards}`;
}

function selecionarClienteMestrePeloIndice(indice) {
    const seletor = document.getElementById('seletorClienteMestre');
    if (!seletor || !clientesRegistroMestre[indice]) return;
    seletor.value = String(indice);
    selecionarClienteMestre();
    seletor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

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
            clientesRegistroMestre.map((c, i) => {
                const plano = c.assinatura && c.assinatura.plano ? ' · ' + String(c.assinatura.plano).toUpperCase() : '';
                return `<option value="${i}">${c.nome}${plano}</option>`;
            }).join('');
        renderizarVisaoAssinaturasMestre();
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
    RECURSOS_MESTRE.forEach(r => {
        const compatibilidadeCarrossel = r.chave === 'carrossel' && valor[r.chave] == null;
        estado[r.chave] = nuncaConfigurado || compatibilidadeCarrossel ? true : !!valor[r.chave];
    });

    document.getElementById('listaRecursosClienteMestre').innerHTML = RECURSOS_MESTRE.map(r => `
        <label class="switch-linha" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
            ${r.nome}
            <input type="checkbox" id="recursoMestre_${r.chave}" ${estado[r.chave] ? 'checked' : ''}>
        </label>
    `).join('');
    document.getElementById('areaRecursosClienteMestre').style.display = 'block';

    carregarContratoClienteMestre(registro);
    carregarAssinaturaClienteMestre(registro);
    carregarIdentidadeClienteMestre(registro);
    carregarFreteClienteMestre(registro);
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
    document.getElementById('urlCardapioLojaConfigMestre').value = config.urlCardapioLoja || '';
    document.getElementById('corPrimariaLojaConfigMestre').value = config.corPrimariaLoja || '#a0522d';
    document.getElementById('corAccentLojaConfigMestre').value = config.corAccentLoja || '#c9974c';
    montarLinhasHorarioMestre(config.horarios);

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
        urlCardapioLoja: document.getElementById('urlCardapioLojaConfigMestre').value.trim() || null,
        corPrimariaLoja: document.getElementById('corPrimariaLojaConfigMestre').value || null,
        corAccentLoja: document.getElementById('corAccentLojaConfigMestre').value || null
    };
    // Essa URL alimenta o retorno do pagamento (redirect_url) — um erro de digitação
    // aqui só apareceria pro cliente na hora de pagar, então vale travar antes.
    if (dados.urlCardapioLoja && !/^https?:\/\/.+/.test(dados.urlCardapioLoja)) {
        msgEl.textContent = 'A URL do Cardápio precisa começar com http:// ou https://';
        return;
    }
    msgEl.textContent = 'Salvando...';
    try {
        await registro.db.ref('configuracao/loja').update(dados);
        msgEl.textContent = 'Salvo com sucesso!';
    } catch (err) {
        msgEl.textContent = 'Erro ao salvar: ' + err.message;
    }
}

// Horário remoto — mesma estrutura de dados e mesmos nomes de dia já usados no
// editor normal (horariosPadraoAdmin/diasSemana), só com sufixo "Mestre" nos IDs
// pra não colidir com os campos do painel normal do cliente.
function montarLinhasHorarioMestre(horarios) {
    const container = document.getElementById('listaHorariosMestre');
    if (!container) return;
    container.innerHTML = '';
    diasSemana.forEach((nomeDia, i) => {
        const dia = (horarios && horarios[i]) || horariosPadraoAdmin[i];
        const linha = document.createElement('div');
        linha.classList.add('linha-horario');
        linha.innerHTML = `
            <label class="dia-checkbox">
                <input type="checkbox" id="diaAbertoMestre${i}" ${dia.aberto ? 'checked' : ''}> ${nomeDia}
            </label>
            <input type="time" id="diaAbreMestre${i}" value="${dia.abre}">
            <span>até</span>
            <input type="time" id="diaFechaMestre${i}" value="${dia.fecha}">
        `;
        container.appendChild(linha);
    });
}

function salvarHorariosMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgHorariosMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const horarios = diasSemana.map((_, i) => ({
        aberto: document.getElementById('diaAbertoMestre' + i).checked,
        abre: document.getElementById('diaAbreMestre' + i).value || '08:00',
        fecha: document.getElementById('diaFechaMestre' + i).value || '18:00'
    }));
    msgEl.textContent = 'Salvando...';
    registro.db.ref('configuracao/loja/horarios').set(horarios)
        .then(() => { msgEl.textContent = 'Horários salvos!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Frete remoto — lê e grava exatamente o mesmo nó configuracao/frete usado pela aba Loja
// do cliente. Nenhuma regra de cálculo é duplicada aqui; o Mestre apenas edita os dados.
let configFreteMestreAtual = {};

async function carregarFreteClienteMestre(registro) {
    if (!registro || !registro.autenticado) return;
    try {
        const snap = await registro.db.ref('configuracao/frete').once('value');
        configFreteMestreAtual = snap.val() || {};

        const campoNormal = document.getElementById('valorPorKmMestre');
        const campoEncomenda = document.getElementById('valorPorKmEncomendaMestre');
        if (campoNormal) campoNormal.value = configFreteMestreAtual.valorPorKm != null ? configFreteMestreAtual.valorPorKm : '';
        if (campoEncomenda) campoEncomenda.value = configFreteMestreAtual.valorPorKmEncomenda != null ? configFreteMestreAtual.valorPorKmEncomenda : '';

        renderizarListaBairrosMestre();
    } catch (err) {
        console.log('Erro ao carregar frete do cliente no Mestre:', err.message);
        configFreteMestreAtual = {};
        renderizarListaBairrosMestre();
    }
}

function salvarValoresFreteMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgValoresFreteMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const valor = parseFloat(String(document.getElementById('valorPorKmMestre').value).replace(',', '.'));
    const valorEncomenda = parseFloat(String(document.getElementById('valorPorKmEncomendaMestre').value).replace(',', '.'));
    if (isNaN(valor) || valor < 0) { msgEl.textContent = 'Digita um valor válido pro km normal.'; return; }
    if (isNaN(valorEncomenda) || valorEncomenda < 0) { msgEl.textContent = 'Digita um valor válido pro km de encomenda.'; return; }

    msgEl.textContent = 'Salvando...';
    registro.db.ref('configuracao/frete').update({ valorPorKm: valor, valorPorKmEncomenda: valorEncomenda })
        .then(() => {
            configFreteMestreAtual.valorPorKm = valor;
            configFreteMestreAtual.valorPorKmEncomenda = valorEncomenda;
            msgEl.textContent = 'Valores salvos!';
        })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function salvarBairroMestre() {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    const msgEl = document.getElementById('msgBairroMestre');
    if (!registro || !registro.autenticado) { msgEl.textContent = 'Faz login nesse cliente primeiro.'; return; }

    const nome = document.getElementById('novoBairroNomeMestre').value.trim().toLowerCase();
    const km = parseFloat(String(document.getElementById('novoBairroKmMestre').value).replace(',', '.'));
    if (!nome) { msgEl.textContent = 'Digita o nome do bairro.'; return; }
    if (isNaN(km) || km < 0) { msgEl.textContent = 'Digita uma distância válida (em km).'; return; }

    const nomeCodificado = encodeURIComponent(nome);
    registro.db.ref('configuracao/frete/bairros/' + nomeCodificado).set(km)
        .then(() => {
            if (!configFreteMestreAtual.bairros) configFreteMestreAtual.bairros = {};
            configFreteMestreAtual.bairros[nomeCodificado] = km;
            document.getElementById('novoBairroNomeMestre').value = '';
            document.getElementById('novoBairroKmMestre').value = '';
            msgEl.textContent = 'Bairro salvo!';
            renderizarListaBairrosMestre();
        })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function removerBairroMestre(nomeCodificado) {
    const registro = appsClientesMestre[nomeAppClienteMestre(clienteMestreSelecionadoIndice)];
    if (!registro || !registro.autenticado) return;
    if (!confirm('Remover esse bairro da lista de entrega desse cliente?')) return;

    registro.db.ref('configuracao/frete/bairros/' + nomeCodificado).remove()
        .then(() => {
            if (configFreteMestreAtual.bairros) delete configFreteMestreAtual.bairros[nomeCodificado];
            renderizarListaBairrosMestre();
        })
        .catch(err => alert('Erro ao remover: ' + err.message));
}

// Formata SOMENTE a exibição do nome do bairro no painel.
// A chave/valor salvo no Firebase continua exatamente como já está.
function formatarNomeBairroExibicao(nome) {
    const conectivos = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
    return String(nome || '')
        .trim()
        .split(/\s+/)
        .map((parte, indice) => {
            const minusculo = parte.toLocaleLowerCase('pt-BR');
            if (indice > 0 && conectivos.has(minusculo)) return minusculo;
            return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
        })
        .join(' ');
}

function renderizarListaBairrosMestre() {
    const container = document.getElementById('listaBairrosMestre');
    if (!container) return;

    const campoBusca = document.getElementById('buscaBairroMestre');
    const busca = normalizarTexto(campoBusca ? campoBusca.value : '');
    const bairros = configFreteMestreAtual.bairros || {};
    const entradas = Object.entries(bairros)
        .map(([nomeCodificado, km]) => ({ nomeCodificado, nome: decodeURIComponent(nomeCodificado), km }))
        .filter(b => normalizarTexto(b.nome).includes(busca))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (entradas.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhum bairro encontrado.</p>';
        return;
    }

    container.innerHTML = entradas.map((b, i) => `
        <div class="loja-status-card" style="margin-bottom:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span>${formatarNomeBairroExibicao(b.nome)} <span class="dica-secao">(${b.km} km)</span></span>
            <button class="btn-secondary btn-remover-bairro-mestre" data-indice="${i}">Remover</button>
        </div>
    `).join('');

    container.querySelectorAll('.btn-remover-bairro-mestre').forEach(btn => {
        const item = entradas[Number(btn.dataset.indice)];
        if (item) btn.addEventListener('click', () => removerBairroMestre(item.nomeCodificado));
    });
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
    const plano = document.getElementById('novoClientePlanoMestre').value || 'pro';
    const dataContratacao = document.getElementById('novoClienteDataContratacaoMestre').value || null;
    const msgEl = document.getElementById('msgAdicionarClienteMestre');
    if (!nome) { msgEl.textContent = 'Digita o nome do cliente.'; return; }

    let firebaseConfig;
    try {
        firebaseConfig = JSON.parse(configTexto);
    } catch (err) {
        msgEl.textContent = 'O firebaseConfig colado não é um JSON válido — confere se copiou certinho.';
        return;
    }

    const assinatura = {
        plano,
        dataContratacao,
        dataAtivacao: null,
        dataVencimento: null,
        diasTolerancia: 3
    };

    dbMestre.ref('clientes').push({ nome, firebaseConfig, assinatura })
        .then(() => {
            msgEl.textContent = 'Cliente adicionado! Agora selecione o cliente para concluir ativação e vencimento.';
            document.getElementById('novoClienteNomeMestre').value = '';
            document.getElementById('novoClienteConfigMestre').value = '';
            document.getElementById('novoClienteDataContratacaoMestre').value = '';
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

let painelOperacionalIniciado = false;
let contratoGateAtual = null;

function esconderTelasAcessoPedeAki() {
    const login = document.getElementById('telaLogin');
    const contrato = document.getElementById('telaContratoPedeAki');
    const painelEl = document.getElementById('painel');
    if (login) login.style.display = 'none';
    if (contrato) contrato.style.display = 'none';
    if (painelEl) painelEl.style.display = 'none';
}


function mostrarBoasVindasPedeAki(user) {
    const tela = document.getElementById('boasVindasPedeAki');
    if (!tela || !user) return;
    const chave = 'pedeaki_boas_vindas_' + String(user.uid || user.email || 'usuario');
    try {
        if (localStorage.getItem(chave) === '1') return;
        localStorage.setItem(chave, '1');
    } catch (e) {}
    tela.style.display = 'flex';
    tela.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => requestAnimationFrame(() => tela.classList.add('ativa')));
}

function fecharBoasVindasPedeAki() {
    const tela = document.getElementById('boasVindasPedeAki');
    if (!tela) return;
    tela.classList.remove('ativa');
    tela.setAttribute('aria-hidden', 'true');
    setTimeout(() => { tela.style.display = 'none'; }, 280);
}

function liberarPainelOperacionalPedeAki(user) {
    esconderTelasAcessoPedeAki();
    document.getElementById('painel').style.display = 'block';
    if (!painelOperacionalIniciado) {
        iniciarEscutaPedidos();
        painelOperacionalIniciado = true;
    }
    verificarSeEhDonoDoServico(user && user.email);
    setTimeout(() => mostrarBoasVindasPedeAki(user), 320);
}

function aplicarVariaveisContratoPedeAki(texto, contrato, assinatura) {
    const nomeLoja = (typeof LOJA_CONFIG !== 'undefined' && LOJA_CONFIG.nome) ? LOJA_CONFIG.nome : 'sua empresa';
    const plano = (contrato && contrato.plano) || (assinatura && assinatura.plano) || 'PedeAki';
    const valor = (contrato && contrato.valor) || 'conforme contratação';
    return String(texto || '')
        .replaceAll('{nomeLoja}', nomeLoja)
        .replaceAll('{plano}', String(plano).toUpperCase())
        .replaceAll('{valor}', valor);
}

async function hashTextoContratoPedeAki(texto) {
    try {
        if (!window.crypto || !crypto.subtle) return null;
        const bytes = new TextEncoder().encode(String(texto || ''));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
}

function preencherTelaContratoPedeAki(contrato, assinaturaPlano, user) {
    contratoGateAtual = { contrato: contrato || {}, assinaturaPlano: assinaturaPlano || {} };
    const titulo = document.getElementById('contratoGateTitulo');
    const meta = document.getElementById('contratoGateMeta');
    const texto = document.getElementById('contratoGateTexto');
    const nome = document.getElementById('contratoGateNome');
    const versao = contrato.versao || '1.0';
    const plano = contrato.plano || assinaturaPlano.plano || '—';
    const valor = contrato.valor || '';
    if (titulo) titulo.textContent = contrato.titulo || 'Termo de Contratação PedeAki';
    if (meta) meta.innerHTML = `<span class="meta-chip">Versão ${versao}</span><span class="meta-chip">Plano ${String(plano).toUpperCase()}</span>${valor ? `<span class="meta-chip">${valor}</span>` : ''}`;
    if (texto) texto.textContent = aplicarVariaveisContratoPedeAki(contrato.texto || '', contrato, assinaturaPlano);
    if (nome && !nome.value && user && user.displayName) nome.value = user.displayName;
}

function mostrarGateContratoPedeAki(tipo, contrato, assinaturaPlano, user, erroTexto) {
    esconderTelasAcessoPedeAki();
    const tela = document.getElementById('telaContratoPedeAki');
    if (tela) tela.style.display = 'flex';
    const assinaturaEl = document.getElementById('contratoGateAssinatura');
    const aguardandoEl = document.getElementById('contratoGateAguardandoAtivacao');
    const erroEl = document.getElementById('contratoGateErro');
    if (assinaturaEl) assinaturaEl.style.display = tipo === 'assinatura' ? 'block' : 'none';
    if (aguardandoEl) aguardandoEl.style.display = tipo === 'aguardando' ? 'block' : 'none';
    if (erroEl) erroEl.style.display = tipo === 'erro' ? 'block' : 'none';
    if (tipo === 'assinatura') preencherTelaContratoPedeAki(contrato || {}, assinaturaPlano || {}, user);
    if (tipo === 'erro' && erroTexto) document.getElementById('contratoGateErroTexto').textContent = erroTexto;
}

async function verificarContratoAntesDeLiberarPainel(user) {
    if (!user) return;

    // O dono da plataforma precisa continuar conseguindo abrir o painel e a aba Mestre
    // mesmo quando o cliente está aguardando contrato ou ativação. O acesso ao Mestre
    // continua protegido pelo login separado do Firebase Mestre.
    if ((user.email || '').toLowerCase() === EMAIL_DONO_SERVICO.toLowerCase()) {
        liberarPainelOperacionalPedeAki(user);
        return;
    }

    esconderTelasAcessoPedeAki();
    try {
        const [contratoSnap, assinaturaSnap] = await Promise.all([
            db.ref('configuracao/contrato').once('value'),
            db.ref('configuracao/assinatura').once('value')
        ]);
        const contrato = contratoSnap.val() || {};
        const assinaturaPlano = assinaturaSnap.val() || {};

        // Compatibilidade: clientes antigos ou contrato não obrigatório entram normalmente.
        if (contrato.obrigatorio !== true) {
            liberarPainelOperacionalPedeAki(user);
            return;
        }

        const assinaturaContrato = contrato.assinatura || {};
        const versaoAtual = String(contrato.versao || '1.0');
        const assinaturaValida = contrato.status === 'assinado' && String(assinaturaContrato.versao || '') === versaoAtual;

        if (!assinaturaValida) {
            mostrarGateContratoPedeAki('assinatura', contrato, assinaturaPlano, user);
            return;
        }

        // Contrato assinado, mas o período ainda não começou: aguarda liberação manual do PedeAki.
        if (!assinaturaPlano.dataAtivacao) {
            mostrarGateContratoPedeAki('aguardando', contrato, assinaturaPlano, user);
            return;
        }

        liberarPainelOperacionalPedeAki(user);
    } catch (err) {
        console.log('Não foi possível verificar contrato/acesso:', err);
        mostrarGateContratoPedeAki('erro', null, null, user, 'Não foi possível confirmar o contrato e a ativação agora. Verifique sua conexão e tente novamente.');
    }
}

async function assinarContratoPedeAki() {
    const user = firebase.auth().currentUser;
    const nome = (document.getElementById('contratoGateNome').value || '').trim();
    const aceitou = document.getElementById('contratoGateAceite').checked;
    const msgEl = document.getElementById('contratoGateMsg');
    const btn = document.getElementById('btnAssinarContratoPedeAki');
    if (!user) { msgEl.textContent = 'Sua sessão expirou. Entre novamente.'; return; }
    if (nome.length < 5) { msgEl.textContent = 'Informe o nome completo de quem está aceitando.'; return; }
    if (!aceitou) { msgEl.textContent = 'Marque que leu e concorda com os termos.'; return; }
    if (!contratoGateAtual || !contratoGateAtual.contrato) { msgEl.textContent = 'Contrato não carregado. Atualize a página e tente de novo.'; return; }

    const contrato = contratoGateAtual.contrato;
    const textoExibido = aplicarVariaveisContratoPedeAki(contrato.texto || '', contrato, contratoGateAtual.assinaturaPlano || {});
    const hashTexto = await hashTextoContratoPedeAki(textoExibido);
    btn.disabled = true;
    msgEl.textContent = 'Registrando assinatura...';
    try {
        const assinatura = {
            nomeCompleto: nome,
            email: user.email || null,
            uid: user.uid,
            versao: String(contrato.versao || '1.0'),
            hashTexto: hashTexto,
            userAgent: String(navigator.userAgent || '').slice(0, 300),
            aceitou: true,
            assinadoEm: firebase.database.ServerValue.TIMESTAMP
        };
        await db.ref('configuracao/contrato').update({
            status: 'assinado',
            assinatura,
            atualizadoEm: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref('configuracao/contrato/historico').push({
            evento: 'contrato_assinado',
            nomeCompleto: nome,
            email: user.email || null,
            uid: user.uid,
            versao: assinatura.versao,
            hashTexto: hashTexto,
            quando: firebase.database.ServerValue.TIMESTAMP
        });
        msgEl.textContent = '✅ Contrato assinado.';
        await verificarContratoAntesDeLiberarPainel(user);
    } catch (err) {
        console.log('Erro ao assinar contrato:', err);
        msgEl.textContent = 'Não foi possível registrar a assinatura: ' + err.message;
    } finally {
        btn.disabled = false;
    }
}

auth.onAuthStateChanged(user => {
    if (user) {
        verificarContratoAntesDeLiberarPainel(user);
    } else {
        document.getElementById('telaLogin').style.display = 'flex';
        document.getElementById('painel').style.display = 'none';
        const telaContrato = document.getElementById('telaContratoPedeAki');
        if (telaContrato) telaContrato.style.display = 'none';
        idsRenderizados = new Set();
        primeiraCargaConcluida = false;
        painelOperacionalIniciado = false;
        contratoGateAtual = null;
    }
});

// ---------- SOM DE ALERTA ----------

// O navegador só libera som depois de uma interação real do usuário com a página
// (é uma regra de segurança de todos os navegadores modernos, não um bug). Por isso,
// criamos o "contexto de áudio" uma vez só, e destravamos ele no primeiro clique.
let audioCtxGlobal = null;
let configAlertaSonoro = 'classico';

function inicializarAudioContext() {
    if (!audioCtxGlobal) {
        try {
            audioCtxGlobal = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('AudioContext indisponível:', e);
            return;
        }
    }
    // Navegadores mais rigorosos suspendem o áudio de novo depois de um tempo sem uso —
    // sem isso, o som parava de funcionar depois do primeiro clique do dia. Como isso
    // roda dentro de um clique de verdade (evento 'click' da página), o navegador libera.
    if (audioCtxGlobal.state === 'suspended') audioCtxGlobal.resume().catch(() => null);
}
document.addEventListener('click', inicializarAudioContext);

// Botão explícito pra destravar o som no aparelho — o navegador só libera áudio depois
// de um clique de verdade da pessoa; isso já acontecia sozinho no primeiro clique em
// qualquer lugar da tela, mas esse botão dá uma confirmação visível de que funcionou.
function ativarAlertasPainel() {
    const status = document.getElementById('statusAlertasPainel');
    inicializarAudioContext();
    const prosseguir = () => {
        tocarAlerta();
        if (status) status.textContent = audioCtxGlobal ? '✅ Alertas ativados nesse aparelho!' : '⚠️ Não foi possível ativar (navegador bloqueou).';
    };
    if (audioCtxGlobal && audioCtxGlobal.state === 'suspended') {
        audioCtxGlobal.resume().then(prosseguir).catch(prosseguir);
    } else {
        prosseguir();
    }
}

// Cada som é uma sequência de notas (frequência, atraso em ms, e duração em segundos)
const PRESETS_SOM_ALERTA = {
    classico: [{ freq: 880, atraso: 0, duracao: 0.45 }, { freq: 1046, atraso: 260, duracao: 0.45 }],
    suave: [{ freq: 523, atraso: 0, duracao: 0.6 }, { freq: 659, atraso: 350, duracao: 0.6 }],
    urgente: [{ freq: 988, atraso: 0, duracao: 0.18 }, { freq: 988, atraso: 200, duracao: 0.18 }, { freq: 988, atraso: 400, duracao: 0.18 }],
    sino: [{ freq: 1318, atraso: 0, duracao: 0.9 }]
};

// Aviso flutuante de "sinal/restante confirmado" — mesma informação que o alert()
// antigo mostrava, mas sem travar o navegador. alert() é bloqueante: pausa até o
// código que faz o pedido aparecer na tela, então o pedido só "terminava de aparecer"
// depois de clicar OK. Esse aviso não trava nada, e só fecha quando clicar em OK.
function mostrarAvisoFlutuantePagamento(texto) {
    let container = document.getElementById('avisosFlutuantesPagamento');
    if (!container) {
        container = document.createElement('div');
        container.id = 'avisosFlutuantesPagamento';
        // Centralizado na frente do painel, mas sem criar modal/bloqueio. Assim o aviso
        // continua visível e o restante do sistema (inclusive impressão) segue funcionando.
        container.style.cssText = 'position:fixed; top:22px; left:50%; transform:translateX(-50%); z-index:2147483000; display:flex; flex-direction:column; gap:12px; width:min(480px, calc(100vw - 28px)); pointer-events:none;';
        document.body.appendChild(container);
    }
    const aviso = document.createElement('div');
    aviso.style.cssText = 'background:#fff; color:#222; padding:18px 20px; border-radius:14px; border:2px solid var(--primary, #a0522d); box-shadow:0 12px 34px rgba(0,0,0,0.28); font-size:1em; line-height:1.45; animation:avisoFlutuanteEntrada 0.22s ease-out; pointer-events:auto;';
    aviso.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
            <span style="font-size:1.65em; line-height:1;">💰</span>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:800; font-size:1.08em; margin-bottom:4px;">Pagamento confirmado</div>
                <div>${texto.replace(/^💰\s*/, '')}</div>
            </div>
        </div>
        <button class="btn-secondary" style="margin-top:14px; width:100%; min-height:42px; font-weight:700;">OK</button>
    `;
    // Não some sozinho — fica bem visível no centro até você clicar em OK.
    // Diferente de alert(), não pausa o JavaScript nem atrasa a aparição/impressão do pedido.
    aviso.querySelector('button').onclick = () => aviso.remove();
    container.appendChild(aviso);
}
if (!document.getElementById('estiloAvisoFlutuantePagamento')) {
    const estilo = document.createElement('style');
    estilo.id = 'estiloAvisoFlutuantePagamento';
    estilo.textContent = '@keyframes avisoFlutuanteEntrada { from { opacity:0; transform:translateY(-14px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }';
    document.head.appendChild(estilo);
}

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

// Formata o campo de troco de forma legível — trata tanto valores numéricos digitados
// ("50", "R$ 50") quanto frases de "não precisa" (do checkbox novo, ou de texto livre
// que alguém digitou antes dele existir), sem misturar os dois formatos
// Deixa a forma de pagamento editável com um clique — útil quando o cliente combina
// uma coisa no pedido mas paga de outro jeito na hora (ex: marcou Cartão mas pagou
// no Pix direto, por fora do sistema)
// Marca/desmarca "pago" manualmente — pra quando o pagamento aconteceu fora do
// fluxo normal (ex: cliente marcou uma forma no pedido mas pagou Pix direto na
// conta, por fora) e a loja quer um jeito simples de anotar "já recebi isso"
function alternarPagamentoConfirmadoManual(id, novoValor) {
    db.ref('pedidos/' + id + '/pagamentoConfirmadoManual').set(novoValor)
        .catch(err => alert('Erro ao atualizar: ' + err.message));
}

// PASSO 18B — confirma no servidor o recebimento presencial do restante.
// O cliente não precisa escolher "Dinheiro" no site: no dia agendado, se o sinal já
// está pago e o restante ainda não foi quitado online, a loja confirma o recebimento aqui.
// A Cloud Function exige usuário autenticado no painel e reconfere todo o estado do pedido.
async function confirmarRecebimentoRestanteDinheiro(id, botao, checkoutOnlineEmAndamento = false) {
    if (!id) return;

    const mensagemConfirmacao = checkoutOnlineEmAndamento
        ? '⚠️ O cliente chegou a abrir um pagamento online do restante, mas ele ainda não foi confirmado.\n\nConfirme em dinheiro SOMENTE se você realmente recebeu o valor presencialmente e tem certeza de que o cliente não concluiu o checkout online.\n\nConfirmar o recebimento do restante agora?'
        : 'Confirmar que o restante deste pedido foi recebido em dinheiro?';

    if (!confirm(mensagemConfirmacao)) return;

    const textoOriginal = botao ? botao.textContent : '';
    if (botao) {
        botao.disabled = true;
        botao.textContent = 'Confirmando recebimento...';
    }

    try {
        const confirmarRecebimento = firebase.functions().httpsCallable('confirmarRecebimentoRestanteDinheiro');
        const resultado = await confirmarRecebimento({ pedidoId: id });
        const valor = Number(resultado && resultado.data && resultado.data.valorRestante);

        if (botao) {
            botao.textContent = Number.isFinite(valor)
                ? `✅ Restante ${formatarPreco(valor)} recebido`
                : '✅ Restante recebido';
        }

        // O listener em tempo real redesenha o card como "Pagamento completo".
        // O alerta existe só como confirmação imediata para quem está operando o caixa.
        alert('✅ Recebimento confirmado. O pagamento da encomenda agora está completo.');
    } catch (err) {
        console.log('Não foi possível confirmar o recebimento do restante:', err);
        const mensagem = err && err.message
            ? err.message.replace(/^.*?:\s*/, '')
            : 'Tente novamente em instantes.';
        alert('Não foi possível confirmar o recebimento do restante. ' + mensagem);
        if (botao) {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        }
    }
}

function editarFormaPagamentoPedido(id, elemento) {
    const opcoes = ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Pix', 'Transferência Bancária', 'Outros'];
    const select = document.createElement('select');
    select.className = 'select-edicao-rapida';
    opcoes.forEach(op => {
        const option = document.createElement('option');
        option.value = op;
        option.textContent = op;
        select.appendChild(option);
    });

    db.ref('pedidos/' + id + '/formaPagamento').once('value').then(snap => {
        const valorAtual = snap.val() || '';
        [...select.options].forEach(opt => { opt.selected = (opt.value === valorAtual); });
    });

    select.onchange = () => {
        db.ref('pedidos/' + id + '/formaPagamento').set(select.value)
            .catch(err => alert('Erro ao atualizar: ' + err.message));
    };
    select.onblur = () => { if (select.parentNode) select.parentNode.replaceChild(elemento, select); };

    elemento.parentNode.replaceChild(select, elemento);
    select.focus();
}

function formatarTrocoLabel(troco, total) {
    if (!troco) return '';
    const normalizado = String(troco).trim().toLowerCase();
    const semTroco = ['sem troco', 'não preciso', 'nao preciso', 'não precisa', 'nao precisa', 'não', 'nao'].includes(normalizado);
    if (semTroco) return 'Sem troco';

    // Só calcula quando o texto digitado for CLARAMENTE um valor único (ex: "50",
    // "R$ 50,00", "50.00") — se tiver qualquer coisa além de número/R$/vírgula/ponto
    // (tipo "uma nota de 100 e outra de 20"), não arrisca interpretar errado, só
    // mostra o texto original.
    const match = String(troco).trim().match(/^R?\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)$/i);
    if (total != null && match) {
        const valorDigitado = parseFloat(match[1].replace(',', '.'));
        if (Number.isFinite(valorDigitado) && valorDigitado > total) {
            const devolver = arred(valorDigitado - total);
            return `Troco para ${troco} (devolver ${formatarPreco(devolver)})`;
        }
    }
    return `Troco para ${troco}`;
}

function formatarHora(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Monta um "ticket" simples e limpo de um pedido, pronto pra imprimir (ex: pra levar pra cozinha)
function montarHtmlTicketImpressao(pedido, numeroPedido) {
    const tipoLabel = pedido.tipoEntrega === 'entrega' ? '🛵 Delivery' : '🏠 Retirada no local';
    const enderecoLinha = pedido.tipoEntrega === 'entrega'
        ? `<p><strong>Endereço:</strong> ${escaparHtmlSeguro(formatarEnderecoResumo(pedido.endereco))}</p>`
        : '';
    const numeroHtml = numeroPedido
        ? `<p class="ticket-numero">🛒 Pedido #${escaparHtmlSeguro(String(numeroPedido).padStart(3, '0'))}</p>`
        : '';
    const itensHtml = (pedido.itens || []).map(item => `
        <div class="ticket-item">
            <strong>${escaparHtmlSeguro(item.quantidade)}x ${escaparHtmlSeguro(item.nome)}</strong>
            ${item.observacao ? `<div class="ticket-obs">↳ ${escaparHtmlSeguro(item.observacao)}</div>` : ''}
            ${item.adicionaisTexto ? `<div class="ticket-obs">↳ ${escaparHtmlSeguro(item.adicionaisTexto)}</div>` : ''}
        </div>
    `).join('');

    return `
        <div class="ticket-cabecalho">
            <h2>${escaparHtmlSeguro(LOJA_CONFIG.nome)}</h2>
            ${numeroHtml}
            <p>${escaparHtmlSeguro(formatarHora(pedido.timestamp) || 'Não informado')}</p>
        </div>
        <hr>
        <p><strong>Cliente:</strong> ${escaparHtmlSeguro(pedido.nome || 'Não informado')}</p>
        <p><strong>Telefone:</strong> ${escaparHtmlSeguro(pedido.telefone || 'Não informado')}</p>
        <p><strong>${tipoLabel}</strong></p>
        ${enderecoLinha}
        <hr>
        <h3>Itens do pedido</h3>
        ${itensHtml}
        <hr>
        <p><strong>Forma de pagamento:</strong> ${escaparHtmlSeguro(pedido.formaPagamento || 'Não informado')}</p>
        ${pedido.troco ? `<p><strong>${escaparHtmlSeguro(formatarTrocoLabel(pedido.troco, totalDoPedido(pedido)))}</strong></p>` : ''}
        ${pedido.observacoes ? `<p><strong>Observações:</strong> ${escaparHtmlSeguro(pedido.observacoes)}</p>` : ''}
        ${pedido.recompensaResgatada ? `<p><strong>🎁 RESGATE DO CLUBE:</strong> ${escaparHtmlSeguro(pedido.recompensaResgatada.descricao)}</p>` : ''}
        ${pedido.dataEncomenda ? `<p><strong>📅 ENCOMENDA:</strong> ${escaparHtmlSeguro(pedido.dataEncomenda.split('-').reverse().join('/'))}${pedido.horaEncomenda ? ` às ${escaparHtmlSeguro(pedido.horaEncomenda)}` : ''}</p>` : ''}
        ${pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal' ? `<p><strong>💰 SINAL:</strong> ${escaparHtmlSeguro(pedido.pagamento.percentualSinal)}% do produto pago (${formatarPreco(pedido.pagamento.valorSinal)}) — falta ${formatarPreco(totalDoPedido(pedido) - pedido.pagamento.valorSinal)} na entrega${pedido.pagamento.freteInformado > 0 ? ` (esse valor já inclui o frete de ${formatarPreco(pedido.pagamento.freteInformado)})` : ''}</p>` : ''}
        <p class="ticket-total"><strong>Total: ${formatarPreco(totalDoPedido(pedido))}</strong></p>
        <div class="ticket-espaco-final" aria-hidden="true"></div>
        <hr class="ticket-linha-final">
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
    // Se foi marcado como pago manualmente (ex: cliente pagou Pix por fora, ou
    // trocou a forma de pagamento), isso sobrepõe o status real do pagamento
    // online — sem isso, o pedido continuava mostrando "aguardando" pra sempre,
    // mesmo depois de você confirmar manualmente que o dinheiro já entrou
    if (pedido.pagamentoConfirmadoManual) {
        return '<span class="pedido-tag tag-pagamento-pago">🟢 Pago (confirmado manualmente)</span>';
    }
    const ehSinal = p.tipoPagamento === 'sinal';
    const restantePago = ehSinal && pedido.pagamentoRestante && pedido.pagamentoRestante.status === 'pago';
    const restanteDinheiroPendente = ehSinal && pedido.pagamentoRestante &&
        pedido.pagamentoRestante.status === 'aguardando_recebimento' &&
        pedido.pagamentoRestante.forma === 'Dinheiro';

    // Quando o sinal e o restante já foram pagos, o pedido está financeiramente quitado.
    // Essa é apenas uma leitura dos dados já confirmados; não altera pagamento nenhum.
    if (restantePago) {
        const valorSinal = Number(p.valorSinal || 0);
        const valorRestante = Number(pedido.pagamentoRestante.valorRestante || 0);
        let html = `<span class="pedido-tag tag-pagamento-pago">🟢 Pagamento completo</span>`;
        html += ` <span class="pedido-tag">Sinal ${formatarPreco(valorSinal)}</span>`;
        html += ` <span class="pedido-tag">Restante ${formatarPreco(valorRestante)}</span>`;
        if (p.receiptUrl) {
            html += ` <a href="${p.receiptUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🧾 Sinal</a>`;
        }
        if (pedido.pagamentoRestante.receiptUrl) {
            html += ` <a href="${pedido.pagamentoRestante.receiptUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🧾 Restante</a>`;
        }
        const pagamentoOnlinePosterior = pedido.pagamentoRestante.pagamentoOnlinePosterior;
        if (pagamentoOnlinePosterior && pagamentoOnlinePosterior.status) {
            html += ` <span class="pedido-tag tag-pagamento-divergente">⚠️ Pagamento online posterior detectado — confira possível duplicidade</span>`;
            if (pagamentoOnlinePosterior.receiptUrl) {
                html += ` <a href="${pagamentoOnlinePosterior.receiptUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🧾 Pagamento online posterior</a>`;
            }
        }
        return html;
    }

    const totalPedido = totalDoPedido(pedido);
    const valorRestanteNumerico = ehSinal && p.valorSinal != null
        ? Math.max(0, Number(totalPedido || 0) - Number(p.valorSinal || 0))
        : null;
    const restante = valorRestanteNumerico != null ? formatarPreco(valorRestanteNumerico) : null;

    // Restante em dinheiro é apenas uma forma escolhida para receber depois; não significa pago.
    // Mantemos visualmente separado do sinal para não confundir a operação da loja.
    if (restanteDinheiroPendente) {
        const valorRestante = Number(pedido.pagamentoRestante.valorRestante || valorRestanteNumerico || 0);
        let html = `<span class="pedido-tag tag-pagamento-pago">🟢 Sinal pago ${formatarPreco(p.valorSinal)}</span>`;
        html += ` <span class="pedido-tag tag-pagamento-aguardando">💵 Restante ${formatarPreco(valorRestante)} em dinheiro • aguardando recebimento</span>`;
        if (p.receiptUrl) {
            html += ` <a href="${p.receiptUrl}" target="_blank" rel="noopener noreferrer" class="link-comprovante">🧾 Comprovante do sinal</a>`;
        }
        return html;
    }

    const tags = {
        aguardando: ehSinal
            ? `<span class="pedido-tag tag-pagamento-aguardando">🟡 Aguardando sinal ${formatarPreco(p.valorSinal)}</span>`
            : '<span class="pedido-tag tag-pagamento-aguardando">🟡 Aguardando pagamento</span>',
        pago: ehSinal
            ? `<span class="pedido-tag tag-pagamento-pago">🟢 Sinal pago ${formatarPreco(p.valorSinal)}</span> <span class="pedido-tag tag-pagamento-aguardando">🟡 Falta ${restante}</span>`
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

// Urgência visual por tempo — apenas leitura/visual. Não grava nada no Firebase.
// Os limites ficam centralizados aqui para podermos ajustar depois sem mexer no fluxo dos pedidos.
const URGENCIA_PEDIDOS = {
    atencaoMinutos: 20,
    atrasadoMinutos: 40
};

// PASSO 19 — fluxo operacional de encomendas.
// A encomenda pode ser aceita antes da data para confirmar o compromisso com o cliente,
// mas produção/expedição/finalização só ficam disponíveis quando chega o momento agendado.
function obterDataHoraOperacionalEncomenda(pedido) {
    if (!pedido) return null;

    const data = String(pedido.dataEncomenda || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

    const horaInformada = String(pedido.horaEncomenda || '').trim();
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(horaInformada)
        ? horaInformada
        : '00:00';

    const [ano, mes, dia] = data.split('-').map(Number);
    const [h, min] = hora.split(':').map(Number);
    const alvo = new Date(ano, mes - 1, dia, h, min, 0, 0);

    return Number.isNaN(alvo.getTime()) ? null : alvo;
}

function encomendaAguardandoHorarioOperacional(pedido, agora = new Date()) {
    const alvo = obterDataHoraOperacionalEncomenda(pedido);
    return !!(alvo && agora.getTime() < alvo.getTime());
}

function formatarMomentoOperacionalEncomenda(pedido) {
    const data = String(pedido && pedido.dataEncomenda || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return '';

    const dataBr = data.split('-').reverse().join('/');
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(pedido.horaEncomenda || '').trim())
        ? String(pedido.horaEncomenda).trim()
        : '';

    return `${dataBr}${hora ? ` às ${hora}` : ''}`;
}

function obterInicioEtapaPedido(pedido) {
    if (!pedido) return 0;

    // Encomenda: depois que o horário chega, o relógio operacional começa exatamente
    // no momento agendado, nunca no dia em que o cliente fez ou pagou a encomenda.
    const momentoAgendado = obterDataHoraOperacionalEncomenda(pedido);
    if (momentoAgendado && Date.now() >= momentoAgendado.getTime()) {
        return momentoAgendado.getTime();
    }

    // Pedido comum mantém a regra já validada.
    const pagamentoConfirmadoEm = Number(pedido.pagamento && pedido.pagamento.confirmadoEm || 0);
    return Number(pagamentoConfirmadoEm || pedido.timestamp || pedido.aceitoEm || pedido.prontoEm || pedido.saiuEntregaEm || 0);
}

function atualizarUrgenciaVisualCard(card) {
    if (!card || !card.dataset.urgenciaInicio) return;
    const inicio = Number(card.dataset.urgenciaInicio || 0);
    if (!inicio) return;

    const minutos = Math.max(0, Math.floor((Date.now() - inicio) / 60000));
    const badge = card.querySelector('.pedido-tempo-etapa');
    if (!badge) return;

    card.classList.remove('urgencia-normal', 'urgencia-atencao', 'urgencia-atrasado');
    badge.classList.remove('tempo-normal', 'tempo-atencao', 'tempo-atrasado');

    if (minutos >= URGENCIA_PEDIDOS.atrasadoMinutos) {
        card.classList.add('urgencia-atrasado');
        badge.classList.add('tempo-atrasado');
        badge.textContent = `🔴 ${minutos} min desde o pedido`;
    } else if (minutos >= URGENCIA_PEDIDOS.atencaoMinutos) {
        card.classList.add('urgencia-atencao');
        badge.classList.add('tempo-atencao');
        badge.textContent = `🟠 ${minutos} min desde o pedido`;
    } else {
        card.classList.add('urgencia-normal');
        badge.classList.add('tempo-normal');
        badge.textContent = `🟢 ${minutos} min desde o pedido`;
    }
}

function aplicarUrgenciaVisualCard(card, pedido, comAcoes) {
    if (!comAcoes || !pedido || pedido.status === 'entregue' || pedido.status === 'recusado') return;

    const dataEncomenda = String(pedido.dataEncomenda || '').trim();
    const hoje = hojeIsoLocal();
    const dataEncomendaValida = /^\d{4}-\d{2}-\d{2}$/.test(dataEncomenda);
    const aguardandoMomentoAgendado = encomendaAguardandoHorarioOperacional(pedido);

    if (dataEncomendaValida && aguardandoMomentoAgendado) {
        const badge = card.querySelector('.pedido-tempo-etapa');

        card.classList.remove(
            'urgencia-normal',
            'urgencia-atencao',
            'urgencia-atrasado'
        );

        delete card.dataset.urgenciaInicio;
        const momentoOperacional = obterDataHoraOperacionalEncomenda(pedido);
        if (momentoOperacional) card.dataset.operacionalLiberacao = String(momentoOperacional.getTime());

        if (badge) {
            badge.classList.remove(
                'tempo-normal',
                'tempo-atencao',
                'tempo-atrasado'
            );

            badge.classList.add('tempo-normal', 'pedido-agendamento-premium');

            // Encomenda agendada não usa cronômetro operacional antes da data.
            // O aviso sai do cantinho do horário e vira uma faixa própria logo abaixo
            // do cabeçalho, evitando estouro lateral em colunas estreitas do kanban.
            const topo = card.querySelector('.pedido-topo');
            if (topo && badge.parentElement !== card) {
                topo.insertAdjacentElement('afterend', badge);
            }

            badge.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:space-between',
                'gap:10px',
                'width:100%',
                'box-sizing:border-box',
                'margin:9px 0 10px',
                'padding:9px 11px',
                'border:1px solid rgba(41,145,88,.16)',
                'border-radius:12px',
                'background:linear-gradient(135deg,rgba(231,248,238,.98),rgba(245,252,248,.98))',
                'box-shadow:0 5px 14px rgba(31,116,70,.06)',
                'font-size:11px',
                'line-height:1.25',
                'white-space:normal',
                'overflow:visible',
                'color:#246b45'
            ].join(';');

            const horaEvento = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(pedido.horaEncomenda || ''))
                ? String(pedido.horaEncomenda)
                : '';
            if (dataEncomenda === hoje) {
                badge.innerHTML = `
                    <span style="display:flex;align-items:center;gap:6px;font-weight:800;min-width:0;">
                        <span aria-hidden="true">📅</span>
                        <span>Hoje${horaEvento ? ` • ${horaEvento}` : ''}</span>
                    </span>
                    <span style="font-size:10px;font-weight:800;opacity:.78;white-space:nowrap;">DIA DO EVENTO</span>
                `;
            } else {
                const dataBr = dataEncomenda
                    .split('-')
                    .reverse()
                    .join('/');

                badge.innerHTML = `
                    <span style="display:flex;align-items:center;gap:6px;font-weight:850;white-space:nowrap;">
                        <span aria-hidden="true">📅</span>
                        <span>${dataBr}${horaEvento ? ` • ${horaEvento}` : ''}</span>
                    </span>
                    <span style="font-size:10.5px;font-weight:750;text-align:right;min-width:0;">Agendada</span>
                `;
            }
        }

        return;
    }

    delete card.dataset.operacionalLiberacao;
    const inicio = obterInicioEtapaPedido(pedido);
    if (!inicio) return;

    card.dataset.urgenciaInicio = String(inicio);
    const badge = card.querySelector('.pedido-tempo-etapa');
    if (badge) {
        badge.classList.remove('pedido-agendamento-premium');
        badge.removeAttribute('style');
        const horaBloco = card.querySelector('.pedido-hora-bloco');
        if (horaBloco && badge.parentElement !== horaBloco) horaBloco.appendChild(badge);
    }
    atualizarUrgenciaVisualCard(card);
}

// Tempo final do pedido entregue — só leitura/visual. Usa os horários que já existem no pedido
// e NÃO altera status, Firebase, notificações ou qualquer fluxo operacional.
function montarTempoFinalizadoPedido(pedido) {
    if (!pedido || pedido.status !== 'entregue') return '';
    // Usa o mesmo início operacional do cronômetro em andamento. Assim, pedido pago online
    // mede da confirmação do pagamento até a finalização; os demais medem desde a criação.
    const inicio = obterInicioEtapaPedido(pedido);
    const fim = Number(pedido.finalizadoEm || 0);
    if (!inicio || !fim || fim < inicio) return '';
    const minutos = Math.max(0, Math.floor((fim - inicio) / 60000));
    return `<div class="pedido-tempo-etapa tempo-normal">⏱ ${minutos} min • Finalizado</div>`;
}

// Atualiza só a aparência a cada minuto; não consulta nem altera o banco.
// Também troca automaticamente uma encomenda de "aguardando horário" para o fluxo
// operacional quando chega o momento agendado, sem exigir F5 no painel.
setInterval(() => {
    document.querySelectorAll('.pedido-card[data-urgencia-inicio]').forEach(atualizarUrgenciaVisualCard);

    document.querySelectorAll('.pedido-card[data-operacional-liberacao]').forEach(card => {
        const liberaEm = Number(card.dataset.operacionalLiberacao || 0);
        if (!liberaEm || Date.now() < liberaEm) return;

        const pedidoId = card.dataset.pedidoId;
        const pedido = pedidoId ? pedidosParaImpressao[pedidoId] : null;
        if (!pedido) return;

        // O próprio card é remontado com os mesmos dados já carregados. Não grava nada
        // no Firebase e não altera pagamento; apenas libera os botões correspondentes.
        const cardAtualizado = montarCardPedido(pedidoId, pedido, true);
        card.replaceWith(cardAtualizado);
    });
}, 60000);

function montarCardPedido(id, pedido, comAcoes) {
    pedidosParaImpressao[id] = pedido;

    const div = document.createElement('div');
    div.classList.add('pedido-card');
    div.dataset.pedidoId = id;
    if (comAcoes) {
        div.classList.add('novo');
        div.id = `pendente-${id}`; // id só usado na lista de pendentes, pra remover certinho
    }

    let itensHtml = '';
    (pedido.itens || []).forEach(item => {
        const quantidadeSegura = escaparHtmlSeguro(item.quantidade);
        const nomeSeguro = escaparHtmlSeguro(item.nome);
        const observacaoSegura = item.observacao ? escaparHtmlSeguro(item.observacao) : '';
        const adicionaisSeguros = item.adicionaisTexto ? escaparHtmlSeguro(item.adicionaisTexto) : '';
        itensHtml += `<li><span>${quantidadeSegura}x ${nomeSeguro}${observacaoSegura ? ` <em>— ${observacaoSegura}</em>` : ''}${adicionaisSeguros ? ` <em>(${adicionaisSeguros})</em>` : ''}</span><span>${formatarPreco(item.preco * item.quantidade)}</span></li>`;
    });

    let enderecoHtml = '';
    if (pedido.tipoEntrega === 'entrega' && pedido.endereco) {
        const e = pedido.endereco;
        const rua = escaparHtmlSeguro(e.rua || '');
        const numero = escaparHtmlSeguro(e.numero || '');
        const complemento = escaparHtmlSeguro(e.complemento || '');
        const bairro = escaparHtmlSeguro(e.bairro || '');
        const cidade = escaparHtmlSeguro(e.cidade || '');
        const estado = escaparHtmlSeguro(e.estado || '');
        const cep = escaparHtmlSeguro(e.cep || '');
        enderecoHtml = `<div class="pedido-endereco">📍 ${rua}, ${numero} ${complemento ? '(' + complemento + ')' : ''} — ${bairro}, ${cidade}/${estado} — CEP ${cep}</div>`;
    }

    const obsHtml = pedido.observacoes ? `<div class="pedido-obs">📝 ${escaparHtmlSeguro(pedido.observacoes)}</div>` : '';
    const resgateHtml = pedido.recompensaResgatada
        ? `<div class="pedido-resgate">🎁 Cliente do Clube resgatou: <strong>${escaparHtmlSeguro(pedido.recompensaResgatada.descricao)}</strong> — separa isso no pedido!</div>`
        : '';
    const dataEncomendaCard = String(pedido.dataEncomenda || '').trim();
    const horaEncomendaCard = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(pedido.horaEncomenda || ''))
        ? String(pedido.horaEncomenda)
        : '';
    const encomendaHtml = /^\d{4}-\d{2}-\d{2}$/.test(dataEncomendaCard) && dataEncomendaCard < hojeIsoLocal()
        ? `<div class="pedido-resgate">📅 Evento: <strong>${dataEncomendaCard.split('-').reverse().join('/')}${horaEncomendaCard ? ` às ${horaEncomendaCard}` : ''}</strong></div>`
        : '';

    const aguardandoFluxoEncomenda = encomendaAguardandoHorarioOperacional(pedido);
    const tagStatus = {
        pendente: '<span class="pedido-tag tag-status-pendente">Pendente</span>',
        aceito: aguardandoFluxoEncomenda
            ? '<span class="pedido-tag tag-status-aceito">✅ Encomenda confirmada</span>'
            : '<span class="pedido-tag tag-status-aceito">👩‍🍳 Em preparo</span>',
        em_rota: '<span class="pedido-tag tag-status-em-rota">🛵 Saiu para entrega</span>',
        pronto_retirada: '<span class="pedido-tag tag-status-pronto-retirada">🛍️ Pronto pra retirada</span>',
        entregue: '<span class="pedido-tag tag-status-entregue">✅ Entregue</span>',
        recusado: '<span class="pedido-tag tag-status-recusado">Recusado</span>'
    }[pedido.status] || '';

    let freteLinha = '';
    if (pedido.tipoEntrega === 'entrega') {
        freteLinha = `<div class="pedido-total-linha"><span>Entrega</span><span>${pedido.frete != null ? formatarPreco(pedido.frete) : 'A confirmar'}</span></div>`;
    }

    const pagamentoEhSinal = pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal';
    const sinalConfirmado = pagamentoEhSinal && pedido.pagamento.status === 'pago';
    const restanteAtual = pedido.pagamentoRestante || null;
    const restanteJaPago = !!(restanteAtual && restanteAtual.status === 'pago');
    // Abrir o checkout online NÃO significa pagamento confirmado. Se o cliente desistir
    // do Pix/Cartão e pagar presencialmente no dia do evento, a loja ainda precisa poder
    // registrar o recebimento. Mantemos a informação só para mostrar um aviso extra antes
    // da confirmação manual, evitando confundir checkout aberto com pagamento realizado.
    const restanteOnlineEmAndamento = !!(restanteAtual &&
        restanteAtual.status === 'aguardando' &&
        restanteAtual.provedor === 'infinitepay');
    const dataEncomendaConfirmacao = String(pedido.dataEncomenda || '').trim();
    const restanteDinheiroPodeSerConfirmado = sinalConfirmado &&
        !restanteJaPago &&
        /^\d{4}-\d{2}-\d{2}$/.test(dataEncomendaConfirmacao) &&
        dataEncomendaConfirmacao <= hojeIsoLocal() &&
        pedido.status !== 'recusado';

    // Encomenda agendada para hoje ou data futura NÃO cria cronômetro operacional no topo.
    // A decisão acontece antes de montar o HTML, evitando que um contador apareça e depois
    // precise ser substituído visualmente. Pedidos comuns continuam com o contador normal.
    const dataEncomendaTopo = String(pedido.dataEncomenda || '').trim();
    const dataEncomendaTopoValida = /^\d{4}-\d{2}-\d{2}$/.test(dataEncomendaTopo);
    const encomendaAgendadaSemContador = dataEncomendaTopoValida && encomendaAguardandoHorarioOperacional(pedido);
    let avisoAgendamentoTopoHtml = '';
    if (encomendaAgendadaSemContador) {
        const dataBrTopo = dataEncomendaTopo.split('-').reverse().join('/');
        const ehHojeTopo = dataEncomendaTopo === hojeIsoLocal();
        const horaTopo = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(pedido.horaEncomenda || ''))
            ? String(pedido.horaEncomenda)
            : '';
        const dataHoraTopo = `${ehHojeTopo ? 'Hoje' : dataBrTopo}${horaTopo ? ` • ${horaTopo}` : ''}`;
        avisoAgendamentoTopoHtml = `
            <div class="pedido-agendamento-premium" style="width:100%;box-sizing:border-box;margin:9px 0 10px;padding:11px 12px;border:1px solid rgba(151,105,68,.18);border-radius:14px;background:linear-gradient(145deg,rgba(255,250,243,.99),rgba(255,255,255,.99));box-shadow:0 7px 18px rgba(96,62,39,.07);color:#5a4030;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;">
                    <span style="display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#9a6844;min-width:0;">
                        <span aria-hidden="true" style="font-size:13px;">📅</span>
                        <span>Encomenda agendada</span>
                    </span>
                    <span style="padding:4px 7px;border-radius:999px;background:${ehHojeTopo ? 'rgba(32,151,87,.10)' : 'rgba(171,119,75,.09)'};font-size:8.8px;font-weight:900;letter-spacing:.04em;white-space:nowrap;color:${ehHojeTopo ? '#237548' : '#8b613f'};">${ehHojeTopo ? 'DIA DO EVENTO' : 'AGENDADA'}</span>
                </div>
                <div style="font-size:14px;font-weight:900;line-height:1.2;color:#3d2b21;margin-bottom:4px;">${dataHoraTopo}</div>
                <div style="font-size:10.5px;line-height:1.35;color:#7d695c;">${ehHojeTopo ? 'Evento marcado para hoje • confira os detalhes de entrega ou retirada.' : 'Aguardando a data do evento • detalhes combinados com o cliente.'}</div>
            </div>`;
    }
    // Em encomenda com sinal online obrigatório, o botão genérico "Marcar como pago"
    // não deve aparecer: ele poderia dar a impressão de quitar manualmente sinal/restante.
    // Pedidos normais continuam exatamente com o comportamento anterior.
    const botaoPagamentoManualHtml = pagamentoEhSinal ? '' : `
        <span class="pedido-tag ${pedido.pagamentoConfirmadoManual ? 'tag-status-entregue' : ''}" style="cursor:pointer;" onclick="alternarPagamentoConfirmadoManual('${id}', ${!pedido.pagamentoConfirmadoManual})" title="Clique pra marcar/desmarcar como pago (uso manual, ex: cliente pagou Pix por fora)">${pedido.pagamentoConfirmadoManual ? '✅ Pago' : '☐ Marcar como pago'}</span>`;
    const pagamentoOnlineHtml = montarTagPagamento(pedido);
    const botaoConfirmarRestanteDinheiroHtml = restanteDinheiroPodeSerConfirmado
        ? `<button type="button" class="btn-entregue" style="margin-top:7px;padding:8px 11px;font-size:11px;" onclick="confirmarRecebimentoRestanteDinheiro('${id}', this, ${restanteOnlineEmAndamento})">✅ Confirmar recebimento do restante</button>`
        : '';

    div.innerHTML = `
        <div class="pedido-topo">
            <div>
                <div class="pedido-cliente">${pedido.numero ? `<span class="pedido-numero">🛒Pedido #${escaparHtmlSeguro(String(pedido.numero).padStart(3, '0'))}</span> - ` : ''}${escaparHtmlSeguro(pedido.nome || 'Cliente')}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
                    <span class="pedido-tag ${pedido.tipoEntrega === 'entrega' ? 'tag-entrega' : 'tag-retirada'}">${pedido.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏠 Retirada'}</span>
                    <span class="pedido-tag tag-pagamento" style="cursor:pointer;" onclick="editarFormaPagamentoPedido('${id}', this)" title="Clique pra corrigir a forma de pagamento">💰 ${escaparHtmlSeguro(pedido.formaPagamento || '')}${pedido.troco ? ' (' + escaparHtmlSeguro(formatarTrocoLabel(pedido.troco, totalDoPedido(pedido))) + ')' : ''} ✏️</span>
                    ${botaoPagamentoManualHtml}
                    ${tagStatus}
                </div>
                ${pagamentoOnlineHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px;">${pagamentoOnlineHtml}</div>` : ''}
                ${botaoConfirmarRestanteDinheiroHtml ? `<div>${botaoConfirmarRestanteDinheiroHtml}</div>` : ''}
            </div>
            <div class="pedido-hora-bloco">
                <div class="pedido-hora">${formatarHora(pedido.timestamp)}</div>
                ${comAcoes ? '<div class="pedido-tempo-etapa"></div>' : montarTempoFinalizadoPedido(pedido)}
            </div>
        </div>
        ${avisoAgendamentoTopoHtml}
        ${resgateHtml}
        ${encomendaHtml}
        <div>📞 ${escaparHtmlSeguro(pedido.telefone || '')}</div>
        <ul class="pedido-itens">${itensHtml}</ul>
        <div class="pedido-total-linha"><span>Subtotal</span><span>${formatarPreco(pedido.subtotal)}</span></div>
        ${freteLinha}
        <div class="pedido-total-linha total-final"><span>Total</span><span>${pedido.total != null ? formatarPreco(pedido.total) : 'A confirmar'}</span></div>
        ${enderecoHtml}
        ${obsHtml}
        <div id="avisoRecompensaDisponivel_${id}"></div>
        <div class="pedido-imprimir-linha">
            <button class="btn-imprimir-pedido" onclick="imprimirPedidoIndividual('${id}')">🖨️ Imprimir</button>
        </div>
        ${comAcoes ? montarBotoesAcaoPedido(id, pedido) : ''}
    `;
    aplicarUrgenciaVisualCard(div, pedido, comAcoes);
    // Confere (de forma assíncrona, sem travar o card) se esse cliente JÁ tem pontos
    // suficientes pra alguma recompensa — mostra um aviso pra lembrar de oferecer,
    // mesmo que ele não tenha resgatado nada nesse pedido específico
    if (!pedido.recompensaResgatada) verificarRecompensaDisponivelNoPedido(id, pedido);
    return div;
}

async function verificarRecompensaDisponivelNoPedido(id, pedido) {
    if (!pedido.telefone) return;
    const tel = String(pedido.telefone).replace(/\D/g, '');
    if (tel.length < 10) return;
    try {
        const [fidSnap, recSnap] = await Promise.all([
            db.ref('fidelidade/' + tel).once('value'),
            db.ref('configuracao/recompensasFidelidade').once('value')
        ]);
        const pontosAtuais = (fidSnap.val() || {}).pontos || 0;
        const recompensas = (recSnap.val() || []).filter(Boolean);
        const disponiveis = recompensas.filter(r => r.pontos <= pontosAtuais);
        if (disponiveis.length === 0) return;

        const alvo = document.getElementById('avisoRecompensaDisponivel_' + id);
        if (!alvo) return; // card pode já ter sumido da tela (pedido finalizado rápido)
        const listaTexto = disponiveis
            .map(r => `${escaparHtmlSeguro(r.descricao)} (${escaparHtmlSeguro(r.pontos)} pts)`)
            .join(' · ');
        alvo.innerHTML = `<div class="pedido-resgate">⭐ Esse cliente já TEM pontos pra resgatar: <strong>${listaTexto}</strong> — vale oferecer!</div>`;
    } catch (err) {
        console.log('Não foi possível checar recompensa disponível:', err.message);
    }
}

function montarBotoesAcaoPedido(id, pedido) {
    let botoesEspecificos = '';
    const aguardandoEncomenda = encomendaAguardandoHorarioOperacional(pedido);

    if (pedido.status === 'pendente') {
        // Confirmar a encomenda antes da data é permitido: isso firma o compromisso com
        // o cliente, mas ainda não libera produção/expedição/finalização.
        botoesEspecificos = `
            <button class="btn-aceitar" onclick="responderPedido('${id}', 'aceito')">✅ Aceitar</button>
            <button class="btn-recusar" onclick="responderPedido('${id}', 'recusado')">✖ Recusar</button>`;
    } else if (pedido.status === 'aceito' && aguardandoEncomenda) {
        const momento = formatarMomentoOperacionalEncomenda(pedido);
        botoesEspecificos = `
            <button type="button" class="btn-secondary" disabled
                style="cursor:not-allowed;opacity:.78;flex:1;">
                ⏳ Aguardando ${momento || 'data/hora agendada'}
            </button>`;
    } else if (pedido.status === 'aceito') {
        // Aceito representa "Em preparo". Não existe mais atalho direto para Entregue:
        // primeiro precisa passar pela etapa correta de expedição da modalidade.
        botoesEspecificos = pedido.tipoEntrega === 'entrega'
            ? `<button class="btn-em-rota" onclick="responderPedido('${id}', 'em_rota')">🛵 Saiu para entrega</button>`
            : `<button class="btn-em-rota" onclick="responderPedido('${id}', 'pronto_retirada')">🛍️ Pronto pra retirada</button>`;
    } else if (pedido.status === 'em_rota') {
        // Só delivery chega a esta etapa.
        botoesEspecificos = pedido.tipoEntrega === 'entrega'
            ? `<button class="btn-entregue" onclick="responderPedido('${id}', 'entregue')">✅ Marcar como Entregue</button>`
            : '';
    } else if (pedido.status === 'pronto_retirada') {
        // Só retirada chega a esta etapa.
        botoesEspecificos = pedido.tipoEntrega !== 'entrega'
            ? `<button class="btn-entregue" onclick="responderPedido('${id}', 'entregue')">✅ Marcar como Retirado</button>`
            : '';
    }

    // Excluir fica disponível pra QUALQUER pedido, em qualquer status — útil pra
    // remover pedido de teste, duplicado, ou lançado sem querer no cardápio real
    const botaoExcluir = `<button class="btn-excluir-cupom" onclick="excluirPedidoQualquerStatus('${id}', ${pedido.numero || 'null'})" title="Excluir esse pedido de vez">🗑️</button>`;

    return `<div class="pedido-acoes">${botoesEspecificos}${botaoExcluir}</div>`;
}

// Exclui QUALQUER pedido (não só os manuais) — avisa antes se ele já tiver pagamento
// confirmado de verdade, pra nunca apagar sem querer algo que já virou venda real
async function excluirPedidoQualquerStatus(id, numero) {
    const snap = await db.ref('pedidos/' + id).once('value');
    const pedido = snap.val();
    const temPagamentoConfirmado = pedido && ((pedido.pagamento && pedido.pagamento.status === 'pago') || (pedido.pagamentoRestante && pedido.pagamentoRestante.status === 'pago'));

    let msg = `Excluir o pedido #${numero || ''} de vez? Não dá pra desfazer.`;
    if (temPagamentoConfirmado) msg = `⚠️ Esse pedido JÁ TEVE PAGAMENTO CONFIRMADO de verdade! Excluir aqui não estorna nada — se precisar devolver o dinheiro, isso tem que ser feito manualmente no InfinitePay. Tem certeza que quer excluir mesmo assim?\n\n${msg}`;

    if (!confirm(msg)) return;
    await db.ref('pedidos/' + id).remove();
}

function responderPedido(id, novoStatus) {
    const pedidoRef = db.ref('pedidos/' + id);
    pedidoRef.once('value').then(snap => {
        const pedido = snap.val();
        if (!pedido) return;
        // Proteção: se já estava entregue, não credita pontos de novo (evita clique duplo)
        if (novoStatus === 'entregue' && pedido.status === 'entregue') return;

        // PASSO 19 — valida a sequência no próprio handler. Assim, botão antigo, aba
        // desatualizada ou chamada manual não consegue pular etapa nem misturar retirada/delivery.
        const transicoesPermitidas = {
            pendente: ['aceito', 'recusado'],
            aceito: pedido.tipoEntrega === 'entrega' ? ['em_rota'] : ['pronto_retirada'],
            em_rota: pedido.tipoEntrega === 'entrega' ? ['entregue'] : [],
            pronto_retirada: pedido.tipoEntrega !== 'entrega' ? ['entregue'] : [],
            entregue: [],
            recusado: []
        };
        const permitidas = transicoesPermitidas[pedido.status] || [];
        if (!permitidas.includes(novoStatus)) {
            alert('Essa mudança de status não faz parte do fluxo operacional deste pedido. Atualize o painel e tente novamente.');
            return;
        }

        // Encomenda futura pode ser aceita/recusada antes da data, mas não pode avançar
        // para expedição/finalização até chegar a data + hora marcada.
        const statusOperacionais = ['em_rota', 'pronto_retirada', 'entregue'];
        if (statusOperacionais.includes(novoStatus) && encomendaAguardandoHorarioOperacional(pedido)) {
            const momento = formatarMomentoOperacionalEncomenda(pedido);
            alert(`Essa encomenda está agendada para ${momento || 'uma data/hora futura'}. O fluxo será liberado no momento agendado.`);
            return;
        }

        // Avisa antes de recusar um pedido que já teve pagamento de verdade coletado
        // (sinal e/ou restante) — pra nunca esquecer de estornar manualmente
        if (novoStatus === 'recusado') {
            const sinalPago = pedido.pagamento && pedido.pagamento.status === 'pago';
            const restantePago = pedido.pagamentoRestante && pedido.pagamentoRestante.status === 'pago';
            if (sinalPago || restantePago) {
                const valores = [];
                if (sinalPago) valores.push(`sinal de ${formatarPreco(pedido.pagamento.valorSinal)}`);
                if (restantePago) valores.push(`restante de ${formatarPreco(pedido.pagamentoRestante.valorRestante)}`);
                if (!confirm(`⚠️ Esse pedido já teve o ${valores.join(' e o ')} pago de verdade via InfinitePay. Recusar aqui NÃO estorna esse valor automaticamente — você precisa fazer o estorno manualmente no painel do InfinitePay. Quer continuar mesmo assim?`)) return;
            }
        }

        const atualizacaoStatus = { status: novoStatus };
        const campoHorarioPorStatus = {
            aceito: 'aceitoEm',
            em_rota: 'saiuEntregaEm',
            pronto_retirada: 'prontoEm',
            entregue: 'finalizadoEm',
            recusado: 'recusadoEm'
        };
        const campoHorario = campoHorarioPorStatus[novoStatus];
        if (campoHorario) atualizacaoStatus[campoHorario] = firebase.database.ServerValue.TIMESTAMP;

        return pedidoRef.update(atualizacaoStatus).then(() => {
            if (novoStatus === 'entregue') {
                creditarPontosFidelidade(pedido);
            }
            // Impressão automática — só dispara se o toggle estiver ativo. Reaproveita a
            // mesma função do botão manual "🖨️ Imprimir", só chamando ela sozinha.
            if (novoStatus === 'aceito' && impressaoAutomaticaAtiva) {
                imprimirPedidoIndividual(id);
            }
        });
    }).catch(err => alert('Não foi possível atualizar o pedido: ' + err.message));
}

function atualizarContador() {
    document.getElementById('contadorPendentes').textContent = idsRenderizados.size;
}

// ---------- ESCUTA EM TEMPO REAL ----------

// ---------- STATUS / HORÁRIO DA LOJA ----------


// ---------- TEMPO OPERACIONAL DA LOJA ----------
// Mede quanto tempo a loja ficou efetivamente aberta no dia. A contagem só grava
// abertura/fechamento no Firebase; o relógio da tela corre localmente, sem escrita por segundo.
let operacaoLojaServerOffset = 0;
let operacaoLojaConfigAtual = null;
let operacaoLojaAbertaEfetiva = null;
let operacaoLojaEstadoDb = null;
let operacaoLojaDiaDb = null;
let operacaoLojaDiaEscutado = '';
let operacaoLojaDiaRef = null;
let operacaoLojaDiaCallback = null;
let operacaoLojaSincronizando = false;
let operacaoLojaIniciado = false;

function agoraOperacaoLoja() {
    return Date.now() + operacaoLojaServerOffset;
}

function dataIsoOperacaoLoja(timestamp = agoraOperacaoLoja()) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioDiaOperacaoLoja(dataIso) {
    const partes = String(dataIso || '').split('-').map(Number);
    if (partes.length !== 3 || partes.some(n => !Number.isFinite(n))) return null;
    return new Date(partes[0], partes[1] - 1, partes[2], 0, 0, 0, 0).getTime();
}

function fimDiaOperacaoLoja(dataIso) {
    const inicio = inicioDiaOperacaoLoja(dataIso);
    return inicio == null ? null : inicio + (24 * 60 * 60 * 1000);
}

function formatarDuracaoOperacaoLoja(ms) {
    const totalMin = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    const horas = Math.floor(totalMin / 60);
    const minutos = totalMin % 60;
    return `${String(horas).padStart(2, '0')}h ${String(minutos).padStart(2, '0')}min`;
}


function obterDiaConfigOperacao(dataIso, horarios) {
    const inicio = inicioDiaOperacaoLoja(dataIso);
    if (inicio == null) return null;
    const d = new Date(inicio);
    return (horarios && horarios[d.getDay()]) || horariosPadraoAdmin[d.getDay()] || null;
}

function timestampHorarioOperacao(dataIso, horario) {
    const inicio = inicioDiaOperacaoLoja(dataIso);
    if (inicio == null || !horario || !/^\d{2}:\d{2}$/.test(horario)) return null;
    const [h, m] = horario.split(':').map(Number);
    const d = new Date(inicio);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();
}

function aberturaAutomaticaOperacao(dataIso, horarios) {
    const cfg = obterDiaConfigOperacao(dataIso, horarios);
    return cfg && cfg.aberto ? timestampHorarioOperacao(dataIso, cfg.abre) : null;
}

function fechamentoAutomaticoOperacao(dataIso, horarios) {
    const cfg = obterDiaConfigOperacao(dataIso, horarios);
    return cfg && cfg.aberto ? timestampHorarioOperacao(dataIso, cfg.fecha) : null;
}

function calcularEstadoEfetivoLoja(config) {
    const cfg = config || operacaoLojaConfigAtual || {};
    if (cfg.pausada === true) return false;
    const modo = cfg.modoManual || 'auto';
    if (modo === 'aberto') return true;
    if (modo === 'fechado') return false;
    return calcularAbertoPorHorarioAdmin(cfg.horarios);
}

function atualizarUiTempoOperacaoLoja() {
    const hoje = dataIsoOperacaoLoja();
    const agora = agoraOperacaoLoja();
    const totalFechado = Number((operacaoLojaDiaDb || {}).totalMs) || 0;
    let totalHoje = totalFechado;
    let sessaoAtualMs = 0;

    if (operacaoLojaEstadoDb && operacaoLojaEstadoDb.aberta && operacaoLojaEstadoDb.data === hoje && operacaoLojaEstadoDb.abriuEm) {
        sessaoAtualMs = Math.max(0, agora - Number(operacaoLojaEstadoDb.abriuEm));
        totalHoje += sessaoAtualMs;
    }

    const config = operacaoLojaConfigAtual || {};
    const pausada = config.pausada === true;
    const aberta = !pausada && !!operacaoLojaAbertaEfetiva;
    const tempoEl = document.getElementById('tempoOperacaoHoje');
    const statusEl = document.getElementById('tempoOperacaoStatus');
    const sessaoEl = document.getElementById('tempoOperacaoSessao');
    const card = document.querySelector('.tempo-operacao-card');

    if (tempoEl) tempoEl.textContent = formatarDuracaoOperacaoLoja(totalHoje);
    if (statusEl) statusEl.textContent = pausada ? 'Loja pausada' : (aberta ? 'Loja aberta' : 'Loja fechada');
    if (sessaoEl) {
        if (pausada) {
            const pausadaEm = Number(config.pausadaEm) || 0;
            const pausaMs = pausadaEm ? Math.max(0, agora - pausadaEm) : 0;
            sessaoEl.textContent = pausadaEm ? `Pausa atual: ${formatarDuracaoOperacaoLoja(pausaMs)}` : 'Contagem pausada';
        } else if (aberta) {
            sessaoEl.textContent = sessaoAtualMs > 0 ? `Aberta há ${formatarDuracaoOperacaoLoja(sessaoAtualMs)}` : 'Contagem em andamento';
        } else {
            sessaoEl.textContent = 'Contagem encerrada';
        }
    }

    if (card) {
        card.classList.toggle('is-open', aberta);
        card.classList.toggle('is-paused', pausada);
        card.classList.toggle('is-closed', !aberta && !pausada);
    }

    const btnAbrir = document.getElementById('btnOperacaoAbrir');
    const btnPausar = document.getElementById('btnOperacaoPausar');
    const btnRetomar = document.getElementById('btnOperacaoRetomar');
    const btnFechar = document.getElementById('btnOperacaoFechar');

    if (btnAbrir) btnAbrir.style.display = (!aberta && !pausada) ? '' : 'none';
    if (btnPausar) btnPausar.style.display = aberta ? '' : 'none';
    if (btnRetomar) btnRetomar.style.display = pausada ? '' : 'none';
    if (btnFechar) btnFechar.style.display = (aberta || pausada) ? '' : 'none';
}

function escutarDiaOperacaoLojaAtual() {
    const hoje = dataIsoOperacaoLoja();
    if (operacaoLojaDiaEscutado === hoje && operacaoLojaDiaRef) return;

    if (operacaoLojaDiaRef && operacaoLojaDiaCallback) {
        operacaoLojaDiaRef.off('value', operacaoLojaDiaCallback);
    }

    operacaoLojaDiaEscutado = hoje;
    operacaoLojaDiaRef = db.ref(`configuracao/operacaoLoja/dias/${hoje}`);
    operacaoLojaDiaCallback = snap => {
        operacaoLojaDiaDb = snap.val() || {};
        atualizarUiTempoOperacaoLoja();
    };
    operacaoLojaDiaRef.on('value', operacaoLojaDiaCallback);
}

function transacaoFirebase(ref, atualizador) {
    return new Promise((resolve, reject) => {
        ref.transaction(atualizador, (erro, committed, snapshot) => {
            if (erro) reject(erro);
            else resolve({ committed, snapshot });
        });
    });
}

async function abrirSessaoOperacaoLoja(modo, abriuEmOverride) {
    const agora = Number(abriuEmOverride) || agoraOperacaoLoja();
    const data = dataIsoOperacaoLoja(agora);
    const sessaoRefBase = db.ref(`configuracao/operacaoLoja/dias/${data}/sessoes`).push();
    const sessaoId = sessaoRefBase.key;
    const estadoRef = db.ref('configuracao/operacaoLoja/estadoAtual');

    const resultado = await transacaoFirebase(estadoRef, atual => {
        if (atual && atual.aberta) return;
        return {
            aberta: true,
            abriuEm: agora,
            data,
            sessaoId,
            modo: modo || 'auto',
            atualizadoEm: agoraOperacaoLoja()
        };
    });

    if (!resultado.committed) return false;

    await sessaoRefBase.set({
        abriuEm: agora,
        fechouEm: null,
        duracaoMs: null,
        modo: modo || 'auto'
    });
    return true;
}

async function fecharSessaoOperacaoLoja(estado, fechouEmOverride) {
    const atual = estado || operacaoLojaEstadoDb;
    if (!atual || !atual.aberta || !atual.sessaoId || !atual.abriuEm || !atual.data) return false;

    const fechouEm = Math.max(Number(atual.abriuEm), Number(fechouEmOverride) || agoraOperacaoLoja());
    const estadoRef = db.ref('configuracao/operacaoLoja/estadoAtual');
    const sessaoId = atual.sessaoId;
    const abriuEm = Number(atual.abriuEm);
    const data = atual.data;

    const resultado = await transacaoFirebase(estadoRef, corrente => {
        if (!corrente || !corrente.aberta || corrente.sessaoId !== sessaoId) return;
        return {
            ...corrente,
            aberta: false,
            fechouEm,
            atualizadoEm: agoraOperacaoLoja()
        };
    });

    if (!resultado.committed) return false;

    const duracaoMs = Math.max(0, fechouEm - abriuEm);
    await Promise.all([
        db.ref(`configuracao/operacaoLoja/dias/${data}/totalMs`).transaction(total => (Number(total) || 0) + duracaoMs),
        db.ref(`configuracao/operacaoLoja/dias/${data}/sessoes/${sessaoId}`).update({ fechouEm, duracaoMs })
    ]);
    return true;
}

async function sincronizarTempoOperacaoLoja(abertaEfetiva, modo) {
    if (operacaoLojaSincronizando) return;
    operacaoLojaSincronizando = true;
    try {
        const agora = agoraOperacaoLoja();
        const hoje = dataIsoOperacaoLoja(agora);
        const estadoSnap = await db.ref('configuracao/operacaoLoja/estadoAtual').once('value');
        let estado = estadoSnap.val() || null;

        // Se uma sessão atravessou a meia-noite, fecha o dia anterior sem deixar o relógio
        // correr indefinidamente. No automático, respeita primeiro o fechamento programado.
        if (estado && estado.aberta && estado.data && estado.data !== hoje) {
            let fechamentoAnterior = fimDiaOperacaoLoja(estado.data);
            if (estado.modo === 'auto' && operacaoLojaConfigAtual) {
                const programado = fechamentoAutomaticoOperacao(estado.data, operacaoLojaConfigAtual.horarios);
                if (programado && programado > Number(estado.abriuEm) && programado < fechamentoAnterior) fechamentoAnterior = programado;
            }
            if (fechamentoAnterior) await fecharSessaoOperacaoLoja(estado, fechamentoAnterior);
            estado = null;
            if (abertaEfetiva) {
                let inicioHoje = inicioDiaOperacaoLoja(hoje) || agora;
                if ((modo || 'auto') === 'auto' && operacaoLojaConfigAtual) {
                    inicioHoje = aberturaAutomaticaOperacao(hoje, operacaoLojaConfigAtual.horarios) || inicioHoje;
                }
                await abrirSessaoOperacaoLoja(modo, Math.min(inicioHoje, agora));
            }
            return;
        }

        if (abertaEfetiva) {
            if (estado && estado.aberta && estado.data === hoje) return;

            let inicio = agora;
            if ((modo || 'auto') === 'auto' && operacaoLojaConfigAtual) {
                const programado = aberturaAutomaticaOperacao(hoje, operacaoLojaConfigAtual.horarios);
                const ultimoFechamento = estado && estado.data === hoje ? Number(estado.fechouEm || 0) : 0;
                // Se não houve fechamento depois da abertura programada, podemos recuperar
                // com segurança o tempo desde o horário automático, mesmo se o painel abriu depois.
                if (programado && programado <= agora && ultimoFechamento < programado) inicio = programado;
            }
            await abrirSessaoOperacaoLoja(modo, inicio);
        } else if (estado && estado.aberta) {
            let fechamento = agora;
            if ((modo || 'auto') === 'auto' && estado.modo === 'auto' && operacaoLojaConfigAtual) {
                const programado = fechamentoAutomaticoOperacao(hoje, operacaoLojaConfigAtual.horarios);
                if (programado && programado >= Number(estado.abriuEm) && programado <= agora) fechamento = programado;
            }
            await fecharSessaoOperacaoLoja(estado, fechamento);
        }
    } catch (err) {
        console.log('Não foi possível sincronizar o tempo operacional da loja:', err.message);
    } finally {
        operacaoLojaSincronizando = false;
    }
}

function aplicarEstadoOperacionalLoja(config) {
    operacaoLojaConfigAtual = config || {};
    const modo = operacaoLojaConfigAtual.modoManual || 'auto';
    const aberta = calcularEstadoEfetivoLoja(operacaoLojaConfigAtual);
    operacaoLojaAbertaEfetiva = aberta;

    const pausada = operacaoLojaConfigAtual.pausada === true;
    const statusLoja = document.getElementById('lojaStatusAtual');
    if (statusLoja) statusLoja.textContent = pausada ? '🟡 Pausada' : (aberta ? '🟢 Aberta' : '🔴 Fechada');

    atualizarUiTempoOperacaoLoja();
    sincronizarTempoOperacaoLoja(aberta, pausada ? 'pausa' : modo);
}

function iniciarTempoOperacaoLoja() {
    if (operacaoLojaIniciado) return;
    operacaoLojaIniciado = true;

    db.ref('.info/serverTimeOffset').on('value', snap => {
        operacaoLojaServerOffset = Number(snap.val()) || 0;
        atualizarUiTempoOperacaoLoja();
    });

    db.ref('configuracao/operacaoLoja/estadoAtual').on('value', snap => {
        operacaoLojaEstadoDb = snap.val() || null;
        atualizarUiTempoOperacaoLoja();
    });

    escutarDiaOperacaoLojaAtual();

    // O relógio visual é local. Nenhuma escrita acontece a cada segundo.
    setInterval(() => {
        if (operacaoLojaDiaEscutado !== dataIsoOperacaoLoja()) escutarDiaOperacaoLojaAtual();
        atualizarUiTempoOperacaoLoja();
    }, 1000);

    // No modo automático, o Firebase não muda quando chega o horário de abrir/fechar.
    // Esta checagem leve percebe a virada do horário e registra apenas a mudança real.
    setInterval(() => {
        if (!operacaoLojaConfigAtual) return;
        const abertaAgora = calcularEstadoEfetivoLoja(operacaoLojaConfigAtual);
        if (abertaAgora !== operacaoLojaAbertaEfetiva) {
            operacaoLojaAbertaEfetiva = abertaAgora;
            const pausada = operacaoLojaConfigAtual.pausada === true;
            const statusLoja = document.getElementById('lojaStatusAtual');
            if (statusLoja) statusLoja.textContent = pausada ? '🟡 Pausada' : (abertaAgora ? '🟢 Aberta' : '🔴 Fechada');
            atualizarUiTempoOperacaoLoja();
            sincronizarTempoOperacaoLoja(abertaAgora, pausada ? 'pausa' : (operacaoLojaConfigAtual.modoManual || 'auto'));
        }
    }, 30000);
}


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

// Só ESCREVE o modo escolhido; quem atualiza os botões na tela é o listener em escutarConfigLoja().
// Trocar o modo pela aba Loja também encerra uma eventual pausa operacional.
function definirModoLoja(modo) {
    db.ref('configuracao/loja').update({
        modoManual: modo,
        pausada: false,
        pausadaEm: null
    }).catch(err => alert('Erro ao atualizar o status da loja: ' + err.message));
}

function abrirLojaOperacao() {
    db.ref('configuracao/loja').update({
        modoManual: 'aberto',
        pausada: false,
        pausadaEm: null
    }).catch(err => alert('Erro ao abrir a loja: ' + err.message));
}

function pausarLojaOperacao() {
    if (!operacaoLojaAbertaEfetiva || (operacaoLojaConfigAtual && operacaoLojaConfigAtual.pausada)) return;
    db.ref('configuracao/loja').update({
        pausada: true,
        pausadaEm: agoraOperacaoLoja()
    }).catch(err => alert('Erro ao pausar a loja: ' + err.message));
}

function retomarLojaOperacao() {
    db.ref('configuracao/loja').update({
        pausada: false,
        pausadaEm: null
    }).catch(err => alert('Erro ao retomar a loja: ' + err.message));
}

function fecharLojaOperacao() {
    if (!confirm('Fechar a loja agora? Novos pedidos serão bloqueados até você abrir novamente.')) return;
    db.ref('configuracao/loja').update({
        modoManual: 'fechado',
        pausada: false,
        pausadaEm: null
    }).catch(err => alert('Erro ao fechar a loja: ' + err.message));
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

        const chkRestrito = document.getElementById('chkModoRestritoBairro');
        const areaRestrito = document.getElementById('areaBairroUnicoAtivo');
        if (chkRestrito) chkRestrito.checked = !!config.modoRestritoAtivo;
        if (areaRestrito) areaRestrito.style.display = config.modoRestritoAtivo ? 'block' : 'none';
        renderizarListaBairrosRestritos(config.bairros || {}, config.bairrosAtivos || {});
        renderizarPedidoMinimoBairros();

        renderizarListaBairros();
    });
}

// Mostra um checkbox por bairro já cadastrado, marcando os que já estão na lista de
// atendidos durante o modo restrito. A busca só ESCONDE visualmente (nunca remove do
// HTML) — assim "marcar todos"/"salvar" sempre enxergam TODOS os bairros, mesmo os
// que estão fora da busca no momento, sem risco de desmarcar um que estava escondido.
function renderizarListaBairrosRestritos(bairros, bairrosAtivos) {
    const container = document.getElementById('listaBairrosRestritos');
    if (!container) return;
    const buscaEl = document.getElementById('buscaBairroRestrito');
    const busca = buscaEl ? normalizarTexto(buscaEl.value || '') : '';
    const nomes = Object.keys(bairros).map(cod => ({ cod, nome: decodeURIComponent(cod) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    container.innerHTML = nomes.map(b => {
        const escondido = busca && !normalizarTexto(b.nome).includes(busca);
        return `
        <label class="produto-disponivel-check" style="display:${escondido ? 'none' : 'block'}; padding:4px 0;">
            <input type="checkbox" data-bairro-cod="${b.cod}" ${bairrosAtivos[b.cod] ? 'checked' : ''} onchange="salvarBairrosAtivosRestrito()"> ${formatarNomeBairroExibicao(b.nome)}
        </label>
    `;
    }).join('') || '<p class="dica-secao">Nenhum bairro cadastrado ainda.</p>';
}

// Liga/desliga o modo restrito — os bairros continuam salvos, só passam a não ser
// atendidos enquanto isso estiver ativo (exceto os marcados na lista)
function alternarModoRestritoBairro(ativo) {
    const areaRestrito = document.getElementById('areaBairroUnicoAtivo');
    if (areaRestrito) areaRestrito.style.display = ativo ? 'block' : 'none';
    const msgEl = document.getElementById('modoRestritoBairroMsg');
    db.ref('configuracao/frete/modoRestritoAtivo').set(ativo)
        .then(() => { if (msgEl) msgEl.textContent = ativo ? 'Modo restrito ativado — só os bairros marcados serão atendidos.' : 'Modo restrito desativado — todos os bairros voltaram a ser atendidos.'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function salvarBairrosAtivosRestrito() {
    const msgEl = document.getElementById('modoRestritoBairroMsg');
    const checkboxes = document.querySelectorAll('#listaBairrosRestritos input[type="checkbox"]');
    const bairrosAtivos = {};
    checkboxes.forEach(chk => { if (chk.checked) bairrosAtivos[chk.dataset.bairroCod] = true; });
    db.ref('configuracao/frete/bairrosAtivos').set(bairrosAtivos)
        .then(() => { if (msgEl) msgEl.textContent = 'Bairros atendidos atualizados!'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function marcarTodosBairrosRestrito(marcar) {
    document.querySelectorAll('#listaBairrosRestritos input[type="checkbox"]').forEach(chk => { chk.checked = marcar; });
    salvarBairrosAtivosRestrito();
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
    const atualizacoes = {};
    atualizacoes['configuracao/frete/bairros/' + nomeCodificado] = null;
    // Se o bairro tinha uma exceção de pedido mínimo, remove junto para não deixar
    // configuração órfã escondida no Firebase.
    atualizacoes['configuracao/frete/pedidoMinimoBairros/' + nomeCodificado] = null;
    db.ref().update(atualizacoes)
        .catch(err => alert('Erro ao remover: ' + err.message));
}

function encontrarBairroConfiguradoPedidoMinimo(nomeDigitado) {
    const alvo = normalizarTexto(nomeDigitado || '');
    if (!alvo) return null;
    const bairros = configFreteAtual.bairros || {};
    for (const chave of Object.keys(bairros)) {
        let nome = chave;
        try { nome = decodeURIComponent(chave); } catch (e) { /* chave já legível */ }
        if (normalizarTexto(nome) === alvo) return { chave, nome };
    }
    return null;
}

function renderizarPedidoMinimoBairros() {
    const datalist = document.getElementById('pedidoMinimoBairrosLista');
    const container = document.getElementById('pedidoMinimoBairrosExcecoes');
    if (!datalist || !container) return;

    const bairros = configFreteAtual.bairros || {};
    const excecoes = configFreteAtual.pedidoMinimoBairros || {};

    datalist.innerHTML = '';
    Object.keys(bairros)
        .map(chave => {
            let nome = chave;
            try { nome = decodeURIComponent(chave); } catch (e) { /* chave já legível */ }
            return { chave, nome };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .forEach(bairro => {
            const option = document.createElement('option');
            option.value = formatarNomeBairroExibicao(bairro.nome);
            datalist.appendChild(option);
        });

    container.innerHTML = '';
    const entradas = Object.entries(excecoes)
        .map(([chave, valor]) => {
            let nome = chave;
            try { nome = decodeURIComponent(chave); } catch (e) { /* chave já legível */ }
            return { chave, nome, valor: Math.max(0, Number(valor) || 0) };
        })
        .filter(item => Object.prototype.hasOwnProperty.call(bairros, item.chave))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (!entradas.length) return;

    entradas.forEach(item => {
        const chip = document.createElement('span');
        chip.className = 'loja-minimo-bairro-chip';

        const texto = document.createElement('span');
        texto.textContent = `${formatarNomeBairroExibicao(item.nome)} — ${item.valor > 0 ? `R$ ${item.valor.toFixed(2).replace('.', ',')}` : 'Sem pedido mínimo'}`;

        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'loja-minimo-bairro-remover';
        remover.setAttribute('aria-label', `Remover exceção de ${formatarNomeBairroExibicao(item.nome)}`);
        remover.title = 'Voltar a usar o mínimo padrão';
        remover.textContent = '×';
        remover.onclick = () => removerPedidoMinimoBairro(item.chave);

        chip.append(texto, remover);
        container.appendChild(chip);
    });
}

function salvarPedidoMinimoBairro() {
    const bairroEl = document.getElementById('pedidoMinimoBairroBusca');
    const valorEl = document.getElementById('pedidoMinimoBairroValor');
    const msgEl = document.getElementById('pedidoMinimoBairroMsg');
    if (!bairroEl || !valorEl) return;

    const bairro = encontrarBairroConfiguradoPedidoMinimo(bairroEl.value.trim());
    if (!bairro) {
        if (msgEl) msgEl.textContent = 'Escolha um bairro que já esteja cadastrado em Áreas de Entrega.';
        return;
    }

    const textoValor = valorEl.value.trim();
    const valor = textoValor === '' ? 0 : parseFloat(textoValor.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
        if (msgEl) msgEl.textContent = 'Digite um valor válido ou deixe vazio para ficar sem pedido mínimo.';
        return;
    }

    db.ref('configuracao/frete/pedidoMinimoBairros/' + bairro.chave).set(valor)
        .then(() => {
            bairroEl.value = '';
            valorEl.value = '';
            if (msgEl) msgEl.textContent = valor > 0
                ? `${formatarNomeBairroExibicao(bairro.nome)}: mínimo de R$ ${valor.toFixed(2).replace('.', ',')} salvo.`
                : `${formatarNomeBairroExibicao(bairro.nome)}: sem pedido mínimo.`;
        })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function removerPedidoMinimoBairro(nomeCodificado) {
    const msgEl = document.getElementById('pedidoMinimoBairroMsg');
    db.ref('configuracao/frete/pedidoMinimoBairros/' + nomeCodificado).remove()
        .then(() => { if (msgEl) msgEl.textContent = 'Exceção removida — o bairro voltou a usar o mínimo padrão.'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao remover: ' + err.message; });
}

// Mostra a lista de bairros já cadastrados, filtrando pela busca (se tiver algo digitado)
function renderizarListaBairros() {
    const container = document.getElementById('listaBairrosCadastrados');
    if (!container) return;
    const busca = normalizarTexto(document.getElementById('buscaBairro').value || '');
    const bairros = configFreteAtual.bairros || {};
    const entradas = Object.entries(bairros)
        .map(([nomeCodificado, km]) => ({ nomeCodificado, nome: decodeURIComponent(nomeCodificado), km }))
        .filter(b => normalizarTexto(b.nome).includes(busca))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    if (entradas.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhum bairro encontrado.</p>';
        return;
    }
    container.innerHTML = entradas.map(b => `
        <div class="loja-status-card" style="margin-bottom:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span>${formatarNomeBairroExibicao(b.nome)} <span class="dica-secao">(${b.km} km)</span></span>
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
    const produtoSugeridoFreteGratis = document.getElementById('produtoSugeridoFreteGratis').value || null;
    const msgEl = document.getElementById('pedidoMinimoMsg');

    db.ref('configuracao/loja').update({ pedidoMinimo, freteGratisAcima, produtoSugeridoFreteGratis })
        .then(() => { msgEl.textContent = 'Salvo!'; })
        .catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function atualizarVisibilidadeAdicionaisProdutos(ativo) {
    // Os cards de produto já podem estar montados quando o lojista muda o interruptor.
    // Atualizamos somente a visibilidade dos blocos; nenhum dado do produto é alterado aqui.
    document.querySelectorAll('[id^="blocoAdicionais_"]').forEach(bloco => {
        bloco.style.display = ativo ? 'block' : 'none';
    });
}

function atualizarPainelAdicionaisLoja(ativo, salvando = false) {
    const painel = document.getElementById('statusAdicionaisLoja');
    const icone = painel && painel.querySelector('.loja-adicionais-feedback-icon');
    const titulo = document.getElementById('statusAdicionaisTitulo');
    const texto = document.getElementById('statusAdicionaisTexto');
    const btnProdutos = document.getElementById('btnIrProdutosAdicionais');

    if (painel) {
        painel.classList.toggle('ativo', !!ativo && !salvando);
        painel.classList.toggle('salvando', !!salvando);
    }

    if (salvando) {
        if (icone) icone.textContent = '…';
        if (titulo) titulo.textContent = 'Salvando configuração';
        if (texto) texto.textContent = 'Aguarde um instante enquanto a preferência é atualizada.';
    } else if (ativo) {
        if (icone) icone.textContent = '✓';
        if (titulo) titulo.textContent = 'Recurso ativado';
        if (texto) texto.textContent = 'Agora configure os recheios, complementos e extras individualmente na aba Produtos.';
    } else {
        if (icone) icone.textContent = '○';
        if (titulo) titulo.textContent = 'Recurso desativado';
        if (texto) texto.textContent = 'Os adicionais já cadastrados ficam preservados, mas não são oferecidos ao cliente enquanto o recurso estiver desligado.';
    }

    if (btnProdutos) btnProdutos.hidden = !ativo || salvando;
}

function irParaProdutosAdicionais() {
    const botaoProdutos = document.querySelector('.painel-tab-btn[data-tab="produtos"]');
    if (botaoProdutos) botaoProdutos.click();

    setTimeout(() => {
        const primeiroBloco = Array.from(document.querySelectorAll('[id^="blocoAdicionais_"]'))
            .find(bloco => bloco.style.display !== 'none');
        const destino = primeiroBloco || document.querySelector('section[data-tab="produtos"]');
        if (destino) {
            const editor = destino.querySelector && destino.querySelector('.adicionais-editor-premium');
            if (editor) editor.open = true;
            destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 220);
}

function salvarAdicionaisAtivo(ativo) {
    const novoEstado = !!ativo;
    const checkbox = document.getElementById('chkAdicionaisAtivo');
    atualizarPainelAdicionaisLoja(novoEstado, true);

    db.ref('configuracao/loja/adicionaisAtivo').set(novoEstado)
        .then(() => {
            adicionaisAtivo = novoEstado;
            atualizarVisibilidadeAdicionaisProdutos(novoEstado);
            atualizarPainelAdicionaisLoja(novoEstado, false);
        })
        .catch(err => {
            if (checkbox) checkbox.checked = !novoEstado;
            adicionaisAtivo = !novoEstado;
            atualizarVisibilidadeAdicionaisProdutos(adicionaisAtivo);
            atualizarPainelAdicionaisLoja(adicionaisAtivo, false);
            alert('Erro ao atualizar os adicionais: ' + err.message);
        });
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
    document.getElementById('contadorTitulo').textContent = `${titulo.length}/100`;
    document.getElementById('contadorMensagem').textContent = `${corpo.length}/300`;
    document.getElementById('previaTitulo').textContent = titulo || 'Título aparece aqui';
    document.getElementById('previaCorpo').textContent = corpo || 'A mensagem aparece aqui, do jeito que o cliente vai ver.';
}

// Preenche os campos com um modelo pronto — a pessoa ainda pode editar antes de enviar
// ---------- Modelos de notificação — salvos no Firebase, editáveis ----------
// Antes eram 6 botões fixos no HTML, sem jeito de adicionar ou editar de verdade.
// Agora ficam em configuracao/modelosNotificacao — se ainda não existir nada
// salvo (cliente novo, ou antes dessa atualização), usa os 6 de sempre como
// ponto de partida, sem quebrar quem já usava.
const MODELOS_NOTIFICACAO_PADRAO = [
    { titulo: '🍰 Novidade', mensagem: 'Tem novidade no nosso cardápio! Confira agora.' },
    { titulo: '🔥 Promoção', mensagem: '🔥 Aproveite nossa promoção especial de hoje! Faça seu pedido pelo nosso cardápio.' },
    { titulo: '❤️ Sentimos sua falta', mensagem: '❤️ Sentimos sua falta! Que tal pedir novamente aquele seu favorito?' },
    { titulo: '⏰ Estamos atendendo', mensagem: 'Já estamos atendendo! Faça seu pedido pelo nosso cardápio online.' },
    { titulo: '🍓 Produto novo', mensagem: '🍓 Temos uma novidade deliciosa esperando por você. Confira nosso cardápio!' },
    { titulo: '📢 Aviso', mensagem: '📢 Confira nosso horário de atendimento e faça seu pedido.' }
];
let modelosNotificacaoAtuais = MODELOS_NOTIFICACAO_PADRAO;
let modeloEmEdicaoIndex = null;

function escutarModelosNotificacao() {
    db.ref('configuracao/modelosNotificacao').on('value', snap => {
        const val = snap.val();
        modelosNotificacaoAtuais = Array.isArray(val) && val.length > 0 ? val : MODELOS_NOTIFICACAO_PADRAO;
        renderModelosNotificacao();
    });
}

function renderModelosNotificacao() {
    const container = document.getElementById('listaModelosNotificacao');
    if (!container) return;
    container.innerHTML = modelosNotificacaoAtuais.map((m, i) => `
        <div class="opcao-btn" style="display:flex; align-items:center; gap:6px;">
            <span style="cursor:pointer;" onclick="usarModeloNotificacao(${i})">${m.titulo}</span>
            <span style="cursor:pointer;" onclick="editarModeloNotificacao(${i})" title="Editar esse modelo">✏️</span>
            <span style="cursor:pointer;" onclick="excluirModeloNotificacao(${i})" title="Excluir esse modelo">🗑️</span>
        </div>
    `).join('');
}

function usarModeloNotificacao(index) {
    const m = modelosNotificacaoAtuais[index];
    if (!m) return;
    document.getElementById('notifPersonalizadaTitulo').value = m.titulo;
    document.getElementById('notifPersonalizadaCorpo').value = m.mensagem;
    atualizarPreviaNotificacao();
}

function editarModeloNotificacao(index) {
    const m = modelosNotificacaoAtuais[index];
    if (!m) return;
    document.getElementById('notifPersonalizadaTitulo').value = m.titulo;
    document.getElementById('notifPersonalizadaCorpo').value = m.mensagem;
    atualizarPreviaNotificacao();
    modeloEmEdicaoIndex = index;
    const msgEl = document.getElementById('msgModelosNotificacao');
    if (msgEl) msgEl.textContent = `Editando "${m.titulo}" — muda o texto acima e clica em "Salvar" pra atualizar esse modelo.`;
}

function excluirModeloNotificacao(index) {
    const m = modelosNotificacaoAtuais[index];
    if (!m || !confirm(`Excluir o modelo "${m.titulo}"?`)) return;
    const novaLista = modelosNotificacaoAtuais.filter((_, i) => i !== index);
    db.ref('configuracao/modelosNotificacao').set(novaLista)
        .catch(err => alert('Erro ao excluir: ' + err.message));
}

function salvarModeloAtualComoNovo() {
    const titulo = document.getElementById('notifPersonalizadaTitulo').value.trim();
    const mensagem = document.getElementById('notifPersonalizadaCorpo').value.trim();
    const msgEl = document.getElementById('msgModelosNotificacao');
    if (!titulo || !mensagem) { if (msgEl) msgEl.textContent = 'Escreve o título e a mensagem primeiro.'; return; }

    const novaLista = [...modelosNotificacaoAtuais];
    if (modeloEmEdicaoIndex !== null) {
        novaLista[modeloEmEdicaoIndex] = { titulo, mensagem }; // atualiza o modelo que estava sendo editado
    } else {
        novaLista.push({ titulo, mensagem }); // cria um modelo novo
    }

    db.ref('configuracao/modelosNotificacao').set(novaLista)
        .then(() => { if (msgEl) msgEl.textContent = modeloEmEdicaoIndex !== null ? 'Modelo atualizado!' : 'Modelo novo salvo!'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });

    modeloEmEdicaoIndex = null;
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
    gestaoCompleta: { abas: ['gestao'], classesCorpo: ['ocultar-campo-ficha-tecnica'] },
    carrossel: { cards: ['cardDestaquesCarrossel', 'cardBannersCarrossel'] },
    mensagemMassa: { subabasClientesMarketing: ['mensagem-massa'] }
};

function aplicarRecursosLiberados(recursos) {
    // Se o nó "recursosLiberados" nunca foi criado no Firebase desse cliente, trata
    // TUDO como liberado — não quebra quem (como a Brit's) já usava o painel inteiro
    // antes desse recurso existir. Só depois que você criar o nó (mesmo que vazio),
    // cada recurso passa a começar DESLIGADO até você liberar um por um.
    const nuncaConfigurado = recursos == null;

    Object.entries(MAPA_RECURSOS).forEach(([nomeRecurso, alvos]) => {
        const compatibilidadeCarrossel = nomeRecurso === 'carrossel' && recursos && recursos[nomeRecurso] == null;
        const liberado = nuncaConfigurado || compatibilidadeCarrossel || !!recursos[nomeRecurso];

        (alvos.abas || []).forEach(aba => {
            const botao = document.querySelector(`.painel-tab-btn[data-tab="${aba}"]`);
            if (botao) botao.style.display = liberado ? '' : 'none';
        });
        (alvos.subabasGestao || []).forEach(subaba => {
            const botao = document.querySelector(`.gestao-subtab-btn[data-subtab="${subaba}"]`);
            if (botao) botao.style.display = liberado ? '' : 'none';
        });
        (alvos.subabasClientesMarketing || []).forEach(subaba => {
            const raiz = document.querySelector('section[data-tab="clientes-marketing"]');
            if (!raiz) return;
            const botao = raiz.querySelector(`[data-cm-subtab-btn="${subaba}"]`);
            const painel = raiz.querySelector(`[data-cm-subtab="${subaba}"]`);
            if (botao) botao.style.display = liberado ? '' : 'none';
            if (!liberado && painel) painel.classList.remove('active');
            if (!liberado && localStorage.getItem('clientesMarketingSubaba') === subaba) {
                localStorage.setItem('clientesMarketingSubaba', 'clientes');
                mostrarSubabaClientesMarketing('clientes');
            }
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

    let cursor = new Date(dataInicio + 'T12:00:00Z');
    const fim = new Date(dataFim + 'T12:00:00Z');
    while (cursor <= fim) {
        const dataIso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
        datasPendentesDeBloqueio.add(dataIso);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
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
        // As chaves do Firebase já vêm cronológicas (mais antiga primeiro) — inverte
        // pra mostrar os ingredientes cadastrados mais recentemente no topo
        ingredientes = Object.entries(val).map(([id, ing]) => ({ id, ...ing })).reverse();
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
    const busca = normalizarTexto(document.getElementById('buscaIngrediente').value || '');
    const container = document.getElementById('listaIngredientes');
    const filtrados = ingredientes.filter(i => normalizarTexto(i.nome).includes(busca));

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
let editingBaseComponenteIndex = null;

// Troca de sub-aba dentro da mega-aba "Gestão" — mesma lógica das abas
// principais, só que dentro de um container menor (não mexe na URL/localStorage)
function mostrarSubabaGestao(subaba) {
    // Compatibilidade com versões antigas que ainda tinham Backup e Importar separados.
    if (subaba === 'sub-backup' || subaba === 'sub-importar') subaba = 'sub-sistema';

    document.querySelectorAll('.gestao-subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subaba);
    });
    document.querySelectorAll('.gestao-subconteudo').forEach(div => {
        div.style.display = div.dataset.subtabContent === subaba ? 'block' : 'none';
    });
    localStorage.setItem('gestaoSubabaAtiva', subaba);
}

// Lembra a última área usada dentro da Gestão, evitando ter que procurar de novo.
function restaurarSubabaGestao() {
    const salva = localStorage.getItem('gestaoSubabaAtiva');
    const alvo = salva && document.querySelector(`.gestao-subtab-btn[data-subtab="${salva}"]`)
        ? salva
        : 'sub-ingredientes';
    mostrarSubabaGestao(alvo);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restaurarSubabaGestao, { once: true });
} else {
    restaurarSubabaGestao();
}

function escutarBases() {
    db.ref('bases').on('value', snap => {
        const val = snap.val() || {};
        // Mesma lógica de Ingredientes/Ficha Técnica/Produtos — mais recente no topo
        bases = Object.entries(val).map(([id, b]) => ({ id, ...b })).reverse();
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
    (base.componentes || []).forEach(c => {
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

function escaparHtmlBaseComponente(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function listarComponentesDisponiveisBase() {
    const outrasBases = bases.filter(b => b.id !== editingBaseId);
    return [
        ...ingredientes.map(item => ({
            valor: `ingrediente_${item.id}`,
            tipo: 'Ingrediente',
            nome: item.nome || '',
            detalhe: item.unidade || ''
        })),
        ...outrasBases.map(item => ({
            valor: `base_${item.id}`,
            tipo: 'Base',
            nome: item.nome || '',
            detalhe: item.unidadeRendimento || item.unidade || ''
        }))
    ];
}

function buscarComponentesBase(termo) {
    const filtro = normalizarTexto(termo || '');
    const itens = listarComponentesDisponiveisBase();

    // Busca por trecho em qualquer posição do nome: início, meio ou fim.
    // normalizarTexto mantém a busca indiferente a acentos e maiúsculas/minúsculas.
    if (!filtro) return itens;
    return itens.filter(item => normalizarTexto(item.nome).includes(filtro));
}

function popularSelectComponenteBase() {
    const sel = document.getElementById('selectIngredienteBase');
    if (!sel) return;

    const valorAtual = sel.value;
    const itens = listarComponentesDisponiveisBase();

    sel.innerHTML = '<option value=""></option>' + itens
        .map(item => `<option value="${escaparHtmlBaseComponente(item.valor)}">${escaparHtmlBaseComponente(item.nome)}</option>`)
        .join('');

    if ([...sel.options].some(opt => opt.value === valorAtual)) {
        sel.value = valorAtual;
    } else {
        sel.value = '';
    }

    const buscaEl = document.getElementById('buscaComponenteBase');
    if (buscaEl && buscaEl.getAttribute('aria-expanded') === 'true') {
        renderResultadosBuscaComponenteBase();
    }
}

function renderResultadosBuscaComponenteBase() {
    const buscaEl = document.getElementById('buscaComponenteBase');
    const resultadosEl = document.getElementById('resultadosComponenteBase');
    if (!buscaEl || !resultadosEl) return;

    const itens = buscarComponentesBase(buscaEl.value);

    if (!itens.length) {
        resultadosEl.innerHTML = `
            <div class="bases-componente-vazio">
                Nenhum ingrediente ou base encontrado para
                <strong>"${escaparHtmlBaseComponente(buscaEl.value)}"</strong>.
            </div>
        `;
    } else {
        const ingredientesEncontrados = itens.filter(item => item.tipo === 'Ingrediente');
        const basesEncontradas = itens.filter(item => item.tipo === 'Base');

        const renderGrupo = (titulo, grupo) => {
            if (!grupo.length) return '';
            return `
                <div class="bases-componente-grupo">
                    <div class="bases-componente-grupo-titulo">${titulo}</div>
                    ${grupo.map(item => `
                        <button
                            type="button"
                            class="bases-componente-resultado"
                            role="option"
                            onclick="selecionarComponenteBuscaBase('${escaparHtmlBaseComponente(item.valor)}')"
                        >
                            <span class="bases-componente-resultado-nome">${escaparHtmlBaseComponente(item.nome)}</span>
                            ${item.detalhe ? `<small>${escaparHtmlBaseComponente(item.detalhe)}</small>` : ''}
                        </button>
                    `).join('')}
                </div>
            `;
        };

        resultadosEl.innerHTML =
            renderGrupo('Ingredientes', ingredientesEncontrados) +
            renderGrupo('Bases', basesEncontradas);
    }

    resultadosEl.hidden = false;
    buscaEl.setAttribute('aria-expanded', 'true');
}

function abrirBuscaComponenteBase() {
    renderResultadosBuscaComponenteBase();
}

function fecharBuscaComponenteBase() {
    const buscaEl = document.getElementById('buscaComponenteBase');
    const resultadosEl = document.getElementById('resultadosComponenteBase');
    if (resultadosEl) resultadosEl.hidden = true;
    if (buscaEl) buscaEl.setAttribute('aria-expanded', 'false');
}

function filtrarComponenteBase() {
    const sel = document.getElementById('selectIngredienteBase');
    if (sel) sel.value = '';
    renderResultadosBuscaComponenteBase();
}

function selecionarComponenteBuscaBase(valor) {
    const sel = document.getElementById('selectIngredienteBase');
    const buscaEl = document.getElementById('buscaComponenteBase');
    const item = listarComponentesDisponiveisBase().find(comp => comp.valor === valor);
    if (!sel || !buscaEl || !item) return;

    sel.value = valor;
    buscaEl.value = item.nome;
    fecharBuscaComponenteBase();

    const qtdEl = document.getElementById('qtdComponenteBase');
    if (qtdEl) qtdEl.focus();
}

function limparBuscaComponenteBase() {
    const sel = document.getElementById('selectIngredienteBase');
    const buscaEl = document.getElementById('buscaComponenteBase');
    if (sel) sel.value = '';
    if (buscaEl) {
        buscaEl.value = '';
        buscaEl.focus();
    }
    renderResultadosBuscaComponenteBase();
}

function tecladoBuscaComponenteBase(event) {
    if (!event) return;

    if (event.key === 'Escape') {
        fecharBuscaComponenteBase();
        event.currentTarget.blur();
        return;
    }

    if (event.key !== 'Enter') return;

    const sel = document.getElementById('selectIngredienteBase');
    if (sel && sel.value) return;

    const buscaEl = document.getElementById('buscaComponenteBase');
    const primeiro = buscarComponentesBase(buscaEl ? buscaEl.value : '')[0];
    if (!primeiro) return;

    event.preventDefault();
    selecionarComponenteBuscaBase(primeiro.valor);
}

if (!window.__baseBuscaComponenteClickFora) {
    document.addEventListener('click', event => {
        const picker = document.getElementById('baseComponenteCombobox');
        if (picker && !picker.contains(event.target)) {
            fecharBuscaComponenteBase();
        }
    });
    window.__baseBuscaComponenteClickFora = true;
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

    tempBaseComponentes.push({
        tipo: tipoRaw === 'base' ? 'base' : 'ingrediente',
        id: compId,
        quantidade: qtd
    });

    document.getElementById('qtdComponenteBase').value = '';
    document.getElementById('selectIngredienteBase').value = '';

    const buscaEl = document.getElementById('buscaComponenteBase');
    if (buscaEl) buscaEl.value = '';

    popularSelectComponenteBase();
    fecharBuscaComponenteBase();
    renderTempBaseComponentes();
}

function editarComponenteBase(i) {
    if (!tempBaseComponentes[i]) return;
    editingBaseComponenteIndex = i;
    renderTempBaseComponentes();

    const input = document.querySelector(`[data-base-editar-qtd="${i}"]`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelarEdicaoComponenteBase() {
    editingBaseComponenteIndex = null;
    renderTempBaseComponentes();
}

function salvarEdicaoComponenteBase(i) {
    const componente = tempBaseComponentes[i];
    const input = document.querySelector(`[data-base-editar-qtd="${i}"]`);
    if (!componente || !input) return;

    const qtd = parseFloat(String(input.value || '').replace(',', '.'));
    if (!qtd || qtd <= 0) {
        alert('Informa uma quantidade válida.');
        input.focus();
        return;
    }

    componente.quantidade = qtd;
    editingBaseComponenteIndex = null;
    renderTempBaseComponentes();
}

function removerComponenteBase(i) {
    tempBaseComponentes.splice(i, 1);

    if (editingBaseComponenteIndex === i) {
        editingBaseComponenteIndex = null;
    } else if (editingBaseComponenteIndex != null && editingBaseComponenteIndex > i) {
        editingBaseComponenteIndex--;
    }

    renderTempBaseComponentes();
}

function renderTempBaseComponentes() {
    const div = document.getElementById('listaComponentesBase');
    div.innerHTML = '';
    let total = 0;

    tempBaseComponentes.forEach((c, i) => {
        let nome = '', custo = 0, unidade = '';
        const baseId = idBaseComponente(c);

        if (baseId) {
            const b = getBase(baseId);
            if (b) {
                const { custoPorUnidade } = calcularBase(b);
                nome = b.nome + ' (base)';
                custo = custoPorUnidade * c.quantidade;
                unidade = b.unidadeRendimento;
            } else {
                nome = '(base removida)';
            }
        } else {
            const ing = ingredientes.find(x => x.id === idIngredienteComponente(c));
            if (ing) {
                nome = ing.nome;
                custo = custoUnitIngrediente(ing) * c.quantidade;
                unidade = ing.unidade;
            } else {
                nome = '(removido)';
            }
        }

        total += custo;

        const linha = document.createElement('div');
        linha.className = 'bases-componente-linha';

        if (editingBaseComponenteIndex === i) {
            linha.classList.add('is-editing');
            linha.innerHTML = `
                <div class="bases-componente-info">
                    <strong>${escaparHtmlBaseComponente(nome)}</strong>
                    <small>Custo atual: ${formatarPreco(custo)}</small>
                </div>
                <div class="bases-componente-edicao">
                    <label>Quantidade (${escaparHtmlBaseComponente(unidade || 'un')})</label>
                    <input
                        type="text"
                        inputmode="decimal"
                        value="${c.quantidade}"
                        data-base-editar-qtd="${i}"
                        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); salvarEdicaoComponenteBase(${i}); } else if(event.key === 'Escape'){ cancelarEdicaoComponenteBase(); }"
                    >
                </div>
                <div class="bases-componente-acoes">
                    <button type="button" class="btn-secondary bases-btn-salvar-componente" onclick="salvarEdicaoComponenteBase(${i})">✓ Aplicar</button>
                    <button type="button" class="btn-secondary bases-btn-cancelar-componente" onclick="cancelarEdicaoComponenteBase()">Cancelar</button>
                </div>
            `;
        } else {
            linha.innerHTML = `
                <span class="bases-componente-resumo">
                    ${escaparHtmlBaseComponente(nome)} — <strong>${c.quantidade}${escaparHtmlBaseComponente(unidade)}</strong> = ${formatarPreco(custo)}
                </span>
                <div class="bases-componente-acoes">
                    <button type="button" class="btn-secondary bases-btn-editar-componente" onclick="editarComponenteBase(${i})">✏️ Editar</button>
                    <button type="button" class="btn-excluir-cupom" title="Excluir componente" onclick="removerComponenteBase(${i})">🗑️</button>
                </div>
            `;
        }

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
        editingBaseComponenteIndex = null;
        document.getElementById('baseNome').value = '';
        document.getElementById('baseRendimento').value = '';
        const buscaBaseEl = document.getElementById('buscaComponenteBase');
        if (buscaBaseEl) buscaBaseEl.value = '';
        const selectBaseEl = document.getElementById('selectIngredienteBase');
        if (selectBaseEl) selectBaseEl.value = '';
        fecharBuscaComponenteBase();
        renderTempBaseComponentes();
        if (editingBaseId) {
            editingBaseId = null;
            document.getElementById('btnSalvarBase').textContent = 'Salvar Base';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

function renderBases() {
    const buscaEl = document.getElementById('baseBusca');
    const busca = normalizarTexto(buscaEl ? buscaEl.value : '');
    const container = document.getElementById('listaBases');
    const filtradas = bases.filter(b => normalizarTexto(b.nome).includes(busca));

    if (filtradas.length === 0) {
        container.innerHTML = busca
            ? '<p class="dica-secao">Nenhuma base encontrada.</p>'
            : '<p class="dica-secao">Nenhuma base cadastrada ainda.</p>';
        return;
    }

    container.innerHTML = filtradas.map(b => {
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
    tempBaseComponentes = (b.componentes || []).map(c => ({ ...c }));
    editingBaseId = id;
    editingBaseComponenteIndex = null;
    document.getElementById('btnSalvarBase').textContent = 'Atualizar Base';
    const buscaBaseEl = document.getElementById('buscaComponenteBase');
    if (buscaBaseEl) buscaBaseEl.value = '';
    popularSelectComponenteBase();
    fecharBuscaComponenteBase();
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
let editingFichaTecnicaComponenteIndex = null;

function escutarFichaTecnica() {
    db.ref('fichaTecnica').on('value', snap => {
        const val = snap.val() || {};
        // As chaves do Firebase já vêm em ordem cronológica crescente (mais antiga
        // primeiro) — inverte pra mostrar as fichas técnicas criadas mais recentemente
        // no topo da lista, sem precisar de um campo de data separado
        fichaTecnica = Object.entries(val).map(([id, p]) => ({ id, ...p })).reverse();
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
    // Proteção: se por algum motivo essa ficha técnica não tiver "componentes" (undefined),
    // trata como lista vazia em vez de travar — isso já travou o painel inteiro, já que
    // esse cálculo roda logo no carregamento inicial da tela.
    (produto.componentes || []).forEach(c => {
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

    // Peso final — soma só os componentes em g/ml (peso/volume de verdade); "un"
    // costuma ser embalagem (forminha, potinho, adesivo), que não pesa a receita.
    // ml tratado como equivalente a g (prática comum em receita — água/líquidos ~1g/ml).
    const pesoTotalReceita = arred(detalhes
        .filter(d => d.unidade === 'g' || d.unidade === 'ml')
        .reduce((soma, d) => soma + d.quantidade, 0));
    const pesoPorUnidade = produto.rendimento > 0 ? arred(pesoTotalReceita / produto.rendimento) : 0;

    return {
        custoComponentes, custoMaoObra, custoTotalReceita, custoUnitarioReceita, custoUnitarioFinal,
        precoVenda, precoVendaCalculado, temPrecoManual, margemRealPercent, lucroLiquido, lucroEmpresa, lucroCasal,
        pesoTotalReceita, pesoPorUnidade,
        detalhes
    };
}

function escaparHtmlFichaTecnica(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function listarComponentesDisponiveisFichaTecnica() {
    return [
        ...ingredientes.map(item => ({
            valor: `ingrediente_${item.id}`,
            tipo: 'Ingrediente',
            nome: item.nome || '',
            detalhe: item.unidade || ''
        })),
        ...bases.map(item => ({
            valor: `base_${item.id}`,
            tipo: 'Base',
            nome: item.nome || '',
            detalhe: item.unidadeRendimento || item.unidade || ''
        }))
    ];
}

function buscarComponentesFichaTecnica(termo) {
    const filtro = normalizarTexto(termo || '');
    const itens = listarComponentesDisponiveisFichaTecnica();

    // "includes" procura o trecho em qualquer posição do nome:
    // início, meio ou fim. normalizarTexto também ignora maiúsculas/minúsculas e acentos.
    if (!filtro) return itens;
    return itens.filter(item => normalizarTexto(item.nome).includes(filtro));
}

function popularSelectComponenteFichaTecnica() {
    const sel = document.getElementById('ftSelectComponente');
    if (!sel) return;

    const valorAtual = sel.value;
    const itens = listarComponentesDisponiveisFichaTecnica();

    sel.innerHTML = '<option value=""></option>' + itens
        .map(item => `<option value="${escaparHtmlFichaTecnica(item.valor)}">${escaparHtmlFichaTecnica(item.nome)}</option>`)
        .join('');

    if ([...sel.options].some(opt => opt.value === valorAtual)) {
        sel.value = valorAtual;
    } else {
        sel.value = '';
    }

    const buscaEl = document.getElementById('ftBuscaComponente');
    if (buscaEl && buscaEl.getAttribute('aria-expanded') === 'true') {
        renderResultadosBuscaComponenteFichaTecnica();
    }
}

function renderResultadosBuscaComponenteFichaTecnica() {
    const buscaEl = document.getElementById('ftBuscaComponente');
    const resultadosEl = document.getElementById('ftResultadosComponente');
    if (!buscaEl || !resultadosEl) return;

    const itens = buscarComponentesFichaTecnica(buscaEl.value);
    if (!itens.length) {
        resultadosEl.innerHTML = `
            <div class="ficha-tecnica-componente-vazio">
                Nenhuma base ou ingrediente encontrado para
                <strong>"${escaparHtmlFichaTecnica(buscaEl.value)}"</strong>.
            </div>
        `;
    } else {
        const ingredientesEncontrados = itens.filter(item => item.tipo === 'Ingrediente');
        const basesEncontradas = itens.filter(item => item.tipo === 'Base');

        const renderGrupo = (titulo, grupo) => {
            if (!grupo.length) return '';
            return `
                <div class="ficha-tecnica-componente-grupo">
                    <div class="ficha-tecnica-componente-grupo-titulo">${titulo}</div>
                    ${grupo.map(item => `
                        <button
                            type="button"
                            class="ficha-tecnica-componente-resultado"
                            role="option"
                            onclick="selecionarComponenteBuscaFichaTecnica('${escaparHtmlFichaTecnica(item.valor)}')"
                        >
                            <span class="ficha-tecnica-componente-resultado-nome">${escaparHtmlFichaTecnica(item.nome)}</span>
                            ${item.detalhe ? `<small>${escaparHtmlFichaTecnica(item.detalhe)}</small>` : ''}
                        </button>
                    `).join('')}
                </div>
            `;
        };

        resultadosEl.innerHTML =
            renderGrupo('Ingredientes', ingredientesEncontrados) +
            renderGrupo('Bases', basesEncontradas);
    }

    resultadosEl.hidden = false;
    buscaEl.setAttribute('aria-expanded', 'true');
}

function abrirBuscaComponenteFichaTecnica() {
    renderResultadosBuscaComponenteFichaTecnica();
}

function fecharBuscaComponenteFichaTecnica() {
    const buscaEl = document.getElementById('ftBuscaComponente');
    const resultadosEl = document.getElementById('ftResultadosComponente');
    if (resultadosEl) resultadosEl.hidden = true;
    if (buscaEl) buscaEl.setAttribute('aria-expanded', 'false');
}

function filtrarSelectComponenteFichaTecnica() {
    const sel = document.getElementById('ftSelectComponente');
    if (sel) sel.value = '';
    renderResultadosBuscaComponenteFichaTecnica();
}

function selecionarComponenteBuscaFichaTecnica(valor) {
    const sel = document.getElementById('ftSelectComponente');
    const buscaEl = document.getElementById('ftBuscaComponente');
    const item = listarComponentesDisponiveisFichaTecnica().find(comp => comp.valor === valor);
    if (!sel || !buscaEl || !item) return;

    sel.value = valor;
    buscaEl.value = item.nome;
    fecharBuscaComponenteFichaTecnica();

    const qtdEl = document.getElementById('ftQtdComponente');
    if (qtdEl) qtdEl.focus();
}

function limparBuscaComponenteFichaTecnica() {
    const sel = document.getElementById('ftSelectComponente');
    const buscaEl = document.getElementById('ftBuscaComponente');
    if (sel) sel.value = '';
    if (buscaEl) {
        buscaEl.value = '';
        buscaEl.focus();
    }
    renderResultadosBuscaComponenteFichaTecnica();
}

function tecladoBuscaComponenteFichaTecnica(event) {
    if (!event) return;

    if (event.key === 'Escape') {
        fecharBuscaComponenteFichaTecnica();
        event.currentTarget.blur();
        return;
    }

    if (event.key !== 'Enter') return;

    const sel = document.getElementById('ftSelectComponente');
    if (sel && sel.value) return;

    const buscaEl = document.getElementById('ftBuscaComponente');
    const primeiro = buscarComponentesFichaTecnica(buscaEl ? buscaEl.value : '')[0];
    if (!primeiro) return;

    event.preventDefault();
    selecionarComponenteBuscaFichaTecnica(primeiro.valor);
}

if (!window.__fichaTecnicaBuscaComponenteClickFora) {
    document.addEventListener('click', event => {
        const picker = document.getElementById('ftComponenteCombobox');
        if (picker && !picker.contains(event.target)) {
            fecharBuscaComponenteFichaTecnica();
        }
    });
    window.__fichaTecnicaBuscaComponenteClickFora = true;
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
    document.getElementById('ftSelectComponente').value = '';
    const buscaEl = document.getElementById('ftBuscaComponente');
    if (buscaEl) buscaEl.value = '';
    popularSelectComponenteFichaTecnica();
    fecharBuscaComponenteFichaTecnica();
    renderTempComponentesFichaTecnica();
}

function editarComponenteFichaTecnica(i) {
    if (!tempFichaTecnicaComponentes[i]) return;
    editingFichaTecnicaComponenteIndex = i;
    renderTempComponentesFichaTecnica();
    const input = document.querySelector(`[data-ft-editar-qtd="${i}"]`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelarEdicaoComponenteFichaTecnica() {
    editingFichaTecnicaComponenteIndex = null;
    renderTempComponentesFichaTecnica();
}

function salvarEdicaoComponenteFichaTecnica(i) {
    const componente = tempFichaTecnicaComponentes[i];
    const input = document.querySelector(`[data-ft-editar-qtd="${i}"]`);
    if (!componente || !input) return;

    const qtd = parseFloat(String(input.value || '').replace(',', '.'));
    if (!qtd || qtd <= 0) {
        alert('Informa uma quantidade válida.');
        input.focus();
        return;
    }

    componente.quantidade = qtd;
    editingFichaTecnicaComponenteIndex = null;
    renderTempComponentesFichaTecnica();
}

function removerComponenteFichaTecnica(i) {
    tempFichaTecnicaComponentes.splice(i, 1);
    if (editingFichaTecnicaComponenteIndex === i) editingFichaTecnicaComponenteIndex = null;
    else if (editingFichaTecnicaComponenteIndex != null && editingFichaTecnicaComponenteIndex > i) editingFichaTecnicaComponenteIndex--;
    renderTempComponentesFichaTecnica();
}

function renderTempComponentesFichaTecnica() {
    const div = document.getElementById('ftListaComponentes');
    div.innerHTML = '';
    let total = 0;
    let pesoTotal = 0;
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
        // Peso final — soma só g/ml (peso/volume de verdade); "un" costuma ser
        // embalagem (forminha, potinho, adesivo), que não pesa a receita
        if (unidade === 'g' || unidade === 'ml') pesoTotal += c.quantidade;
        const linha = document.createElement('div');
        linha.className = 'ficha-tecnica-componente-linha';

        if (editingFichaTecnicaComponenteIndex === i) {
            linha.classList.add('is-editing');
            linha.innerHTML = `
                <div class="ficha-tecnica-componente-info">
                    <strong>${nome}</strong>
                    <small>Custo atual: ${formatarPreco(custo)}</small>
                </div>
                <div class="ficha-tecnica-componente-edicao">
                    <label>Quantidade (${unidade || 'un'})</label>
                    <input type="text" inputmode="decimal" value="${c.quantidade}" data-ft-editar-qtd="${i}"
                        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); salvarEdicaoComponenteFichaTecnica(${i}); } else if(event.key === 'Escape'){ cancelarEdicaoComponenteFichaTecnica(); }">
                </div>
                <div class="ficha-tecnica-componente-acoes">
                    <button type="button" class="btn-secondary ficha-tecnica-btn-salvar-componente" onclick="salvarEdicaoComponenteFichaTecnica(${i})">✓ Aplicar</button>
                    <button type="button" class="btn-secondary ficha-tecnica-btn-cancelar-componente" onclick="cancelarEdicaoComponenteFichaTecnica()">Cancelar</button>
                </div>`;
        } else {
            linha.innerHTML = `
                <span class="ficha-tecnica-componente-resumo">${nome} — <strong>${c.quantidade}${unidade}</strong> = ${formatarPreco(custo)}</span>
                <div class="ficha-tecnica-componente-acoes">
                    <button type="button" class="btn-secondary ficha-tecnica-btn-editar-componente" onclick="editarComponenteFichaTecnica(${i})">✏️ Editar</button>
                    <button type="button" class="btn-excluir-cupom" title="Excluir componente" onclick="removerComponenteFichaTecnica(${i})">🗑️</button>
                </div>`;
        }
        div.appendChild(linha);
    });
    document.getElementById('ftCustoComponentesTemp').textContent = formatarPreco(total);
    const pesoEl = document.getElementById('ftPesoTotalTemp');
    if (pesoEl) pesoEl.textContent = arred(pesoTotal) + 'g';
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

    // Precisa do ID ANTES de montar a prévia pós-salvamento — sem isso, os botões de
    // "preço redondo" dessa prévia ficavam com id "undefined" (literalmente a palavra),
    // e clicar neles criava uma ficha técnica fantasma com esse nome no Firebase.
    const idParaSalvar = editingFichaTecnicaId || db.ref('fichaTecnica').push().key;
    const promessa = db.ref('fichaTecnica/' + idParaSalvar).update(obj);

    promessa.then(() => {
        msgEl.textContent = 'Salvo!';
        document.getElementById('ftResultado').innerHTML = montarResultadoFichaTecnica({ id: idParaSalvar, ...obj });
        tempFichaTecnicaComponentes = [];
        editingFichaTecnicaComponenteIndex = null;
        ['ftNome', 'ftRendimento', 'ftEmbalagem', 'ftCustoFixo', 'ftHoras', 'ftValorHora', 'ftMargemEmpresa', 'ftMargemCasal', 'ftTaxaVenda', 'ftPrecoManual'].forEach(id => document.getElementById(id).value = '');
        renderTempComponentesFichaTecnica();
        if (editingFichaTecnicaId) {
            editingFichaTecnicaId = null;
            document.getElementById('btnSalvarFichaTecnica').textContent = 'Calcular e Salvar';
        }
    }).catch(err => { msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Sugere preços redondos perto do calculado (arredondando de 0,50 em 0,50 e de 1 em 1)
function sugestoesPrecoRedondo(precoBase) {
    const candidatos = new Set([
        Math.floor(precoBase * 2) / 2,
        Math.ceil(precoBase * 2) / 2,
        Math.floor(precoBase),
        Math.ceil(precoBase)
    ]);
    return [...candidatos].filter(v => v > 0 && Math.abs(v - precoBase) > 0.001).sort((a, b) => a - b);
}

// Simula o lucro/margem SE vendesse por um preço de teste, sem alterar nada salvo
function preverComPreco(produto, precoTeste) {
    const r = calcularCustoFichaTecnica(produto);
    const taxaVenda = (produto.taxaVenda || 0) / 100;
    const valorTaxa = arred(precoTeste * taxaVenda);
    const lucroLiquido = arred(precoTeste - r.custoUnitarioFinal - valorTaxa);
    const margemReal = precoTeste > 0 ? Math.round((lucroLiquido / precoTeste) * 10000) / 100 : 0;
    return { lucroLiquido, margemReal };
}

async function definirPrecoVendaManualFT(id, valor) {
    await db.ref('fichaTecnica/' + id + '/precoVendaManual').set(valor > 0 ? arred(valor) : null);
}
async function limparPrecoVendaManualFT(id) { await definirPrecoVendaManualFT(id, null); }

function montarResultadoFichaTecnica(produto) {
    const r = calcularCustoFichaTecnica(produto);
    const sugestoes = sugestoesPrecoRedondo(r.precoVendaCalculado);
    const botoesSugestao = sugestoes.map(preco => {
        const prev = preverComPreco(produto, preco);
        const cor = prev.lucroLiquido >= 0 ? '#1e6b34' : '#c0392b';
        return `<button type="button" class="btn-secondary" style="margin:4px 6px 0 0; font-size:0.8em;" onclick="definirPrecoVendaManualFT('${produto.id}', ${preco})">
            ${formatarPreco(preco)} <span style="color:${cor};">(lucro ${formatarPreco(prev.lucroLiquido)} · ${prev.margemReal}%)</span>
        </button>`;
    }).join('');

    return `
        <div class="pedido-card">
            <p>Peso total da receita: <strong>${r.pesoTotalReceita}g</strong> · Peso por unidade: <strong>${r.pesoPorUnidade}g</strong></p>
            <p>Custo total da receita: <strong>${formatarPreco(r.custoTotalReceita)}</strong></p>
            <p>Custo unitário final: <strong>${formatarPreco(r.custoUnitarioFinal)}</strong></p>
            <p>Preço calculado pelas margens: <strong>${formatarPreco(r.precoVendaCalculado)}</strong></p>
            <p>💰 Preço de venda ${r.temPrecoManual ? '(fixado manualmente)' : '(sugerido)'}: <strong>${formatarPreco(r.precoVenda)}</strong></p>
            <p>Lucro líquido/un.: <strong>${formatarPreco(r.lucroLiquido)}</strong> (${r.margemRealPercent}%)</p>
            <p>Empresa: ${formatarPreco(r.lucroEmpresa)} · Pró-labore: ${formatarPreco(r.lucroCasal)}</p>
            ${sugestoes.length ? `
                <div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border);">
                    <p class="dica-secao"><strong>💡 Preços redondos por perto</strong> — clica pra fixar e ver o lucro real na hora:</p>
                    ${botoesSugestao}
                </div>` : ''}
            ${r.temPrecoManual ? `<button type="button" class="btn-secondary" style="margin-top:10px;" onclick="limparPrecoVendaManualFT('${produto.id}')">↺ Voltar a usar o preço calculado</button>` : ''}
        </div>
    `;
}

function renderFichaTecnica() {
    const busca = normalizarTexto(document.getElementById('ftBusca').value || '');
    const container = document.getElementById('ftListaProdutos');
    const filtrados = fichaTecnica.filter(p => normalizarTexto(p.nome).includes(busca));

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="dica-secao">Nenhuma ficha técnica cadastrada ainda.</p>';
        return;
    }

    container.innerHTML = filtrados.map(p => {
        const r = calcularCustoFichaTecnica(p);
        const cmv = r.precoVenda > 0 ? ((r.custoUnitarioFinal / r.precoVenda) * 100).toFixed(1) : '0';
        const produtosAtuais = Object.values(ultimoValProdutosAdmin || {});
        const jaMigrado = produtosAtuais.some(prod => prod.fichaTecnicaId === p.id);
        return `
            <div class="pedido-card" style="margin-top:8px;">
                <strong>${p.nome}</strong> ${jaMigrado ? '<span class="pedido-tag tag-status-entregue">✅ Já está no site</span>' : ''}
                <p style="margin:4px 0; font-size:0.85em; color:var(--muted);">
                    Rendimento: ${p.rendimento}un · Custo/un.: ${formatarPreco(r.custoUnitarioFinal)} · Preço: ${formatarPreco(r.precoVenda)} · CMV: ${cmv}%
                </p>
                <button class="btn-secondary" onclick="editarFichaTecnica('${p.id}')">✏️ Editar</button>
                ${jaMigrado ? '' : `<button class="btn-secondary" onclick="migrarFichaTecnicaParaProduto('${p.id}')">🚀 Migrar pro site</button>`}                <button class="btn-excluir-cupom" onclick="excluirFichaTecnica('${p.id}')">🗑️</button>
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
    tempFichaTecnicaComponentes = (p.componentes || []).map(c => ({ ...c }));
    editingFichaTecnicaComponenteIndex = null;
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
function escaparHtmlEstoqueIngrediente(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buscarIngredientesEstoque(termo) {
    const filtro = normalizarTexto(termo || '');
    if (!filtro) return [...ingredientes];

    // Procura o texto em qualquer posição do nome: início, meio ou fim.
    // normalizarTexto deixa a busca indiferente a acentos e maiúsculas/minúsculas.
    return ingredientes.filter(item => normalizarTexto(item.nome || '').includes(filtro));
}

function popularSelectEstoqueIngrediente() {
    const sel = document.getElementById('estSelectIngrediente');
    if (!sel) return;

    const valorAtual = sel.value;
    sel.innerHTML = '<option value=""></option>' + ingredientes
        .map(item => `<option value="${escaparHtmlEstoqueIngrediente(item.id)}">${escaparHtmlEstoqueIngrediente(item.nome || '')}</option>`)
        .join('');

    if ([...sel.options].some(opt => opt.value === valorAtual)) {
        sel.value = valorAtual;
    } else {
        sel.value = '';
    }

    const buscaEl = document.getElementById('estBuscaIngrediente');
    if (buscaEl && buscaEl.getAttribute('aria-expanded') === 'true') {
        renderResultadosBuscaIngredienteEstoque();
    }
}

function renderResultadosBuscaIngredienteEstoque() {
    const buscaEl = document.getElementById('estBuscaIngrediente');
    const resultadosEl = document.getElementById('estResultadosIngrediente');
    if (!buscaEl || !resultadosEl) return;

    const itens = buscarIngredientesEstoque(buscaEl.value);

    if (!itens.length) {
        resultadosEl.innerHTML = `
            <div class="estoque-ingrediente-vazio">
                Nenhum ingrediente encontrado para
                <strong>"${escaparHtmlEstoqueIngrediente(buscaEl.value)}"</strong>.
            </div>
        `;
    } else {
        resultadosEl.innerHTML = itens.map(item => `
            <button
                type="button"
                class="estoque-ingrediente-resultado"
                role="option"
                onclick="selecionarIngredienteBuscaEstoque('${escaparHtmlEstoqueIngrediente(item.id)}')"
            >
                <span class="estoque-ingrediente-resultado-info">
                    <strong>${escaparHtmlEstoqueIngrediente(item.nome || '')}</strong>
                    <small>
                        Estoque: ${Number(item.estoqueAtual || 0).toFixed(2)} ${escaparHtmlEstoqueIngrediente(item.unidade || '')}
                        · mínimo: ${Number(item.estoqueMinimo || 0).toFixed(2)} ${escaparHtmlEstoqueIngrediente(item.unidade || '')}
                    </small>
                </span>
                <span class="estoque-ingrediente-resultado-unidade">${escaparHtmlEstoqueIngrediente(item.unidade || '')}</span>
            </button>
        `).join('');
    }

    resultadosEl.hidden = false;
    buscaEl.setAttribute('aria-expanded', 'true');
}

function abrirBuscaIngredienteEstoque() {
    renderResultadosBuscaIngredienteEstoque();
}

function fecharBuscaIngredienteEstoque() {
    const buscaEl = document.getElementById('estBuscaIngrediente');
    const resultadosEl = document.getElementById('estResultadosIngrediente');
    if (resultadosEl) resultadosEl.hidden = true;
    if (buscaEl) buscaEl.setAttribute('aria-expanded', 'false');
}

function filtrarIngredienteEstoque() {
    const sel = document.getElementById('estSelectIngrediente');
    if (sel) sel.value = '';
    renderResultadosBuscaIngredienteEstoque();
}

function selecionarIngredienteBuscaEstoque(id) {
    const sel = document.getElementById('estSelectIngrediente');
    const buscaEl = document.getElementById('estBuscaIngrediente');
    const item = ingredientes.find(ing => String(ing.id) === String(id));
    if (!sel || !buscaEl || !item) return;

    sel.value = String(item.id);
    buscaEl.value = item.nome || '';
    fecharBuscaIngredienteEstoque();

    const qtdEl = document.getElementById('estQtdEntrada');
    if (qtdEl) qtdEl.focus();
}

function limparBuscaIngredienteEstoque() {
    const sel = document.getElementById('estSelectIngrediente');
    const buscaEl = document.getElementById('estBuscaIngrediente');

    if (sel) sel.value = '';
    if (buscaEl) {
        buscaEl.value = '';
        buscaEl.focus();
    }

    renderResultadosBuscaIngredienteEstoque();
}

function tecladoBuscaIngredienteEstoque(event) {
    if (!event) return;

    if (event.key === 'Escape') {
        fecharBuscaIngredienteEstoque();
        event.currentTarget.blur();
        return;
    }

    if (event.key !== 'Enter') return;

    const sel = document.getElementById('estSelectIngrediente');
    if (sel && sel.value) return;

    const buscaEl = document.getElementById('estBuscaIngrediente');
    const primeiro = buscarIngredientesEstoque(buscaEl ? buscaEl.value : '')[0];
    if (!primeiro) return;

    event.preventDefault();
    selecionarIngredienteBuscaEstoque(primeiro.id);
}

if (!window.__estoqueBuscaIngredienteClickFora) {
    document.addEventListener('click', event => {
        const picker = document.getElementById('estoqueIngredienteCombobox');
        if (picker && !picker.contains(event.target)) {
            fecharBuscaIngredienteEstoque();
        }
    });
    window.__estoqueBuscaIngredienteClickFora = true;
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
        const buscaEstoqueEl = document.getElementById('estBuscaIngrediente');
        if (buscaEstoqueEl) buscaEstoqueEl.value = '';
        const selectEstoqueEl = document.getElementById('estSelectIngrediente');
        if (selectEstoqueEl) selectEstoqueEl.value = '';
        fecharBuscaIngredienteEstoque();
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

    // Telefone é a identidade principal do cliente. A comparação usa a chave canônica
    // (só DDD + número), então máscara, espaços, hífen ou +55 não criam outro cadastro.
    // Se o mesmo telefone já pertence a outro registro, bloqueia uma nova duplicata.
    const telefoneChave = normalizarTelefoneClienteBrasil(telefone);
    if (telefoneChave) {
        const mesmoTelefone = clientesGestao.find(c =>
            c.id !== editingClienteGestaoId &&
            normalizarTelefoneClienteBrasil(c.telefone) === telefoneChave
        );
        if (mesmoTelefone) {
            msgEl.textContent = `Esse telefone já está cadastrado para ${mesmoTelefone.nome || 'outro cliente'}. Edite o cadastro existente em vez de criar outro.`;
            return;
        }
    }

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

// Monta a lista de botões "enviar" pro WhatsApp, um por cliente com telefone
// cadastrado — o WhatsApp não permite envio em massa de graça, então isso é o
// jeito prático: cada clique abre o WhatsApp já com a mensagem pronta, só falta
// apertar enviar lá. Marca quem já foi "enviado" (guardado no navegador, só
// pra ajudar a não perder onde parou — não é enviado de verdade sozinho)
// ---------- Mensagem em Massa — campanhas salvas no Firebase ----------
// Antes, o controle de "quem já recebeu" ficava só no localStorage (sumia se trocasse
// de aparelho ou limpasse os dados do navegador). Agora fica salvo em
// campanhasMensagemMassa/{id}, sincronizado em tempo real entre todos os aparelhos
// conectados ao painel — e guarda um histórico de campanhas anteriores.
let campanhaMensagemMassaAtualId = null;

function obterOuCriarCampanhaAtual() {
    return new Promise((resolve) => {
        campanhaMensagemMassaAtualId = localStorage.getItem('campanhaMensagemMassaAtualId') || null;
        if (campanhaMensagemMassaAtualId) {
            db.ref('campanhasMensagemMassa/' + campanhaMensagemMassaAtualId).once('value').then(snap => {
                if (snap.exists()) { resolve(); return; }
                criarNovaCampanhaMensagemMassa().then(resolve);
            });
        } else {
            criarNovaCampanhaMensagemMassa().then(resolve);
        }
    });
}

function criarNovaCampanhaMensagemMassa() {
    const ref = db.ref('campanhasMensagemMassa').push();
    campanhaMensagemMassaAtualId = ref.key;
    localStorage.setItem('campanhaMensagemMassaAtualId', campanhaMensagemMassaAtualId);
    return ref.set({ criadaEm: Date.now(), texto: '', enviados: {} });
}

async function novaCampanhaMensagemMassa() {
    if (!confirm('Começar uma campanha nova? A campanha atual fica salva no histórico, e a marcação de "enviado" reinicia do zero.')) return;
    await criarNovaCampanhaMensagemMassa();
    document.getElementById('mmTexto').value = '';
    document.getElementById('mmLista').innerHTML = '';
    document.getElementById('mmContador').textContent = '';
    renderHistoricoCampanhasMensagemMassa();
}

async function montarListaMensagemMassa() {
    const texto = document.getElementById('mmTexto').value.trim();
    const listaEl = document.getElementById('mmLista');
    const contadorEl = document.getElementById('mmContador');
    if (!texto) { alert('Escreve a mensagem primeiro.'); return; }

    if (!campanhaMensagemMassaAtualId) await obterOuCriarCampanhaAtual();
    await db.ref('campanhasMensagemMassa/' + campanhaMensagemMassaAtualId + '/texto').set(texto);

    const comTelefone = clientesGestao.filter(c => normalizarTelefone(c.telefone));
    const semTelefone = clientesGestao.length - comTelefone.length;
    const campanhaSnap = await db.ref('campanhasMensagemMassa/' + campanhaMensagemMassaAtualId + '/enviados').once('value');
    const jaEnviados = Object.keys(campanhaSnap.val() || {});

    contadorEl.textContent = `${comTelefone.length} cliente(s) com telefone (${semTelefone} sem telefone, não aparecem aqui).`;

    const ordenados = [...comTelefone].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    listaEl.innerHTML = ordenados.map(c => {
        const numero = formatarTelefoneWhatsAppGestao(c.telefone);
        const jaFoi = jaEnviados.includes(c.id);
        return `
            <div class="pedido-card" style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; ${jaFoi ? 'opacity:0.5;' : ''}">
                <span>${jaFoi ? '✅' : ''} ${c.nome}</span>
                <a href="https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}" target="_blank" class="btn-secondary" style="text-decoration:none;" onclick="marcarEnviadoMensagemMassa('${c.id}')">📲 Enviar</a>
            </div>
        `;
    }).join('') || '<p class="dica-secao">Nenhum cliente com telefone cadastrado.</p>';
}

function marcarEnviadoMensagemMassa(clienteId) {
    if (!campanhaMensagemMassaAtualId) return;
    db.ref('campanhasMensagemMassa/' + campanhaMensagemMassaAtualId + '/enviados/' + clienteId).set(true)
        .then(() => setTimeout(montarListaMensagemMassa, 300)); // atualiza o visual (marca com ✅) depois do clique
}

function renderHistoricoCampanhasMensagemMassa() {
    const container = document.getElementById('mmHistorico');
    if (!container) return;
    db.ref('campanhasMensagemMassa').once('value').then(snap => {
        const val = snap.val() || {};
        const campanhas = Object.entries(val)
            .filter(([id]) => id !== campanhaMensagemMassaAtualId)
            .map(([id, c]) => ({ id, ...c }))
            .sort((a, b) => (b.criadaEm || 0) - (a.criadaEm || 0))
            .slice(0, 15);

        if (campanhas.length === 0) {
            container.innerHTML = '<p class="dica-secao">Nenhuma campanha anterior ainda.</p>';
            return;
        }
        container.innerHTML = campanhas.map(c => {
            const qtdEnviados = Object.keys(c.enviados || {}).length;
            const data = c.criadaEm ? new Date(c.criadaEm).toLocaleDateString('pt-BR') : '—';
            const prevTexto = (c.texto || '(sem mensagem)').slice(0, 60);
            return `
                <div class="pedido-card" style="margin-top:6px;">
                    <strong>${data}</strong> — ${qtdEnviados} enviado(s)
                    <p style="margin:4px 0 0; font-size:0.85em; color:var(--muted);">${prevTexto}${(c.texto || '').length > 60 ? '…' : ''}</p>
                </div>
            `;
        }).join('');
    });
}

function renderClientesGestao() {
    const busca = normalizarTexto(document.getElementById('cgBusca').value || '');
    const container = document.getElementById('listaClientesGestao');
    const filtrados = clientesGestao
        .filter(c => normalizarTexto(c.nome).includes(busca))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

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

async function excluirClienteGestao(id) {
    const cliente = getClienteGestao(id);
    let temPedidos = false;
    if (cliente && cliente.telefone) {
        const telNormalizado = normalizarTelefoneClienteBrasil(cliente.telefone);
        const snap = await db.ref('pedidos').once('value');
        const val = snap.val() || {};
        temPedidos = Object.values(val).some(p => normalizarTelefoneClienteBrasil(p.telefone) === telNormalizado);
    }
    let msg = 'Excluir este cliente do CRM?';
    if (temPedidos) msg += '\n\nEle tem pedidos registrados — excluir o cliente não apaga os pedidos, só o cadastro dele.';
    if (!confirm(msg)) return;
    db.ref('clientesGestao/' + id).remove().catch(err => alert('Erro ao excluir: ' + err.message));
}

// ---------- Sistema de Gestão — Pedidos manuais ----------
// Escreve no MESMO nó "pedidos" que o cardápio usa (com origem:'manual'), pra
// fechamento e relatórios sempre verem tudo junto, nunca separado
let tempItensPedidoManual = [];
let editingPedidoManualId = null;
let editingPedidoManualTelefoneOriginal = null; // preserva o telefone real ao editar pedido vindo do cardápio
let editingItemPedidoManualIndex = null;

function popularSelectClientePedidoManual() {
    const dl = document.getElementById('pmClientesDatalist');
    if (!dl) return;
    const ordenados = [...clientesGestao].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    dl.innerHTML = ordenados.map(c => `<option value="${c.nome}">`).join('');
}

// Identifica o cliente pelo TELEFONE quando ele existe (fonte principal de identidade).
// O nome é só fallback para pedidos manuais antigos/novos que ainda não têm telefone.
// Assim, "Danielly" e "Danielly de Souza" com o mesmo WhatsApp continuam sendo
// um único cadastro, mesmo com máscara, espaços, hífen ou +55 diferentes.
async function obterOuCriarClienteGestaoPorNome(nomeDigitado, telefonePreferencial = null) {
    if (!nomeDigitado && !telefonePreferencial) return null;

    const telefoneChave = normalizarTelefoneClienteBrasil(telefonePreferencial);
    if (telefoneChave) {
        const porTelefone = clientesGestao.find(c =>
            normalizarTelefoneClienteBrasil(c.telefone) === telefoneChave
        );
        if (porTelefone) return porTelefone;

        // Corrige com segurança um cadastro antigo criado só pelo nome (sem telefone):
        // reaproveita o MESMO registro e apenas completa o telefone, sem duplicar cliente.
        const porNomeSemTelefone = acharPorNome(clientesGestao, nomeDigitado);
        if (porNomeSemTelefone && !normalizarTelefoneClienteBrasil(porNomeSemTelefone.telefone)) {
            await db.ref('clientesGestao/' + porNomeSemTelefone.id + '/telefone').set(telefonePreferencial);
            return { ...porNomeSemTelefone, telefone: telefonePreferencial };
        }

        const novo = {
            nome: nomeDigitado || 'Cliente',
            telefone: telefonePreferencial,
            email: null,
            endereco: null
        };
        const ref = await db.ref('clientesGestao').push(novo);
        return { id: ref.key, ...novo };
    }

    // Sem telefone não existe uma chave segura para distinguir homônimos; mantém o
    // comportamento antigo e reaproveita apenas pelo nome.
    const jaExiste = acharPorNome(clientesGestao, nomeDigitado);
    if (jaExiste) return jaExiste;

    const novo = { nome: nomeDigitado, telefone: null, email: null, endereco: null };
    const ref = await db.ref('clientesGestao').push(novo);
    return { id: ref.key, ...novo };
}

function garantirBuscaProdutoPedidoManual() {
    const sel = document.getElementById('pmSelectProduto');
    if (!sel || document.getElementById('pmBuscaProdutoManual')) return;

    const btnAdicionar = document.querySelector('button[onclick="adicionarItemPedidoManual()"]');
    if (btnAdicionar && !btnAdicionar.id) btnAdicionar.id = 'btnAdicionarItemPedidoManual';

    // Mantém o select original como fonte do valor escolhido para não alterar
    // adicionarItemPedidoManual() nem qualquer fluxo já validado.
    sel.style.display = 'none';

    const label = document.querySelector('label[for="pmSelectProduto"]');
    if (label) label.setAttribute('for', 'pmBuscaProdutoManual');

    const wrapper = document.createElement('div');
    wrapper.id = 'pmBuscaProdutoManualWrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    const busca = document.createElement('input');
    busca.type = 'text';
    busca.id = 'pmBuscaProdutoManual';
    busca.placeholder = '🔍 Buscar produto...';
    busca.autocomplete = 'off';
    busca.setAttribute('role', 'combobox');
    busca.setAttribute('aria-autocomplete', 'list');
    busca.setAttribute('aria-expanded', 'false');
    busca.setAttribute('aria-controls', 'pmResultadosProdutoManual');
    busca.style.paddingRight = '42px';

    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.id = 'pmLimparBuscaProdutoManual';
    limpar.textContent = '×';
    limpar.title = 'Limpar busca';
    limpar.setAttribute('aria-label', 'Limpar busca de produto');
    limpar.style.cssText = [
        'position:absolute',
        'right:10px',
        'top:50%',
        'transform:translateY(-50%)',
        'z-index:2',
        'width:28px',
        'height:28px',
        'border:0',
        'border-radius:50%',
        'background:transparent',
        'color:var(--muted,#8a7562)',
        'font-size:20px',
        'line-height:1',
        'cursor:pointer',
        'display:none'
    ].join(';');

    const resultados = document.createElement('div');
    resultados.id = 'pmResultadosProdutoManual';
    resultados.hidden = true;
    resultados.setAttribute('role', 'listbox');
    resultados.style.cssText = [
        'position:absolute',
        'left:0',
        'right:0',
        'top:calc(100% + 6px)',
        'z-index:60',
        'max-height:320px',
        'overflow:auto',
        'background:#fff',
        'border:1px solid var(--border,#e7d7ca)',
        'border-radius:14px',
        'box-shadow:0 16px 38px rgba(71,46,31,.14)',
        'padding:8px'
    ].join(';');

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(busca);
    wrapper.appendChild(limpar);
    wrapper.appendChild(resultados);
    wrapper.appendChild(sel);

    const atualizarBotaoLimpar = () => {
        limpar.style.display = busca.value ? 'block' : 'none';
    };

    const abrir = () => {
        atualizarBotaoLimpar();
        renderResultadosBuscaProdutoPedidoManual();
    };
    busca.addEventListener('focus', abrir);
    busca.addEventListener('click', abrir);
    busca.addEventListener('input', () => {
        // Se o usuário voltou a digitar depois de selecionar, a seleção anterior
        // deixa de valer até ele clicar em um resultado.
        sel.value = '';
        atualizarBotaoLimpar();
        renderResultadosBuscaProdutoPedidoManual();
    });

    limpar.addEventListener('click', evento => {
        evento.preventDefault();
        evento.stopPropagation();
        busca.value = '';
        sel.value = '';
        atualizarBotaoLimpar();
        busca.focus();
        renderResultadosBuscaProdutoPedidoManual();
    });

    busca.addEventListener('keydown', evento => {
        if (evento.key === 'Escape') {
            fecharBuscaProdutoPedidoManual();
            busca.blur();
            return;
        }
        if (evento.key === 'Enter') {
            const primeiro = resultados.querySelector('[data-pm-produto-id]');
            if (primeiro && !resultados.hidden) {
                evento.preventDefault();
                selecionarProdutoBuscaPedidoManual(primeiro.dataset.pmProdutoId);
            }
        }
    });

    document.addEventListener('click', evento => {
        if (!wrapper.contains(evento.target)) fecharBuscaProdutoPedidoManual();
    });
}

function produtosDisponiveisPedidoManual(termo = '') {
    const filtro = normalizarTexto(termo || '');
    if (!filtro) return [...fichaTecnica];

    // Procura o trecho em QUALQUER posição do nome, independentemente
    // da posição do produto na lista.
    return fichaTecnica.filter(p =>
        normalizarTexto(p.nome || '').includes(filtro)
    );
}

function renderResultadosBuscaProdutoPedidoManual() {
    const busca = document.getElementById('pmBuscaProdutoManual');
    const resultados = document.getElementById('pmResultadosProdutoManual');
    if (!busca || !resultados) return;

    const encontrados = produtosDisponiveisPedidoManual(busca.value);
    resultados.innerHTML = '';

    if (!encontrados.length) {
        const vazio = document.createElement('div');
        vazio.textContent = `Nenhum produto encontrado para "${busca.value}".`;
        vazio.style.cssText = 'padding:12px 14px;color:var(--muted,#8a7562);font-size:.9rem;';
        resultados.appendChild(vazio);
    } else {
        encontrados.forEach(produto => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.dataset.pmProdutoId = produto.id;
            botao.setAttribute('role', 'option');
            botao.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:space-between',
                'gap:12px',
                'width:100%',
                'border:0',
                'border-bottom:1px solid var(--border,#eee2d8)',
                'background:transparent',
                'padding:12px 10px',
                'text-align:left',
                'cursor:pointer',
                'color:inherit',
                'font:inherit'
            ].join(';');

            const nome = document.createElement('strong');
            nome.textContent = produto.nome || 'Produto sem nome';

            const calculo = calcularCustoFichaTecnica(produto);
            const preco = document.createElement('small');
            preco.textContent = formatarPreco(calculo.precoVenda);
            preco.style.cssText = 'white-space:nowrap;color:var(--muted,#8a7562);';

            botao.appendChild(nome);
            botao.appendChild(preco);
            botao.addEventListener('mouseenter', () => botao.style.background = 'rgba(160,82,45,.06)');
            botao.addEventListener('mouseleave', () => botao.style.background = 'transparent');
            botao.addEventListener('click', () => selecionarProdutoBuscaPedidoManual(produto.id));

            resultados.appendChild(botao);
        });
    }

    resultados.hidden = false;
    busca.setAttribute('aria-expanded', 'true');
}

function selecionarProdutoBuscaPedidoManual(id) {
    const sel = document.getElementById('pmSelectProduto');
    const busca = document.getElementById('pmBuscaProdutoManual');
    const produto = getFichaTecnica(id);
    if (!sel || !busca || !produto) return;

    sel.value = id;
    busca.value = produto.nome || '';
    const limpar = document.getElementById('pmLimparBuscaProdutoManual');
    if (limpar) limpar.style.display = busca.value ? 'block' : 'none';
    fecharBuscaProdutoPedidoManual();
}

function fecharBuscaProdutoPedidoManual() {
    const busca = document.getElementById('pmBuscaProdutoManual');
    const resultados = document.getElementById('pmResultadosProdutoManual');
    if (resultados) resultados.hidden = true;
    if (busca) busca.setAttribute('aria-expanded', 'false');
}

function popularSelectProdutoPedidoManual() {
    const sel = document.getElementById('pmSelectProduto');
    if (!sel) return;

    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>' +
        fichaTecnica.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

    if ([...sel.options].some(opt => opt.value === valorAtual)) {
        sel.value = valorAtual;
    } else {
        sel.value = '';
    }

    garantirBuscaProdutoPedidoManual();

    const busca = document.getElementById('pmBuscaProdutoManual');
    if (busca && sel.value) {
        const selecionado = getFichaTecnica(sel.value);
        if (selecionado) busca.value = selecionado.nome || '';
    }

    const limpar = document.getElementById('pmLimparBuscaProdutoManual');
    if (limpar && busca) limpar.style.display = busca.value ? 'block' : 'none';

    if (busca && busca.getAttribute('aria-expanded') === 'true') {
        renderResultadosBuscaProdutoPedidoManual();
    }
}

function adicionarItemPedidoManual() {
    const ftId = document.getElementById('pmSelectProduto').value;
    const qtd = parseFloat(document.getElementById('pmQtdItem').value.replace(',', '.'));
    if (!ftId || !qtd) { alert('Seleciona o produto e a quantidade.'); return; }

    const ft = getFichaTecnica(ftId);
    if (!ft) return;

    const { precoVenda } = calcularCustoFichaTecnica(ft);
    tempItensPedidoManual.push({
        fichaTecnicaId: ftId,
        nome: ft.nome,
        preco: precoVenda,
        quantidade: qtd
    });

    limparCamposNovoItemPedidoManual();
    renderItensPedidoManual();
}

// Mesmo padrão da Ficha Técnica: editar acontece na própria linha do item.
// Não joga o usuário de volta para o campo de inclusão no topo.
function editarItemPedidoManual(i) {
    if (!tempItensPedidoManual[i]) return;
    editingItemPedidoManualIndex = i;
    renderItensPedidoManual();

    const input = document.querySelector(`[data-pm-editar-qtd="${i}"]`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelarEdicaoItemPedidoManual() {
    editingItemPedidoManualIndex = null;
    renderItensPedidoManual();
}

function salvarEdicaoItemPedidoManual(i) {
    const item = tempItensPedidoManual[i];
    const input = document.querySelector(`[data-pm-editar-qtd="${i}"]`);
    if (!item || !input) return;

    const qtd = parseFloat(String(input.value || '').replace(',', '.'));
    if (!qtd || qtd <= 0) {
        alert('Informa uma quantidade válida.');
        input.focus();
        return;
    }

    item.quantidade = qtd;
    editingItemPedidoManualIndex = null;
    renderItensPedidoManual();
}

function limparCamposNovoItemPedidoManual() {
    const sel = document.getElementById('pmSelectProduto');
    const busca = document.getElementById('pmBuscaProdutoManual');
    const qtd = document.getElementById('pmQtdItem');
    const btn = document.getElementById('btnAdicionarItemPedidoManual');
    const limpar = document.getElementById('pmLimparBuscaProdutoManual');

    if (sel) sel.value = '';
    if (busca) busca.value = '';
    if (qtd) qtd.value = '1';
    if (btn) btn.textContent = '+ Adicionar item';
    if (limpar) limpar.style.display = 'none';
    fecharBuscaProdutoPedidoManual();
}

// Mantém o nome antigo disponível caso algum trecho legado ainda o chame.
function limparEdicaoItemPedidoManual() {
    cancelarEdicaoItemPedidoManual();
}

function removerItemPedidoManual(i) {
    tempItensPedidoManual.splice(i, 1);

    if (editingItemPedidoManualIndex === i) {
        editingItemPedidoManualIndex = null;
    } else if (editingItemPedidoManualIndex !== null && editingItemPedidoManualIndex > i) {
        editingItemPedidoManualIndex--;
    }

    renderItensPedidoManual();
}

function renderItensPedidoManual() {
    const div = document.getElementById('pmListaItens');
    div.innerHTML = '';
    let subtotal = 0;
    tempItensPedidoManual.forEach((item, i) => {
        const totalItem = item.preco * item.quantidade;
        subtotal += totalItem;
        const linha = document.createElement('div');
        linha.className = 'pedido-manual-item-linha';

        if (editingItemPedidoManualIndex === i) {
            linha.classList.add('is-editing');
            linha.innerHTML = `
                <div class="pedido-manual-item-info">
                    <strong>${item.nome}</strong>
                    <small>Preço unitário: ${formatarPreco(item.preco)} · Total atual: ${formatarPreco(totalItem)}</small>
                </div>
                <div class="pedido-manual-item-edicao">
                    <label>Quantidade</label>
                    <input type="text" inputmode="decimal" value="${item.quantidade}" data-pm-editar-qtd="${i}"
                        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); salvarEdicaoItemPedidoManual(${i}); } else if(event.key === 'Escape'){ cancelarEdicaoItemPedidoManual(); }">
                </div>
                <div class="pedido-manual-item-acoes">
                    <button type="button" class="btn-secondary pedido-manual-btn-aplicar" onclick="salvarEdicaoItemPedidoManual(${i})">✓ Aplicar</button>
                    <button type="button" class="btn-secondary pedido-manual-btn-cancelar" onclick="cancelarEdicaoItemPedidoManual()">Cancelar</button>
                </div>`;
        } else {
            linha.innerHTML = `
                <span class="pedido-manual-item-resumo">${item.quantidade}x ${item.nome} = <strong>${formatarPreco(totalItem)}</strong></span>
                <div class="pedido-manual-item-acoes">
                    <button type="button" class="btn-secondary pedido-manual-btn-editar" onclick="editarItemPedidoManual(${i})" title="Editar item">✏️ Editar</button>
                    <button type="button" class="btn-excluir-cupom" onclick="removerItemPedidoManual(${i})" title="Excluir item">🗑️</button>
                </div>`;
        }
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
    db.ref('pedidos').limitToLast(1000).on('value', snap => {
        const val = snap.val() || {};
        // Mostra TODOS os pedidos aqui (manuais + do cardápio) — MENOS os que ainda
        // estão "aguardando_pagamento": esses não podem aparecer em lugar NENHUM do
        // painel antes do pagamento confirmar de verdade, nem aqui
        const manuais = Object.entries(val)
            .map(([id, p]) => ({ id, ...p }))
            .filter(p => p.status !== 'aguardando_pagamento')
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        ultimosPedidosManuais = manuais;

        const div = document.getElementById('listaPedidosManuais');
        if (!div) return;
        if (manuais.length === 0) {
            div.innerHTML = '<p class="dica-secao">Nenhum pedido lançado ainda.</p>';
            return;
        }

        const rotulosStatus = { aguardando_pagamento: '💳 Aguardando pagamento', pendente: '🕒 Pendente', aceito: '👩‍🍳 Em preparo', em_rota: '🛵 Saiu para entrega', pronto_retirada: '🛍️ Pronto pra retirada', entregue: '🎉 Entregue', recusado: '❌ Cancelado' };
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
                                <button class="btn-excluir-cupom" onclick="excluirPedidoQualquerStatus('${p.id}', ${p.numero})" title="Excluir">🗑️</button>
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
    const rotulosStatus = { pendente: 'Pendente', aceito: 'Em preparo', em_rota: 'Saiu para entrega', pronto_retirada: 'Pronto pra retirada', entregue: 'Entregue', recusado: 'Cancelado' };

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
    const rotulosStatus = { pendente: 'Pendente', aceito: 'Em preparo', em_rota: 'Saiu para entrega', pronto_retirada: 'Pronto pra retirada', entregue: 'Entregue', recusado: 'Cancelado' };
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
    editingItemPedidoManualIndex = null;
    document.getElementById('pmCliente').value = p.nome || '';
    if (p.timestamp) {
        const d = new Date(p.timestamp);
        document.getElementById('pmData').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    document.getElementById('pmStatus').value = p.status || 'pendente';
    document.getElementById('pmFormaPagamento').value = p.formaPagamento || '';
    document.getElementById('pmObs').value = p.observacoes || '';
    document.getElementById('pmDesconto').value = '0'; // desconto já vem embutido nos itens/total originais
    document.getElementById('pmFrete').value = p.frete || 0;

    const temSinal = p.pagamento && p.pagamento.tipoPagamento === 'sinal';
    definirEhEncomenda(!!temSinal);
    document.getElementById('blocoEncomendaSinal').style.display = temSinal ? 'block' : 'none';
    document.getElementById('pmSinalRecebido').value = temSinal ? p.pagamento.valorSinal : 0;
    definirRestanteJaRecebido(!!(p.pagamentoRestante && p.pagamentoRestante.status === 'pago'));

    tempItensPedidoManual = (p.itens || []).map(item => ({ ...item }));
    editingPedidoManualId = id;
    editingPedidoManualTelefoneOriginal = p.telefone || null;
    document.getElementById('btnSalvarPedidoManual').textContent = 'Atualizar Pedido';
    renderItensPedidoManual();
    document.getElementById('pmCliente').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Alterna o estado do toggle Sim/Não do "restante já recebido" — visual (qual botão
// fica destacado) e o valor guardado no campo escondido, que o resto do código lê
// Alterna o toggle Sim/Não de "é encomenda com sinal", mostrando/escondendo os
// campos de sinal junto
function definirEhEncomenda(valor) {
    document.getElementById('pmEhEncomenda').value = valor ? 'sim' : 'nao';
    document.getElementById('btnEncomendaSim').classList.toggle('selecionado', valor);
    document.getElementById('btnEncomendaNao').classList.toggle('selecionado', !valor);
    document.getElementById('blocoEncomendaSinal').style.display = valor ? 'block' : 'none';
}

function definirRestanteJaRecebido(valor) {
    document.getElementById('pmRestanteJaRecebido').value = valor ? 'sim' : 'nao';
    document.getElementById('btnRestanteSim').classList.toggle('selecionado', valor);
    document.getElementById('btnRestanteNao').classList.toggle('selecionado', !valor);
}

async function salvarPedidoManual() {
    const nomeClienteDigitado = document.getElementById('pmCliente').value.trim();
    const dataEscolhida = document.getElementById('pmData').value; // formato yyyy-mm-dd
    const status = document.getElementById('pmStatus').value;
    const formaPagamento = document.getElementById('pmFormaPagamento').value;
    const obs = document.getElementById('pmObs').value.trim();
    const msgEl = document.getElementById('msgPedidoManual');

    if (tempItensPedidoManual.length === 0) { msgEl.textContent = 'Adiciona pelo menos 1 item.'; return; }

    // Usa a data escolhida (na hora atual, do jeito que estamos agora — só a data muda,
    // não afeta o horário) — se não escolher nada, usa a data de hoje
    let timestampEscolhido;
    if (dataEscolhida) {
        const [ano, mes, dia] = dataEscolhida.split('-').map(Number);
        const agora = new Date();
        timestampEscolhido = new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds()).getTime();
    } else {
        timestampEscolhido = Date.now();
    }

    msgEl.textContent = 'Salvando...';

    // Ao editar um pedido do cardápio, o telefone que veio no próprio pedido é a
    // identidade do cliente. Nunca tenta decidir só pelo nome, porque o mesmo cliente
    // pode escrever o nome abreviado numa compra e completo em outra.
    const telefoneOriginalDoPedido = editingPedidoManualId ? editingPedidoManualTelefoneOriginal : null;
    const cliente = await obterOuCriarClienteGestaoPorNome(nomeClienteDigitado, telefoneOriginalDoPedido);
    const subtotal = tempItensPedidoManual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const descontoPercent = parseFloat(document.getElementById('pmDesconto').value.replace(',', '.')) || 0;
    const frete = parseFloat(document.getElementById('pmFrete').value.replace(',', '.')) || 0;
    const desconto = arred(subtotal * (descontoPercent / 100));
    const total = arred(subtotal - desconto + frete);

    const dadosPedido = {
        origem: 'manual',
        // Mantém o nome digitado/que já estava no pedido. A identidade do cliente é o telefone,
        // então uma variação de nome não cria outro cadastro nem troca o nome do pedido sem querer.
        nome: nomeClienteDigitado || (cliente ? cliente.nome : 'Cliente balcão'),
        // Em edição preserva exatamente o telefone original do pedido; em pedido novo usa
        // o telefone do cadastro selecionado. Nunca envia undefined ao Firebase.
        telefone: telefoneOriginalDoPedido || (cliente?.telefone ?? null),
        tipoEntrega: 'retirada',
        endereco: null,
        formaPagamento: formaPagamento || null,
        observacoes: obs || null,
        itens: tempItensPedidoManual.map(item => ({ produtoId: null, fichaTecnicaId: item.fichaTecnicaId, nome: item.nome, preco: item.preco, quantidade: item.quantidade })),
        subtotal: arred(subtotal),
        desconto,
        frete,
        total,
        status,
        timestamp: timestampEscolhido
    };

    // Se marcado como encomenda com sinal, registra o pagamento — lançado direto como
    // "já recebido" (diferente do fluxo do cardápio, que gera um link de pagamento;
    // aqui é só um registro do que já foi recebido na mão/Pix combinado por fora)
    const ehEncomenda = document.getElementById('pmEhEncomenda').value === 'sim';
    if (ehEncomenda) {
        const sinalRecebido = parseFloat((document.getElementById('pmSinalRecebido').value || '0').replace(',', '.')) || 0;
        if (sinalRecebido > 0) {
            dadosPedido.pagamento = {
                provedor: 'manual',
                tipoPagamento: 'sinal',
                status: 'pago',
                valorSinal: sinalRecebido,
                confirmadoEm: Date.now()
            };
            const restanteJaRecebido = document.getElementById('pmRestanteJaRecebido').value === 'sim';
            if (restanteJaRecebido) {
                dadosPedido.pagamentoRestante = {
                    provedor: 'manual',
                    tipoPagamento: 'restante',
                    status: 'pago',
                    valorRestante: arred(total - sinalRecebido),
                    confirmadoEm: Date.now()
                };
            }
        }
    }

    // Editando um pedido que já existe — atualiza direto (a mudança de status, se
    // houver, já dispara a Cloud Function normalmente, sem precisar do truque
    // "cria como pendente primeiro" que só é necessário na CRIAÇÃO)
    if (editingPedidoManualId) {
        msgEl.textContent = 'Atualizando...';
        try {
            await db.ref('pedidos/' + editingPedidoManualId).update(dadosPedido);
            msgEl.textContent = 'Pedido atualizado!';
            editingPedidoManualId = null;
            editingPedidoManualTelefoneOriginal = null;
            document.getElementById('btnSalvarPedidoManual').textContent = 'Salvar Pedido';
            tempItensPedidoManual = [];
            editingItemPedidoManualIndex = null;
            document.getElementById('pmCliente').value = '';
            document.getElementById('pmDesconto').value = '0';
            document.getElementById('pmFrete').value = '0';
            document.getElementById('pmObs').value = '';
            document.getElementById('pmStatus').value = 'pendente';
            definirEhEncomenda(false);
            document.getElementById('pmSinalRecebido').value = '0';
            definirRestanteJaRecebido(false);
            document.getElementById('blocoEncomendaSinal').style.display = 'none';
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
                numero: numeroAtribuido
            });
        })
        .then(() => {
            if (statusDesejado !== 'pendente') return novoPedidoRef.child('status').set(statusDesejado);
        })
        .then(() => {
            msgEl.textContent = 'Pedido salvo!';
            tempItensPedidoManual = [];
            editingItemPedidoManualIndex = null;
            document.getElementById('pmCliente').value = '';
            document.getElementById('pmDesconto').value = '0';
            document.getElementById('pmFrete').value = '0';
            document.getElementById('pmObs').value = '';
            document.getElementById('pmStatus').value = 'pendente';
            definirEhEncomenda(false);
            document.getElementById('pmSinalRecebido').value = '0';
            definirRestanteJaRecebido(false);
            document.getElementById('blocoEncomendaSinal').style.display = 'none';
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

// Carrega as métricas anônimas do funil pelo backend. Não lê nós públicos do banco;
// o painel autenticado recebe só os totais agregados do período escolhido.
async function carregarMetricasConversaoDashboard(inicio, fim) {
    const msg = document.getElementById('funilConversaoMsg');
    const set = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor; };
    try {
        if (msg) msg.textContent = 'Atualizando métricas...';
        const fn = firebase.functions().httpsCallable('obterMetricasConversao');
        const r = await fn({ inicio, fim });
        const m = (r && r.data) || {};
        const visitas = Number(m.visitas || 0), exib = Number(m.vendedorExibido || 0), cli = Number(m.vendedorClicado || 0);
        set('funilVisitas', visitas);
        set('funilCarrinhos', Number(m.carrinhos || 0));
        set('funilFinalizacoes', Number(m.finalizacoes || 0));
        set('funilCheckouts', Number(m.checkouts || 0));
        set('funilPagamentos', Number(m.pagamentosConfirmados || 0));
        set('funilConversao', visitas > 0 ? ((Number(m.pagamentosConfirmados || 0) / visitas) * 100).toFixed(1).replace('.', ',') + '%' : '0%');
        set('funilVendedorExibicoes', exib);
        set('funilVendedorCliques', cli);
        set('funilVendedorCTR', exib > 0 ? ((cli / exib) * 100).toFixed(1).replace('.', ',') + '%' : '0%');
        set('funilVendedorVendas', Number(m.vendasVendedor || 0));
        if (msg) msg.textContent = m.inicioColeta ? `Métricas disponíveis a partir de ${m.inicioColeta}.` : 'As métricas começam a contar depois desta atualização.';
    } catch (err) {
        if (msg) msg.textContent = 'As métricas vão aparecer após publicar as novas Functions.';
        console.log('Não foi possível carregar métricas de conversão:', err.message);
    }
}

// ---------- RESUMO GERAL (tela inicial do painel) ----------
let periodoResumoAtivo = 'hoje';

function calcularIntervaloPeriodoResumo(periodo) {
    const agora = new Date();
    const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999).getTime();
    if (periodo === 'hoje') {
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0).getTime();
        return { inicio, fim: fimDoDia };
    }
    if (periodo === '7dias') {
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6, 0, 0, 0, 0).getTime();
        return { inicio, fim: fimDoDia };
    }
    if (periodo === 'mes') {
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0).getTime();
        return { inicio, fim: fimDoDia };
    }
    // personalizado
    const dataInicioEl = document.getElementById('resumoDataInicio');
    const dataFimEl = document.getElementById('resumoDataFim');
    const inicio = dataInicioEl && dataInicioEl.value ? new Date(dataInicioEl.value + 'T00:00:00').getTime() : (agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fim = dataFimEl && dataFimEl.value ? new Date(dataFimEl.value + 'T23:59:59').getTime() : fimDoDia;
    return { inicio, fim };
}

function mudarPeriodoResumo(periodo) {
    periodoResumoAtivo = periodo;
    document.querySelectorAll('.resumo-filtro-btn').forEach(b => b.classList.toggle('active', b.dataset.periodo === periodo));
    const areaPersonalizado = document.getElementById('resumoPeriodoPersonalizado');
    if (areaPersonalizado) areaPersonalizado.style.display = periodo === 'personalizado' ? 'flex' : 'none';
    recalcularResumoGeral();
}

function formatarMoedaResumo(valor) {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function recalcularResumoGeral() {
    const { inicio, fim } = calcularIntervaloPeriodoResumo(periodoResumoAtivo);
    db.ref('pedidos').once('value').then(snap => {
        const val = snap.val() || {};
        const pedidosDoPeriodo = Object.values(val).filter(p => {
            const dataPedido = p.timestamp || p.criadoEm || 0;
            return p.status === 'entregue' && dataPedido >= inicio && dataPedido <= fim;
        });

        let faturamento = 0, descontos = 0, frete = 0;
        const clientesUnicos = new Set();
        const produtoQuantidade = {};

        pedidosDoPeriodo.forEach(p => {
            faturamento += p.total || 0;
            descontos += p.desconto || 0;
            frete += p.frete || 0;
            if (p.telefone) clientesUnicos.add(p.telefone);
            (p.itens || []).forEach(item => {
                const nome = item.nome || 'Produto';
                const qtd = Number(item.quantidade) || 1;
                produtoQuantidade[nome] = (produtoQuantidade[nome] || 0) + qtd;
            });
        });

        const totalPedidos = pedidosDoPeriodo.length;
        const ticketMedio = totalPedidos > 0 ? faturamento / totalPedidos : 0;

        const elFaturamento = document.getElementById('resumoFaturamento');
        const elPedidos = document.getElementById('resumoPedidos');
        const elTicket = document.getElementById('resumoTicketMedio');
        const elClientes = document.getElementById('resumoClientes');
        const elDescontos = document.getElementById('resumoDescontos');
        const elFrete = document.getElementById('resumoFrete');
        if (elFaturamento) elFaturamento.textContent = formatarMoedaResumo(faturamento);
        if (elPedidos) elPedidos.textContent = totalPedidos;
        if (elTicket) elTicket.textContent = formatarMoedaResumo(ticketMedio);
        if (elClientes) elClientes.textContent = clientesUnicos.size;
        if (elDescontos) elDescontos.textContent = formatarMoedaResumo(descontos);
        if (elFrete) elFrete.textContent = formatarMoedaResumo(frete);

        const topProdutosEl = document.getElementById('resumoTopProdutos');
        if (topProdutosEl) {
            const ranking = Object.entries(produtoQuantidade).sort((a, b) => b[1] - a[1]).slice(0, 5);
            topProdutosEl.innerHTML = ranking.length === 0
                ? '<p class="vazio">Sem dados no período.</p>'
                : ranking.map(([nome, qtd], i) => `<div class="resumo-produto-linha"><span>${i + 1}º ${nome}</span><strong>${qtd}x</strong></div>`).join('');
        }
    });
}

function carregarDashboard(inicio, fim) {
    db.ref('pedidos').once('value').then(snap => {
        const val = snap.val() || {};
        const pedidosDoPeriodo = Object.values(val).filter(p => {
            const dataPedido = p.timestamp || p.criadoEm || 0;
            return p.status === 'entregue' && dataPedido >= inicio && dataPedido <= fim;
        });

        let faturamento = 0, cmv = 0, lucroEmpresaTotal = 0, lucroCasalTotal = 0, recebidoDeFato = 0;
        const porMes = {}; // "AAAA-MM" -> { faturamento, lucro }
        const porProduto = {}; // nome -> quantidade vendida
        const desempenhoProduto = {}; // nome -> { quantidade, faturamentoItens, lucroEstimado }

        pedidosDoPeriodo.forEach(p => {
            faturamento += p.total || 0;

            // Pedido normal: assume que o total foi recebido (pago na entrega/pedido).
            // Encomenda com sinal: só conta o que REALMENTE já entrou (sinal, e o
            // restante só se já tiver sido pago também) — nunca o total inteiro se o
            // restante ainda estiver pendente
            if (p.pagamento && p.pagamento.tipoPagamento === 'sinal') {
                if (p.pagamento.status === 'pago') recebidoDeFato += p.pagamento.valorSinal || 0;
                if (p.pagamentoRestante && p.pagamentoRestante.status === 'pago') recebidoDeFato += p.pagamentoRestante.valorRestante || 0;
            } else {
                recebidoDeFato += p.total || 0;
            }

            const dataPedido = new Date(p.timestamp || p.criadoEm || 0);
            const chaveMes = `${dataPedido.getFullYear()}-${String(dataPedido.getMonth() + 1).padStart(2, '0')}`;
            if (!porMes[chaveMes]) porMes[chaveMes] = { faturamento: 0, lucro: 0 };
            porMes[chaveMes].faturamento += p.total || 0;

            let cmvDoPedido = 0, lucroEmpresaDoPedido = 0, lucroCasalDoPedido = 0;
            (p.itens || []).forEach(item => {
                const qtd = Number(item.quantidade || 0);
                const nomeProduto = item.nome || 'Produto';
                const faturamentoItem = Number(item.preco || 0) * qtd;
                porProduto[nomeProduto] = (porProduto[nomeProduto] || 0) + qtd;
                if (!desempenhoProduto[nomeProduto]) desempenhoProduto[nomeProduto] = { quantidade: 0, faturamentoItens: 0, lucroEstimado: 0 };
                desempenhoProduto[nomeProduto].quantidade += qtd;
                desempenhoProduto[nomeProduto].faturamentoItens += faturamentoItem;

                const ftId = item.fichaTecnicaId || null;
                if (ftId) {
                    const ft = getFichaTecnica(ftId);
                    if (ft) {
                        const r = calcularCustoFichaTecnica(ft);
                        const custoItem = r.custoUnitarioFinal * qtd;
                        cmvDoPedido += custoItem;
                        lucroEmpresaDoPedido += r.lucroEmpresa * qtd;
                        lucroCasalDoPedido += r.lucroCasal * qtd;
                        desempenhoProduto[nomeProduto].lucroEstimado += faturamentoItem - custoItem;
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
        const margemBrutaPercent = faturamento > 0 ? Math.round((lucro / faturamento) * 1000) / 10 : 0;
        const lucroLabel = document.querySelector('#dashLucro + .dica-secao');
        if (lucroLabel) lucroLabel.textContent = `Lucro bruto (${margemBrutaPercent}%)`;
        document.getElementById('dashPedidos').textContent = qtdPedidos;
        document.getElementById('dashTicket').textContent = formatarPreco(ticketMedio);
        document.getElementById('dashLucroEmpresa').textContent = formatarPreco(arred(lucroEmpresaTotal));
        document.getElementById('dashLucroCasal').textContent = formatarPreco(arred(lucroCasalTotal));
        document.getElementById('dashRecebido').textContent = formatarPreco(arred(recebidoDeFato));

        const desempenho = Object.entries(desempenhoProduto);
        const maisVendido = desempenho.slice().sort((a, b) => b[1].quantidade - a[1].quantidade)[0];
        const maisFaturou = desempenho.slice().sort((a, b) => b[1].faturamentoItens - a[1].faturamentoItens)[0];
        const maisLucrativo = desempenho.filter(([, d]) => Number.isFinite(d.lucroEstimado)).sort((a, b) => b[1].lucroEstimado - a[1].lucroEstimado)[0];

        const elMaisVendido = document.getElementById('dashMaisVendido');
        const elMaisFaturou = document.getElementById('dashMaisFaturou');
        const elMaisLucrativo = document.getElementById('dashMaisLucrativo');
        if (elMaisVendido) elMaisVendido.textContent = maisVendido ? `${maisVendido[0]} · ${maisVendido[1].quantidade} un.` : '—';
        if (elMaisFaturou) elMaisFaturou.textContent = maisFaturou ? `${maisFaturou[0]} · ${formatarPreco(arred(maisFaturou[1].faturamentoItens))}` : '—';
        if (elMaisLucrativo) elMaisLucrativo.textContent = maisLucrativo ? `${maisLucrativo[0]} · ${formatarPreco(arred(maisLucrativo[1].lucroEstimado))}` : '—';

        desenharGraficosDashboard(porMes, porProduto);
        carregarMetricasConversaoDashboard(inicio, fim);
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
                <td style="padding:6px;">${formatarPreco(r.custoTotalReceita)}</td>
                <td style="padding:6px;">${p.rendimento}</td>
                <td style="padding:6px;">${formatarPreco(r.custoUnitarioFinal)}</td>
                <td style="padding:6px;">${formatarPreco(r.precoVenda)}</td>
                <td style="padding:6px;">${formatarPreco(r.lucroLiquido)}</td>
                <td style="padding:6px;">${formatarPreco(r.lucroEmpresa)}</td>
                <td style="padding:6px;">${formatarPreco(r.lucroCasal)}</td>
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
    const componentesHtml = `<p><strong>Componentes:</strong></p><ul>${r.detalhes.map(d => `<li>${d.nome}: ${d.quantidade}${d.unidade} = ${formatarPreco(d.custoItem)}</li>`).join('')}</ul>`;
    div.innerHTML = componentesHtml + montarResultadoFichaTecnica(p);
}

// ---------- Sistema de Gestão — Orçamento (proposta pro cliente) ----------
let tempItensOrcamento = [];
let editingItemOrcamentoIndex = null;

function garantirBuscaProdutoOrcamento() {
    const sel = document.getElementById('orcSelectProduto');
    if (!sel || document.getElementById('orcBuscaProduto')) return;

    // Mantém o select original escondido como fonte do valor escolhido.
    // Assim o restante do fluxo continua usando o mesmo ID e a busca vira apenas
    // a interface, no mesmo padrão da Ficha Técnica.
    sel.style.display = 'none';

    const label = document.querySelector('label[for="orcSelectProduto"]');
    if (label) label.setAttribute('for', 'orcBuscaProduto');

    const wrapper = document.createElement('div');
    wrapper.id = 'orcBuscaProdutoWrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    const busca = document.createElement('input');
    busca.type = 'text';
    busca.id = 'orcBuscaProduto';
    busca.placeholder = '🔍 Buscar produto...';
    busca.autocomplete = 'off';
    busca.setAttribute('role', 'combobox');
    busca.setAttribute('aria-autocomplete', 'list');
    busca.setAttribute('aria-expanded', 'false');
    busca.setAttribute('aria-controls', 'orcResultadosProduto');
    busca.style.paddingRight = '42px';

    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.id = 'orcLimparBuscaProduto';
    limpar.textContent = '×';
    limpar.title = 'Limpar busca';
    limpar.setAttribute('aria-label', 'Limpar busca de produto');
    limpar.style.cssText = [
        'position:absolute',
        'right:10px',
        'top:50%',
        'transform:translateY(-50%)',
        'z-index:2',
        'width:28px',
        'height:28px',
        'border:0',
        'border-radius:50%',
        'background:transparent',
        'color:var(--muted,#8a7562)',
        'font-size:20px',
        'line-height:1',
        'cursor:pointer',
        'display:none'
    ].join(';');

    const resultados = document.createElement('div');
    resultados.id = 'orcResultadosProduto';
    resultados.hidden = true;
    resultados.setAttribute('role', 'listbox');
    resultados.style.cssText = [
        'position:absolute',
        'left:0',
        'right:0',
        'top:calc(100% + 6px)',
        'z-index:60',
        'max-height:320px',
        'overflow:auto',
        'background:#fff',
        'border:1px solid var(--border,#e7d7ca)',
        'border-radius:14px',
        'box-shadow:0 16px 38px rgba(71,46,31,.14)',
        'padding:8px'
    ].join(';');

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(busca);
    wrapper.appendChild(limpar);
    wrapper.appendChild(resultados);
    wrapper.appendChild(sel);

    const atualizarBotaoLimpar = () => {
        limpar.style.display = busca.value ? 'block' : 'none';
    };

    const abrir = () => {
        atualizarBotaoLimpar();
        renderResultadosBuscaProdutoOrcamento();
    };

    busca.addEventListener('focus', abrir);
    busca.addEventListener('click', abrir);
    busca.addEventListener('input', () => {
        // Digitou novamente: a seleção anterior deixa de valer até escolher outro resultado.
        sel.value = '';
        atualizarBotaoLimpar();
        renderResultadosBuscaProdutoOrcamento();
    });

    limpar.addEventListener('click', evento => {
        evento.preventDefault();
        evento.stopPropagation();
        busca.value = '';
        sel.value = '';
        atualizarBotaoLimpar();
        busca.focus();
        renderResultadosBuscaProdutoOrcamento();
    });

    busca.addEventListener('keydown', evento => {
        if (evento.key === 'Escape') {
            fecharBuscaProdutoOrcamento();
            busca.blur();
            return;
        }
        if (evento.key === 'Enter') {
            const primeiro = resultados.querySelector('[data-orc-produto-id]');
            if (primeiro && !resultados.hidden) {
                evento.preventDefault();
                selecionarProdutoBuscaOrcamento(primeiro.dataset.orcProdutoId);
            }
        }
    });

    document.addEventListener('click', evento => {
        if (!wrapper.contains(evento.target)) fecharBuscaProdutoOrcamento();
    });
}

function produtosDisponiveisOrcamento(termo = '') {
    const filtro = normalizarTexto(termo || '');
    if (!filtro) return [...fichaTecnica];
    return fichaTecnica.filter(produto =>
        normalizarTexto(produto.nome || '').includes(filtro)
    );
}

function renderResultadosBuscaProdutoOrcamento() {
    const busca = document.getElementById('orcBuscaProduto');
    const resultados = document.getElementById('orcResultadosProduto');
    if (!busca || !resultados) return;

    const encontrados = produtosDisponiveisOrcamento(busca.value);
    resultados.innerHTML = '';

    if (!encontrados.length) {
        const vazio = document.createElement('div');
        vazio.textContent = `Nenhum produto encontrado para "${busca.value}".`;
        vazio.style.cssText = 'padding:12px 14px;color:var(--muted,#8a7562);font-size:.9rem;';
        resultados.appendChild(vazio);
    } else {
        encontrados.forEach(produto => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.dataset.orcProdutoId = produto.id;
            botao.setAttribute('role', 'option');
            botao.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:space-between',
                'gap:12px',
                'width:100%',
                'border:0',
                'border-bottom:1px solid var(--border,#eee2d8)',
                'background:transparent',
                'padding:12px 10px',
                'text-align:left',
                'cursor:pointer',
                'color:inherit',
                'font:inherit'
            ].join(';');

            const nome = document.createElement('strong');
            nome.textContent = produto.nome || 'Produto sem nome';

            const calculo = calcularCustoFichaTecnica(produto);
            const preco = document.createElement('small');
            preco.textContent = formatarPreco(calculo.precoVenda);
            preco.style.cssText = 'white-space:nowrap;color:var(--muted,#8a7562);';

            botao.appendChild(nome);
            botao.appendChild(preco);
            botao.addEventListener('mouseenter', () => botao.style.background = 'rgba(160,82,45,.06)');
            botao.addEventListener('mouseleave', () => botao.style.background = 'transparent');
            botao.addEventListener('click', () => selecionarProdutoBuscaOrcamento(produto.id));
            resultados.appendChild(botao);
        });
    }

    resultados.hidden = false;
    busca.setAttribute('aria-expanded', 'true');
}

function selecionarProdutoBuscaOrcamento(id) {
    const sel = document.getElementById('orcSelectProduto');
    const busca = document.getElementById('orcBuscaProduto');
    const produto = getFichaTecnica(id);
    if (!sel || !busca || !produto) return;

    sel.value = id;
    busca.value = produto.nome || '';
    const limpar = document.getElementById('orcLimparBuscaProduto');
    if (limpar) limpar.style.display = busca.value ? 'block' : 'none';
    fecharBuscaProdutoOrcamento();

    const qtd = document.getElementById('orcQtdItem');
    if (qtd) {
        qtd.focus();
        qtd.select();
    }
}

function fecharBuscaProdutoOrcamento() {
    const busca = document.getElementById('orcBuscaProduto');
    const resultados = document.getElementById('orcResultadosProduto');
    if (resultados) resultados.hidden = true;
    if (busca) busca.setAttribute('aria-expanded', 'false');
}

function popularSelectProdutoOrcamento() {
    const sel = document.getElementById('orcSelectProduto');
    if (!sel) return;

    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione</option>' +
        fichaTecnica.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

    if ([...sel.options].some(opt => opt.value === valorAtual)) {
        sel.value = valorAtual;
    } else {
        sel.value = '';
    }

    garantirBuscaProdutoOrcamento();

    const busca = document.getElementById('orcBuscaProduto');
    if (busca && sel.value) {
        const selecionado = getFichaTecnica(sel.value);
        if (selecionado) busca.value = selecionado.nome || '';
    }

    const limpar = document.getElementById('orcLimparBuscaProduto');
    if (limpar && busca) limpar.style.display = busca.value ? 'block' : 'none';

    if (busca && busca.getAttribute('aria-expanded') === 'true') {
        renderResultadosBuscaProdutoOrcamento();
    }
}

function adicionarItemOrcamento() {
    const sel = document.getElementById('orcSelectProduto');
    const busca = document.getElementById('orcBuscaProduto');
    const ftId = sel ? sel.value : '';
    const qtdEl = document.getElementById('orcQtdItem');
    const qtd = parseFloat(String(qtdEl ? qtdEl.value : '').replace(',', '.'));
    if (!ftId || !qtd) { alert('Seleciona o produto e a quantidade.'); return; }

    const ft = getFichaTecnica(ftId);
    if (!ft) return;
    const { precoVenda } = calcularCustoFichaTecnica(ft);
    tempItensOrcamento.push({ nome: ft.nome, preco: precoVenda, quantidade: qtd });

    if (qtdEl) qtdEl.value = '1';
    if (sel) sel.value = '';
    if (busca) busca.value = '';
    const limpar = document.getElementById('orcLimparBuscaProduto');
    if (limpar) limpar.style.display = 'none';
    fecharBuscaProdutoOrcamento();

    editingItemOrcamentoIndex = null;
    renderItensOrcamento();

    if (busca) busca.focus();
}

// Mesmo padrão da Ficha Técnica e de Lançar Pedido: a edição acontece
// na própria linha do item, sem jogar o usuário de volta para o seletor no topo.
function editarItemOrcamento(i) {
    if (!tempItensOrcamento[i]) return;
    editingItemOrcamentoIndex = i;
    renderItensOrcamento();

    const input = document.querySelector(`[data-orc-editar-qtd="${i}"]`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelarEdicaoItemOrcamento() {
    editingItemOrcamentoIndex = null;
    renderItensOrcamento();
}

function salvarEdicaoItemOrcamento(i) {
    const item = tempItensOrcamento[i];
    const input = document.querySelector(`[data-orc-editar-qtd="${i}"]`);
    if (!item || !input) return;

    const qtd = parseFloat(String(input.value || '').replace(',', '.'));
    if (!qtd || qtd <= 0) {
        alert('Informa uma quantidade válida.');
        input.focus();
        return;
    }

    item.quantidade = qtd;
    editingItemOrcamentoIndex = null;
    renderItensOrcamento();
}

function removerItemOrcamento(i) {
    tempItensOrcamento.splice(i, 1);

    if (editingItemOrcamentoIndex === i) {
        editingItemOrcamentoIndex = null;
    } else if (editingItemOrcamentoIndex !== null && editingItemOrcamentoIndex > i) {
        editingItemOrcamentoIndex--;
    }

    renderItensOrcamento();
}

function renderItensOrcamento() {
    const div = document.getElementById('orcListaItens');
    div.innerHTML = '';
    let total = 0;
    tempItensOrcamento.forEach((item, i) => {
        const totalItem = item.preco * item.quantidade;
        total += totalItem;
        const linha = document.createElement('div');
        linha.className = 'orcamento-item-linha';

        if (editingItemOrcamentoIndex === i) {
            linha.classList.add('is-editing');
            linha.innerHTML = `
                <div class="orcamento-item-info">
                    <strong>${item.nome}</strong>
                    <small>Preço unitário: ${formatarPreco(item.preco)} · Total atual: ${formatarPreco(totalItem)}</small>
                </div>
                <div class="orcamento-item-edicao">
                    <label>Quantidade</label>
                    <input type="text" inputmode="decimal" value="${item.quantidade}" data-orc-editar-qtd="${i}"
                        onkeydown="if(event.key === 'Enter'){ event.preventDefault(); salvarEdicaoItemOrcamento(${i}); } else if(event.key === 'Escape'){ cancelarEdicaoItemOrcamento(); }">
                </div>
                <div class="orcamento-item-acoes">
                    <button type="button" class="btn-secondary orcamento-btn-aplicar" onclick="salvarEdicaoItemOrcamento(${i})">✓ Aplicar</button>
                    <button type="button" class="btn-secondary orcamento-btn-cancelar" onclick="cancelarEdicaoItemOrcamento()">Cancelar</button>
                </div>`;
        } else {
            linha.innerHTML = `
                <span class="orcamento-item-resumo">${item.quantidade}x ${item.nome} = <strong>${formatarPreco(totalItem)}</strong></span>
                <div class="orcamento-item-acoes">
                    <button type="button" class="btn-secondary orcamento-btn-editar" onclick="editarItemOrcamento(${i})" title="Editar item">✏️ Editar</button>
                    <button type="button" class="btn-excluir-cupom" onclick="removerItemOrcamento(${i})" title="Excluir item">🗑️</button>
                </div>`;
        }
        div.appendChild(linha);
    });
    const frete = parseFloat((document.getElementById('orcFrete').value || '0').replace(',', '.')) || 0;
    document.getElementById('orcTotalTemp').textContent = formatarPreco(total + frete);
}

function gerarHtmlOrcamento() {
    const cliente = document.getElementById('orcCliente').value.trim() || 'Cliente';
    const validade = document.getElementById('orcValidade').value.trim();
    const obs = document.getElementById('orcObs').value.trim();
    const frete = parseFloat((document.getElementById('orcFrete').value || '0').replace(',', '.')) || 0;
    const subtotal = tempItensOrcamento.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const total = subtotal + frete;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    return `
        <div style="padding:16px; font-family:inherit;">
            <h2 style="margin-bottom:4px;">${LOJA_CONFIG.nome || 'Orçamento'}</h2>
            <p class="dica-secao">Orçamento gerado em ${dataHoje}${validade ? ' · Válido por ' + validade : ''}</p>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <hr style="margin:12px 0; border:none; border-top:1px solid var(--border);">
            ${tempItensOrcamento.map(item => `<p>${item.quantidade}x ${item.nome} — ${formatarPreco(item.preco * item.quantidade)}</p>`).join('')}
            ${frete > 0 ? `<p>Frete — ${formatarPreco(frete)}</p>` : ''}
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
    const frete = parseFloat((document.getElementById('orcFrete').value || '0').replace(',', '.')) || 0;
    if (frete > 0) linhas.push(['Frete', formatarPreco(frete)]);
    doc.autoTable({ head: [['Item', 'Valor']], body: linhas, startY: 28 });

    const subtotal = tempItensOrcamento.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
    const total = subtotal + frete;
    const yFinal = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.text('Total: ' + formatarPreco(total), 14, yFinal);
    if (obs) doc.text('Obs: ' + obs, 14, yFinal + 8);

    doc.save('orcamento-' + cliente.toLowerCase().replace(/\s+/g, '-') + '.pdf');
}

function imprimirOrcamento() {
    if (tempItensOrcamento.length === 0) { alert('Adiciona pelo menos 1 item ao orçamento.'); return; }
    const janela = window.open('', '_blank');
    janela.document.write(`<html><head><title>Orçamento</title></head><body>${gerarHtmlOrcamento()}</body></html>`);
    janela.document.close();
    janela.print();
}

function baixarOrcamentoJPG() {
    if (tempItensOrcamento.length === 0) { alert('Adiciona pelo menos 1 item ao orçamento.'); return; }
    if (typeof html2canvas === 'undefined') { alert('A biblioteca de exportação ainda está carregando, tenta de novo em instantes.'); return; }
    gerarPreviewOrcamento();
    setTimeout(() => {
        const el = document.getElementById('previewOrcamento');
        html2canvas(el, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'orcamento-' + (LOJA_CONFIG.nomeCurto || 'cardapio').toLowerCase().replace(/\s+/g, '-') + '.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
        });
    }, 200);
}

// ---------- Sistema de Gestão — Backup completo ----------
// Baixa TUDO que já está no Firebase (ingredientes, bases, fichaTecnica, clientesGestao)
// num arquivo JSON — cópia extra, útil offline; os dados já ficam salvos na nuvem sozinhos
// Baixa e restaura o backup completo chamando as Cloud Functions dedicadas
// (baixarBackupCompleto / restaurarBackupCompleto) — são bem mais completas e seguras
// que ler os dados direto do navegador: autenticam com o login do painel, e a
// restauração só aceita os caminhos conhecidos (nunca dado arbitrário do arquivo).
function urlFunctionHttp(nome) {
    const projectId = firebase.app().options.projectId;
    return `https://us-central1-${projectId}.cloudfunctions.net/${nome}`;
}

async function exportarBackupGestaoCompleto() {
    const msgEl = document.getElementById('msgExportarBackupGestao');
    const btn = document.getElementById('btnBackupCompleto');
    if (btn) btn.disabled = true;
    msgEl.textContent = 'Preparando backup...';
    try {
        const token = await firebase.auth().currentUser.getIdToken();
        const resposta = await fetch(urlFunctionHttp('baixarBackupCompleto'), {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!resposta.ok) throw new Error(await resposta.text());
        const blob = await resposta.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup-completo-loja-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        msgEl.textContent = 'Backup completo baixado!';
    } catch (err) {
        msgEl.textContent = 'Erro ao gerar backup: ' + err.message;
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function restaurarBackupCompleto() {
    const msgEl = document.getElementById('msgRestaurarBackupCompleto');
    const inputEl = document.getElementById('inputRestaurarBackupCompleto');
    const btn = document.getElementById('btnRestaurarBackupCompleto');
    const arquivo = inputEl && inputEl.files && inputEl.files[0];
    if (!arquivo) { msgEl.textContent = 'Escolhe um arquivo de backup primeiro.'; return; }
    if (!confirm('Isso substitui os dados atuais da loja pelos dados desse arquivo de backup. Essa ação não pode ser desfeita. Tem certeza que já baixou um backup atual antes de continuar?')) return;

    if (btn) btn.disabled = true;
    msgEl.textContent = 'Restaurando...';
    try {
        const texto = await arquivo.text();
        const dadosBackup = JSON.parse(texto);
        const token = await firebase.auth().currentUser.getIdToken();
        const resposta = await fetch(urlFunctionHttp('restaurarBackupCompleto'), {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosBackup)
        });
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.ok) throw new Error(resultado.erro || 'Erro ao restaurar.');
        msgEl.textContent = '✅ Backup restaurado com sucesso! Recarregando a página...';
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        msgEl.textContent = 'Erro ao restaurar: ' + err.message;
    } finally {
        if (btn) btn.disabled = false;
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
        return [p.nome, formatarPreco(r.custoUnitarioFinal), formatarPreco(r.precoVenda), formatarPreco(r.lucroLiquido), formatarPreco(r.lucroEmpresa), formatarPreco(r.lucroCasal)];
    });
    doc.autoTable({ head: [['Produto', 'Custo/un.', 'Preço', 'Lucro total/un.', 'Lucro empresa/un.', 'Lucro pró-labore/un.']], body: linhas, startY: 22 });
    doc.save('relatorio-custos.pdf');
}

function exportarRelatorioExcel() {
    if (typeof XLSX === 'undefined') { alert('A biblioteca de exportação ainda está carregando, tenta de novo em instantes.'); return; }
    const linhas = fichaTecnica.map(p => {
        const r = calcularCustoFichaTecnica(p);
        return { Produto: p.nome, 'Custo/un.': r.custoUnitarioFinal, 'Preço': r.precoVenda, 'Lucro total/un.': r.lucroLiquido, 'Lucro empresa/un.': r.lucroEmpresa, 'Lucro pró-labore/un.': r.lucroCasal, 'Margem (%)': r.margemRealPercent };
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Custos');
    XLSX.writeFile(wb, 'relatorio-custos.xlsx');
}

// Acha, no array já carregado, um item com o mesmo nome (ignorando maiúsculas/
// espaços) — usado pra não duplicar o que já foi importado numa rodada anterior
// Compara telefone só pelos dígitos — "(27) 99763-3871", "27997633871" e
// "27 99763 3871" são o MESMO número, não importa a formatação usada
function normalizarTelefone(tel) {
    return (tel || '').replace(/\D/g, '');
}

// Chave canônica para comparar clientes brasileiros pelo telefone.
// Une formatos como (27) 99999-9999, 27999999999, +55 27 99999-9999
// e números com prefixos extras, preservando os 10/11 dígitos úteis (DDD + número).
function normalizarTelefoneClienteBrasil(tel) {
    let digitos = normalizarTelefone(tel);
    if (!digitos) return '';

    // +55 + DDD + número: remove o código do Brasil explicitamente. Isso cobre tanto
    // celular (13 dígitos no total) quanto telefone fixo (12), sem confundir DDD 55.
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
        digitos = digitos.slice(2);
    }

    // Prefixos antigos de operadora/zero ou qualquer outro prefixo extra não mudam a
    // identidade: preservamos no máximo os 11 dígitos úteis finais (DDD + número).
    if (digitos.length > 11) digitos = digitos.slice(-11);
    return digitos;
}

// Remove acentos e deixa em minúsculo — assim "Lívia" e "Livia" são reconhecidos
// como a mesma coisa em qualquer busca ou comparação de nome do sistema
function normalizarTexto(texto) {
    return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function acharPorNome(lista, nome) {
    const alvo = normalizarTexto(nome);
    return lista.find(item => normalizarTexto(item.nome) === alvo);
}

// Ingredientes são diferentes dos outros — pode existir "Creme de leite" cadastrado
// duas vezes de propósito (uma em gramas, outra em unidade), pra receitas diferentes.
// Por isso, pra ingredientes, compara por NOME + UNIDADE juntos, não só o nome
function acharIngredientePorNomeEUnidade(lista, nome, unidade) {
    const nomeAlvo = normalizarTexto(nome);
    const unidadeAlvo = normalizarTexto(unidade);
    return lista.find(item => normalizarTexto(item.nome) === nomeAlvo && normalizarTexto(item.unidade) === unidadeAlvo);
}

const MAPA_STATUS_PEDIDO_ANTIGO = { pendente: 'pendente', 'produção': 'aceito', em_rota: 'em_rota', entregue: 'entregue', cancelado: 'recusado' };

// Corrige o status de pedidos JÁ importados que ficaram com status errado (ex: uma
// falha momentânea na importação deixou "preso" num status intermediário, ou alguém
// mexeu sem querer). Usa o MESMO arquivo de backup — pra cada pedido já vinculado
// (via origemBackupId), confere se o status bate com o que o backup diz que deveria
// ser, e corrige os que estiverem diferentes, tudo de uma vez
// Atualiza o preço/quantidade dos ingredientes já existentes pra bater EXATAMENTE
// com o que está neste arquivo de backup — diferente da importação normal (que só
// cria o que não existe, nunca atualiza), isso força a sincronização, útil quando
// o preço de algo mudou no sistema antigo depois da primeira importação
// Corrige os componentes de TODAS as bases e fichas técnicas, comparando com o
// backup original — resolve o caso de "mesmo nome, unidades diferentes" (ex: Creme
// de leite em gramas E em unidade): usa o id ANTIGO de cada componente do backup pra
// achar de novo o ingrediente/base ATUAL certo (por nome + unidade), e corrige a
// referência se estiver errada
async function corrigirVinculosComponentes() {
    const input = document.getElementById('inputImportarBackupGestao');
    const msgEl = document.getElementById('msgImportarBackup');
    if (!input.files.length) { msgEl.textContent = 'Escolhe o arquivo de backup (.json) primeiro (o mais recente).'; return; }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const dados = JSON.parse(e.target.result);
            msgEl.textContent = 'Corrigindo vínculos de componentes...';

            // Mapa: id antigo do ingrediente -> {nome, unidade}, pra achar de novo o certo
            const mapaIngredienteAntigo = {};
            (dados.ingredientes || []).forEach(i => { mapaIngredienteAntigo[i.id] = { nome: i.nome, unidade: i.unidade }; });
            const mapaBaseAntigaNome = {};
            (dados.bases || []).forEach(b => { mapaBaseAntigaNome[b.id] = b.nome; });

            function remapComponentesAntigos(componentesAntigos) {
                return componentesAntigos.map(c => {
                    if (c.tipo === 'base' || (!c.tipo && !c.ingredienteId)) {
                        const bid = c.tipo === 'base' ? c.id : null;
                        const nomeBase = bid ? mapaBaseAntigaNome[bid] : null;
                        const baseAtual = nomeBase ? acharPorNome(bases, nomeBase) : null;
                        return baseAtual ? { tipo: 'base', id: baseAtual.id, quantidade: c.quantidade } : c;
                    }
                    const idAntigo = c.tipo === 'ingrediente' ? c.id : c.ingredienteId;
                    const infoIng = mapaIngredienteAntigo[idAntigo];
                    const ingAtual = infoIng ? acharIngredientePorNomeEUnidade(ingredientes, infoIng.nome, infoIng.unidade) : null;
                    return ingAtual ? { tipo: 'ingrediente', id: ingAtual.id, quantidade: c.quantidade } : c;
                });
            }

            let basesCorrigidas = 0, fichasCorrigidas = 0;
            for (const baseBackup of (dados.bases || [])) {
                const baseAtual = acharPorNome(bases, baseBackup.nome);
                if (!baseAtual) continue;
                const corrigidos = remapComponentesAntigos(baseBackup.componentes || []);
                if (JSON.stringify(corrigidos) !== JSON.stringify(baseAtual.componentes)) {
                    await db.ref('bases/' + baseAtual.id + '/componentes').set(corrigidos);
                    basesCorrigidas++;
                }
            }
            for (const prodBackup of (dados.produtos || [])) {
                const ftAtual = acharPorNome(fichaTecnica, prodBackup.nome);
                if (!ftAtual) continue;
                const corrigidos = remapComponentesAntigos(prodBackup.componentes || []);
                if (JSON.stringify(corrigidos) !== JSON.stringify(ftAtual.componentes)) {
                    await db.ref('fichaTecnica/' + ftAtual.id + '/componentes').set(corrigidos);
                    fichasCorrigidas++;
                }
            }

            msgEl.textContent = `✅ Corrigido! ${basesCorrigidas} base(s) e ${fichasCorrigidas} ficha(s) técnica(s) com vínculos ajustados. Confere o Dashboard de novo.`;
        } catch (err) {
            msgEl.textContent = 'Erro: ' + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(input.files[0]);
}

async function sincronizarPrecosIngredientes() {
    const input = document.getElementById('inputImportarBackupGestao');
    const msgEl = document.getElementById('msgImportarBackup');
    if (!input.files.length) { msgEl.textContent = 'Escolhe o arquivo de backup (.json) primeiro (o mais recente).'; return; }

    if (!confirm('Isso vai atualizar o preço/quantidade de TODOS os ingredientes que já existem, pra bater com este arquivo de backup. Não cria nem apaga nada, só corrige valores. Confirma?')) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.ingredientes) { msgEl.textContent = 'Esse arquivo não tem ingredientes.'; return; }

            msgEl.textContent = 'Sincronizando preços...';
            let atualizados = 0, jaCertos = 0, criados = 0;
            for (const ingBackup of dados.ingredientes) {
                let ingAtual = acharIngredientePorNomeEUnidade(ingredientes, ingBackup.nome, ingBackup.unidade);

                if (!ingAtual) {
                    // Não existe esse ingrediente NESSA unidade específica ainda — cria
                    // (comum quando o mesmo nome existe em 2 unidades diferentes, ex:
                    // "Creme de leite" em gramas E em unidade, pra receitas diferentes)
                    const { id: idAntigo, ...resto } = ingBackup;
                    await db.ref('ingredientes').push(resto);
                    criados++;
                    continue;
                }

                if (ingAtual.qtdComprada !== ingBackup.qtdComprada || ingAtual.precoComprado !== ingBackup.precoComprado) {
                    await db.ref('ingredientes/' + ingAtual.id).update({
                        qtdComprada: ingBackup.qtdComprada,
                        precoComprado: ingBackup.precoComprado
                    });
                    atualizados++;
                } else {
                    jaCertos++;
                }
            }

            msgEl.textContent = `✅ Sincronizado! ${atualizados} ingrediente(s) atualizado(s), ${criados} criado(s) (nome+unidade que faltava), ${jaCertos} já estavam certos. Agora roda "🔧 Corrigir vínculos de Bases/Fichas" (novo botão).`;
        } catch (err) {
            msgEl.textContent = 'Erro: ' + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(input.files[0]);
}

async function corrigirStatusPedidosImportados() {
    const input = document.getElementById('inputImportarBackupGestao');
    const msgEl = document.getElementById('msgImportarBackup');
    if (!input.files.length) { msgEl.textContent = 'Escolhe o arquivo de backup (.json) primeiro (o mesmo de sempre).'; return; }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.pedidos) { msgEl.textContent = 'Esse arquivo não tem pedidos pra conferir.'; return; }

            msgEl.textContent = 'Conferindo status de todos os pedidos importados...';
            const todosPedidosSnap = await db.ref('pedidos').once('value');
            const todosPedidosVal = todosPedidosSnap.val() || {};

            // Monta um mapa: id do backup -> id atual no Firebase (só dos que já foram importados)
            const mapaBackupIdParaFirebaseId = {};
            Object.entries(todosPedidosVal).forEach(([firebaseId, p]) => {
                if (p.origemBackupId) mapaBackupIdParaFirebaseId[p.origemBackupId] = firebaseId;
            });

            // Monta um mapa: id do produto ANTIGO (do backup) -> nome do produto,
            // pra depois achar a ficha técnica ATUAL com esse mesmo nome
            const mapaProdutoAntigoParaNome = {};
            (dados.produtos || []).forEach(p => { mapaProdutoAntigoParaNome[p.id] = p.nome; });

            let corrigidos = 0, jaCertos = 0, naoEncontrados = 0, timestampsCorrigidos = 0, itensReconectados = 0;
            for (const ped of dados.pedidos) {
                const firebaseId = mapaBackupIdParaFirebaseId[ped.id];
                if (!firebaseId) { naoEncontrados++; continue; }

                const statusCorreto = MAPA_STATUS_PEDIDO_ANTIGO[ped.status] || 'pendente';
                const statusAtual = todosPedidosVal[firebaseId].status;
                let mudouAlgo = false;
                if (statusAtual !== statusCorreto) {
                    await db.ref('pedidos/' + firebaseId + '/status').set(statusCorreto);
                    corrigidos++;
                    mudouAlgo = true;
                }

                // Confere também se o timestamp está ausente/inválido — sem isso, o
                // pedido fica "invisível" pro filtro de período do Dashboard mesmo
                // com o status certo
                const timestampAtual = todosPedidosVal[firebaseId].timestamp;
                if (!timestampAtual || isNaN(timestampAtual)) {
                    const [ano, mes, dia] = (ped.data || '').split('-').map(Number);
                    const timestampCorrigido = (ano && mes && dia) ? new Date(ano, mes - 1, dia).getTime() : Date.now();
                    await db.ref('pedidos/' + firebaseId + '/timestamp').set(timestampCorrigido);
                    timestampsCorrigidos++;
                    mudouAlgo = true;
                }

                // Confere se cada item do pedido está com o vínculo de ficha técnica
                // certo — pode ter ficado desatualizado de uma rodada de importação
                // anterior (a ficha técnica daquela vez pode não existir mais)
                const itensAtuais = todosPedidosVal[firebaseId].itens || [];
                let itensMudaram = false;
                const itensCorrigidos = (ped.itens || []).map((itemBackup, i) => {
                    const nomeProduto = mapaProdutoAntigoParaNome[itemBackup.produtoId];
                    const ftAtual = nomeProduto ? acharPorNome(fichaTecnica, nomeProduto) : null;
                    const fichaTecnicaIdCorreto = ftAtual ? ftAtual.id : null;
                    const itemAtual = itensAtuais[i] || {};
                    if (fichaTecnicaIdCorreto && itemAtual.fichaTecnicaId !== fichaTecnicaIdCorreto) {
                        itensMudaram = true;
                        return { ...itemAtual, fichaTecnicaId: fichaTecnicaIdCorreto };
                    }
                    return itemAtual;
                });
                if (itensMudaram) {
                    await db.ref('pedidos/' + firebaseId + '/itens').set(itensCorrigidos);
                    itensReconectados++;
                    mudouAlgo = true;
                }

                if (!mudouAlgo) jaCertos++;
            }

            msgEl.textContent = `✅ Conferido! ${corrigidos} status corrigido(s), ${timestampsCorrigidos} data(s) corrigida(s), ${itensReconectados} pedido(s) com itens reconectados à ficha técnica, ${jaCertos} já estavam 100% certos, ${naoEncontrados} não encontrados. Confere o Dashboard de novo.`;
        } catch (err) {
            msgEl.textContent = 'Erro ao corrigir: ' + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(input.files[0]);
}

// Verifica bases e fichas técnicas com componentes "órfãos" (apontando pra um
// ingrediente/base que não existe mais) — útil pra achar dados de uma importação
// antiga, feita antes desse reconhecimento de formato existir
// Remove itens duplicados (mesmo nome, ou mesmo telefone pra clientes) — mantém o
// PRIMEIRO de cada grupo, e redireciona qualquer referência (bases usando outra base,
// fichas técnicas usando ingrediente/base) pro id mantido antes de excluir o resto,
// pra nunca quebrar nada que já estivesse referenciando o duplicado que está saindo
// Apaga TUDO da Gestão (ingredientes, bases, ficha técnica, clientes, e só os pedidos
// que vieram de importação — nunca mexe nos pedidos reais do cardápio nem nos lançados
// manualmente na mão) — pra começar do zero e reimportar limpo. Irreversível.
// Apaga TODOS os pedidos do sistema, sem exceção — inclusive os que vieram do
// cardápio de verdade (testes feitos durante o desenvolvimento). Só usar antes do
// lançamento oficial, quando não existe NENHUM pedido real de cliente ainda. Depois
// que a loja estiver no ar recebendo pedidos de verdade, nunca mais usar isso.
async function limparTodosOsPedidosDeTeste() {
    const confirmacao1 = confirm('🚨 ATENÇÃO MÁXIMA: isso apaga TODOS os pedidos do sistema, SEM EXCEÇÃO — inclusive pedidos feitos direto pelo cardápio de verdade (não só os da Gestão). Só use isso se TODOS os pedidos que existem hoje forem de teste, sem nenhum cliente real ainda. Depois que a loja estiver no ar de verdade, NUNCA use isso. Tem certeza que quer continuar?');
    if (!confirmacao1) return;
    const digitado = prompt('Pra confirmar, digita LIMPAR TESTES (exatamente assim, maiúsculas):');
    if (digitado !== 'LIMPAR TESTES') { alert('Cancelado — não digitou certinho.'); return; }

    const msgEl = document.getElementById('resultadoDiagnostico');
    msgEl.innerHTML = '<p class="dica-secao">Limpando todos os pedidos...</p>';

    try {
        const snap = await db.ref('pedidos').once('value');
        const val = snap.val() || {};
        const ids = Object.keys(val);
        let removidos = 0;
        for (const id of ids) {
            await db.ref('pedidos/' + id).remove();
            removidos++;
            if (removidos % 20 === 0) msgEl.innerHTML = `<p class="dica-secao">Limpando... ${removidos} de ${ids.length}</p>`;
        }
        await db.ref('contadores/proximoPedido').remove(); // reseta a numeração também, pra começar do #1
        msgEl.innerHTML = `<p class="dica-secao">✅ Limpo! ${removidos} pedido(s) de teste removido(s), numeração reiniciada do zero. A partir de agora, só pedidos reais (ou reimportados do backup) devem entrar aqui.</p>`;
    } catch (err) {
        msgEl.innerHTML = `<p class="dica-secao">❌ Deu erro: ${err.message}</p>`;
    }
}

async function zerarSistemaGestao() {
    const confirmacao1 = confirm('⚠️ Isso vai APAGAR PRA SEMPRE: todos os ingredientes, bases, fichas técnicas, clientes do CRM, e TODOS os pedidos que não vieram do cardápio (importados OU lançados na mão por você) — os pedidos reais do cardápio nunca são tocados. Não tem como desfazer. Tem certeza?');
    if (!confirmacao1) return;
    const digitado = prompt('Pra confirmar de vez, digita ZERAR (em maiúsculas):');
    if (digitado !== 'ZERAR') { alert('Cancelado — não digitou certinho.'); return; }

    const msgEl = document.getElementById('resultadoDiagnostico');
    msgEl.innerHTML = '<p class="dica-secao">Zerando...</p>';

    try {
        await db.ref('ingredientes').remove();
        await db.ref('bases').remove();
        await db.ref('fichaTecnica').remove();
        await db.ref('clientesGestao').remove();

        // Apaga qualquer pedido com origem:'manual' — cobre tanto os importados (tenham
        // ou não a marca origemBackupId, que só existe nas importações mais recentes)
        // quanto os lançados na mão. Pedidos DE VERDADE do cardápio (origem ausente ou
        // diferente de 'manual') nunca são tocados
        const todosPedidosSnap = await db.ref('pedidos').once('value');
        const todosPedidosVal = todosPedidosSnap.val() || {};
        let removidos = 0;
        for (const [id, p] of Object.entries(todosPedidosVal)) {
            if (p.origem === 'manual') {
                await db.ref('pedidos/' + id).remove();
                removidos++;
            }
        }

        msgEl.innerHTML = `<p class="dica-secao">✅ Zerado! Removidos: todos os ingredientes/bases/fichas técnicas/clientes, e ${removidos} pedido(s). Pode importar o backup de novo, do zero.</p>`;
    } catch (err) {
        msgEl.innerHTML = `<p class="dica-secao">❌ Deu erro no meio do processo: ${err.message}. Alguma coisa pode ter ficado pela metade — me avisa antes de continuar.</p>`;
    }
}

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
    for (const grupo of agrupar(clientesGestao, c => normalizarTelefoneClienteBrasil(c.telefone) || normalizarTexto(c.nome))) {
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

let _importacaoGestaoEmAndamento = false; // trava — impede clique duplo/2 abas rodando a importação ao mesmo tempo

async function importarBackupSistemaGestao() {
    const input = document.getElementById('inputImportarBackupGestao');
    const msgEl = document.getElementById('msgImportarBackup');
    const botao = document.getElementById('btnImportarBackupGestao');
    if (!input.files.length) { msgEl.textContent = 'Escolhe o arquivo de backup (.json) primeiro.'; return; }

    if (_importacaoGestaoEmAndamento) {
        msgEl.textContent = '⚠️ Já tem uma importação rodando — espera ela terminar antes de tentar de novo.';
        return;
    }

    // Trava também no Firebase (não só local) — protege contra 2 aparelhos/abas
    // diferentes tentando importar ao mesmo tempo. transaction() é atômico: só UM
    // dos dois "vence" e consegue travar; o outro é barrado aqui mesmo
    msgEl.textContent = 'Verificando se já tem outra importação rodando...';
    const resultadoTrava = await db.ref('configuracao/importacaoGestaoTravada').transaction(atual => {
        if (atual && (Date.now() - atual) < 10 * 60 * 1000) return; // já travado há menos de 10min — aborta
        return Date.now(); // livre (ou travado há muito tempo, provavelmente travou e nunca destravou) — assume a trava
    });
    if (!resultadoTrava.committed) {
        msgEl.textContent = '⚠️ Detectei uma importação rodando em outro aparelho/aba agora — espera ela terminar (ou tenta de novo em alguns minutos) antes de importar por aqui.';
        return;
    }

    _importacaoGestaoEmAndamento = true;
    botao.disabled = true;
    botao.textContent = '⏳ Importando... não clica de novo';

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
                const jaExiste = acharIngredientePorNomeEUnidade(ingredientes, ing.nome, ing.unidade);
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
                const telNormalizado = normalizarTelefoneClienteBrasil(cli.telefone);
                const jaExiste = telNormalizado
                    ? clientesGestao.find(c => normalizarTelefoneClienteBrasil(c.telefone) === telNormalizado)
                    : acharPorNome(clientesGestao, cli.nome);
                if (jaExiste) { mapaClientes[cli.id] = jaExiste.id; continue; }
                const { id: idAntigo, ...resto } = cli;
                const ref = await db.ref('clientesGestao').push(resto);
                mapaClientes[idAntigo] = ref.key;
            }

            // 5) Pedidos antigos -> nó "pedidos" (mesmo que o cardápio usa, origem:'manual')
            // Proteção contra duplicata: marca cada pedido importado com o id ORIGINAL do
            // backup (origemBackupId) — antes de importar, busca quais ids já foram
            // importados antes, pra nunca trazer o mesmo pedido duas vezes
            msgEl.textContent = 'Verificando pedidos já importados antes...';
            const todosPedidosSnap = await db.ref('pedidos').once('value');
            const todosPedidosVal = todosPedidosSnap.val() || {};
            const idsJaImportados = new Set(
                Object.values(todosPedidosVal)
                    .map(p => p.origemBackupId)
                    .filter(Boolean)
            );

            msgEl.textContent = 'Importando pedidos...';
            let pedidosPulados = 0;
            // Ordena por data ANTES de importar — assim o número sequencial (#1, #2, #3...)
            // reflete a ordem cronológica de verdade, não a ordem em que estavam no arquivo
            const pedidosOrdenados = [...(dados.pedidos || [])].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
            for (const ped of pedidosOrdenados) {
                if (idsJaImportados.has(ped.id)) { pedidosPulados++; continue; }

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
                    origemBackupId: ped.id, // marca de onde veio, pra nunca duplicar numa reimportação
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

            msgEl.textContent = `✅ Importado! ${qtdIng} ingrediente(s), ${qtdBases} base(s), ${qtdProdutos} produto(s), ${qtdClientes} cliente(s) e ${qtdPedidos - pedidosPulados} pedido(s) novo(s) (${pedidosPulados} já tinham sido importados antes e foram pulados). Nada duplicado.`;
        } catch (err) {
            msgEl.textContent = 'Erro ao importar: ' + err.message;
        } finally {
            window._importandoBackupGestao = false;
            _importacaoGestaoEmAndamento = false;
            db.ref('configuracao/importacaoGestaoTravada').remove();
            botao.disabled = false;
            botao.textContent = '📥 Importar';
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

        // Monta o histórico por uma CHAVE CANÔNICA de telefone. Antes, o código usava
        // pedido.telefone como chave literal; então "(27) 99999-9999", "27999999999" e
        // "+55 27 99999-9999" podiam virar três clientes diferentes e deixar uma compra recente
        // presa em outro registro. Isso fazia clientes recorrentes aparecerem como inativos.
        const resumoPorTelefone = {};
        Object.values(pedidos).forEach(pedido => {
            const telefoneChave = normalizarTelefoneClienteBrasil(pedido.telefone);
            if (!telefoneChave || telefoneChave.length < 10) return;

            if (!resumoPorTelefone[telefoneChave]) {
                resumoPorTelefone[telefoneChave] = {
                    nome: pedido.nome,
                    telefoneExibicao: pedido.telefone || telefoneChave,
                    ultimaCompra: 0,
                    totalGasto: 0,
                    recompensas: []
                };
            }

            const resumo = resumoPorTelefone[telefoneChave];

            // Para "última compra", considera compra concluída de verdade. Pedido pendente,
            // recusado ou ainda em preparo não deve reiniciar o relógio de inatividade.
            if (pedido.status === 'entregue') {
                if (pedido.timestamp && pedido.timestamp > resumo.ultimaCompra) {
                    resumo.ultimaCompra = pedido.timestamp;
                    resumo.nome = pedido.nome || resumo.nome;
                    resumo.telefoneExibicao = pedido.telefone || resumo.telefoneExibicao;
                }
                resumo.totalGasto += totalDoPedido(pedido) || 0;

                if (pedido.recompensaResgatada) {
                    resumo.recompensas.push({ descricao: pedido.recompensaResgatada.descricao, data: pedido.timestamp });
                }
            }
        });

        // O Clube de Fidelidade também pode ter a chave salva com formatação diferente.
        // Normaliza as chaves antes de cruzar com os pedidos para não separar o mesmo cliente.
        const clubePorTelefone = {};
        Object.entries(clubeFidelidade).forEach(([telefoneOriginal, dados]) => {
            const telefoneChave = normalizarTelefoneClienteBrasil(telefoneOriginal);
            if (!telefoneChave || telefoneChave.length < 10) return;

            // Se houver mais de um registro histórico para o mesmo número, preserva aquele
            // com mais informação/pontos e nunca apaga dados válidos do outro.
            const atual = clubePorTelefone[telefoneChave];
            if (!atual) {
                clubePorTelefone[telefoneChave] = dados || {};
            } else {
                clubePorTelefone[telefoneChave] = {
                    ...atual,
                    ...(dados || {}),
                    pontos: Math.max(Number(atual.pontos || 0), Number((dados || {}).pontos || 0)),
                    totalGasto: Math.max(Number(atual.totalGasto || 0), Number((dados || {}).totalGasto || 0)),
                    criadoEm: Math.min(
                        Number(atual.criadoEm || Number.MAX_SAFE_INTEGER),
                        Number((dados || {}).criadoEm || Number.MAX_SAFE_INTEGER)
                    )
                };
                if (clubePorTelefone[telefoneChave].criadoEm === Number.MAX_SAFE_INTEGER) {
                    delete clubePorTelefone[telefoneChave].criadoEm;
                }
            }

            if (!resumoPorTelefone[telefoneChave]) {
                resumoPorTelefone[telefoneChave] = {
                    nome: dados && dados.nome,
                    telefoneExibicao: telefoneOriginal,
                    ultimaCompra: 0,
                    totalGasto: 0,
                    recompensas: []
                };
            }
        });

        const agora = Date.now();
        const listaClientes = Object.entries(resumoPorTelefone).map(([telefoneChave, resumo]) => {
            const dadosClube = clubePorTelefone[telefoneChave] || null;
            const referencia = resumo.ultimaCompra || (dadosClube && dadosClube.criadoEm) || agora;
            const diasSemComprar = Math.max(0, Math.floor((agora - referencia) / (1000 * 60 * 60 * 24)));
            return {
                // Usa a chave canônica para WhatsApp/comparações e mantém o formato mais recente
                // apenas como apresentação no detalhe do cliente.
                telefone: telefoneChave,
                telefoneExibicao: resumo.telefoneExibicao || telefoneChave,
                nome: resumo.nome || (dadosClube && dadosClube.nome) || 'Sem nome',
                diasSemComprar,
                nuncaComprou: !resumo.ultimaCompra,
                ehDoClube: !!dadosClube,
                pontos: dadosClube ? (dadosClube.pontos || 0) : 0,
                totalGasto: dadosClube ? Math.max(Number(dadosClube.totalGasto || 0), Number(resumo.totalGasto || 0)) : resumo.totalGasto,
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
            const linkWhats = `https://api.whatsapp.com/send?phone=55${c.telefone}&text=${mensagem}`;
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
                        <p style="margin:0 0 6px;"><strong>Telefone:</strong> ${c.telefoneExibicao || c.telefone}</p>
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

// Ativa/desativa o aviso automático de "loja abriu" — pensado pra quem precisa abrir
// a loja durante testes sem disparar notificação de verdade pros clientes. Salva no
// mesmo caminho que a Cloud Function já lê (configuracao/notificacoes/avisoAberturaAtivo).
function salvarNotificacaoAberturaAtiva(ativo) {
    const msgEl = document.getElementById('msgNotificacaoAbertura');
    db.ref('configuracao/notificacoes/avisoAberturaAtivo').set(!!ativo)
        .then(() => { if (msgEl) msgEl.textContent = (ativo ? 'Notificações Ativada' : 'Notificações Desativada') + ' — Salvo!'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}

// Toggle de imprimir automaticamente ao aceitar um pedido — mesmo padrão do toggle
// de aviso de abertura. Guarda um valor global (impressaoAutomaticaAtiva) que
// responderPedido() confere antes de chamar a impressão.
let impressaoAutomaticaAtiva = false;
function salvarImpressaoAutomaticaAtiva(ativo) {
    const msgEl = document.getElementById('msgImpressaoAutomatica');
    db.ref('configuracao/loja/impressaoAutomaticaAtiva').set(!!ativo)
        .then(() => { if (msgEl) msgEl.textContent = (ativo ? 'Ativada' : 'Desativada') + ' — Salvo!'; })
        .catch(err => { if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message; });
}
function escutarImpressaoAutomaticaAtiva() {
    db.ref('configuracao/loja/impressaoAutomaticaAtiva').on('value', snap => {
        impressaoAutomaticaAtiva = !!snap.val();
        const chk = document.getElementById('chkImpressaoAutomatica');
        if (chk) chk.checked = impressaoAutomaticaAtiva;
    });
}

// Carrega o estado atual do toggle, pra marcar o checkbox certo já na abertura do
// painel (sem isso, sempre apareceria desmarcado, mesmo se já tivesse sido ativado antes)
function escutarNotificacaoAberturaAtiva() {
    db.ref('configuracao/notificacoes/avisoAberturaAtivo').on('value', snap => {
        const chk = document.getElementById('chkNotificacaoAberturaAtiva');
        if (!chk) return;
        // Mesma regra da Cloud Function: se nunca foi configurado, considera ativo por padrão
        chk.checked = snap.exists() ? !!snap.val() : true;
    });
}

function escutarConfigLoja() {
    db.ref('configuracao/loja').on('value', snap => {
        const config = snap.val() || {};
        montarLinhasHorario(config.horarios);

        const nomeBarraPedeaki = document.getElementById('barraPedeakiNomeLoja');
        if (nomeBarraPedeaki) nomeBarraPedeaki.textContent = config.nomeLoja || (typeof LOJA_CONFIG !== 'undefined' ? LOJA_CONFIG.nome : 'Loja');

        const modo = config.modoManual || 'auto';
        marcarModoSelecionado(modo);

        aplicarEstadoOperacionalLoja(config);

        const chkPagamento = document.getElementById('chkPagamentoOnlineAtivo');
        if (chkPagamento) chkPagamento.checked = !!config.pagamentoOnlineAtivo;

        adicionaisAtivo = !!config.adicionaisAtivo;
        const chkAdicionais = document.getElementById('chkAdicionaisAtivo');
        if (chkAdicionais) chkAdicionais.checked = adicionaisAtivo;
        atualizarVisibilidadeAdicionaisProdutos(adicionaisAtivo);
        atualizarPainelAdicionaisLoja(adicionaisAtivo);

        const chkAgendamento = document.getElementById('chkAgendamentoAtivo');
        if (chkAgendamento) chkAgendamento.checked = !!config.agendamentoAtivo;
        // Esconde "Disponível pra Encomenda" também quando a PRÓPRIA LOJA desliga esse
        // recurso — antes só escondia quando o DONO DO SERVIÇO desligava lá na
        // Administração; os dois interruptores precisam funcionar independentemente
        document.body.classList.toggle('ocultar-campo-encomenda-por-loja', !config.agendamentoAtivo);

        const painelLogo = document.getElementById('painelLogo');
        if (painelLogo && config.logoUrl) painelLogo.src = config.logoUrl;

        const campoPedidoMinimo = document.getElementById('valorPedidoMinimo');
        const campoFreteGratis = document.getElementById('valorFreteGratisAcima');
        if (campoPedidoMinimo) campoPedidoMinimo.value = config.pedidoMinimo || '';
        if (campoFreteGratis) campoFreteGratis.value = config.freteGratisAcima || '';
        // Guarda o valor salvo — o dropdown de produtos só existe depois dos produtos
        // carregarem, então aplicamos essa seleção assim que ele for montado
        produtoSugeridoFreteGratisSalvo = config.produtoSugeridoFreteGratis || '';
        aplicarSelecaoProdutoSugeridoFreteGratis();
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


// Traduz os dois campos antigos (disponivel/escondido) em um único status visual.
// Não muda a estrutura salva no Firebase: preserva compatibilidade com o cardápio atual.
function obterStatusProdutoAdmin(produto) {
    if (produto && produto.escondido) return 'inativo';
    if (produto && produto.disponivel !== false) return 'ativo';
    return 'em_falta';
}

function aplicarStatusProdutoNoFormulario(id) {
    const marcado = document.querySelector(`input[name="prodStatus_${id}"]:checked`);
    const chkDisponivel = document.getElementById('prodDisp_' + id);
    const chkEscondido = document.getElementById('prodEscondido_' + id);
    if (!marcado || !chkDisponivel || !chkEscondido) return;

    const status = marcado.value;
    if (status === 'ativo') {
        chkDisponivel.checked = true;
        chkEscondido.checked = false;
    } else if (status === 'em_falta') {
        chkDisponivel.checked = false;
        chkEscondido.checked = false;
    } else {
        chkDisponivel.checked = false;
        chkEscondido.checked = true;
    }
    atualizarAjudaTopoProduto(id, status);
}

// Controles compactos do topo do produto. Nesta etapa o estoque é opcional e
// fica salvo no próprio produto; o consumo automático por venda será tratado
// separadamente para não misturar com o fluxo estável de pedidos/pagamentos.
function alternarControleEstoqueProduto(id) {
    const chk = document.getElementById('prodControlarEstoque_' + id);
    const bloco = document.getElementById('prodEstoqueBloco_' + id);
    const qtd = document.getElementById('prodEstoqueQtd_' + id);
    if (!chk || !bloco) return;
    bloco.hidden = !chk.checked;
    bloco.classList.toggle('ativo', chk.checked);
    if (qtd) qtd.disabled = !chk.checked;
    atualizarAjudaTopoProduto(id, 'estoque');
}

function atualizarAjudaTopoProduto(id, origem) {
    const ajuda = document.getElementById('prodTopoAjuda_' + id);
    if (!ajuda) return;
    const mensagens = {
        ativo: 'Disponível para venda no cardápio.',
        em_falta: 'Continua visível no cardápio como esgotado.',
        inativo: 'Fica oculto do cardápio até ser ativado novamente.',
        estoque: document.getElementById('prodControlarEstoque_' + id)?.checked
            ? 'Controle de estoque ligado — informe a quantidade disponível.'
            : 'Sem controle de quantidade — o status continua manual.',
        encomenda: document.getElementById('prodEncomenda_' + id)?.checked
            ? 'Este produto também pode ser vendido por encomenda.'
            : 'Venda por encomenda desativada para este produto.'
    };
    ajuda.textContent = mensagens[origem] || mensagens.ativo;
}



// ---------- PRODUTOS: VISÃO COMPACTA / RECOLHÍVEL ----------
// Mantém o formulário completo intacto, mas deixa os produtos recolhidos por padrão
// para reduzir drasticamente o comprimento da página. O estado é apenas visual/local.
const produtosAdminExpandidos = new Set();
let produtoAdminAbrirAposRender = null;

function rotuloStatusProdutoResumo(status) {
    if (status === 'ativo') return 'Ativo';
    if (status === 'em_falta') return 'Em falta';
    return 'Inativo';
}

function formatarPrecoResumoProduto(valor) {
    const numero = paraNumeroFlexivel(valor);
    if (!Number.isFinite(numero)) return 'R$ 0,00';
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function atualizarResumoProdutoAdmin(id) {
    const card = document.getElementById('produtoCard_' + id);
    if (!card) return;

    const nome = (card.querySelector('#prodNome_' + id)?.value || 'Produto sem nome').trim() || 'Produto sem nome';
    const categoria = (card.querySelector('#prodCategoria_' + id)?.value || 'Sem categoria').trim() || 'Sem categoria';
    const preco = card.querySelector('#prodPreco_' + id)?.value || '0';
    const status = card.querySelector(`input[name="prodStatus_${id}"]:checked`)?.value || 'em_falta';
    const estoqueLigado = !!card.querySelector('#prodControlarEstoque_' + id)?.checked;
    const qtdEstoque = Number(card.querySelector('#prodEstoqueQtd_' + id)?.value || 0);
    const encomenda = !!card.querySelector('#prodEncomenda_' + id)?.checked;

    const nomeEl = card.querySelector('[data-prod-resumo="nome"]');
    const categoriaEl = card.querySelector('[data-prod-resumo="categoria"]');
    const precoEl = card.querySelector('[data-prod-resumo="preco"]');
    const statusEl = card.querySelector('[data-prod-resumo="status"]');
    const estoqueEl = card.querySelector('[data-prod-resumo="estoque"]');
    const encomendaEl = card.querySelector('[data-prod-resumo="encomenda"]');

    if (nomeEl) nomeEl.textContent = nome;
    if (categoriaEl) categoriaEl.textContent = categoria;
    if (precoEl) precoEl.textContent = formatarPrecoResumoProduto(preco);
    if (statusEl) {
        statusEl.textContent = rotuloStatusProdutoResumo(status);
        statusEl.className = `produto-resumo-status produto-resumo-status--${status}`;
    }
    if (estoqueEl) {
        estoqueEl.hidden = !estoqueLigado;
        estoqueEl.textContent = estoqueLigado ? `📦 ${Math.max(0, qtdEstoque)} un.` : '';
    }
    if (encomendaEl) encomendaEl.hidden = !encomenda;
}

function definirProdutoAdminRecolhido(id, recolher) {
    const card = document.getElementById('produtoCard_' + id);
    if (!card) return;

    card.classList.toggle('produto-card-recolhido', !!recolher);
    if (recolher) produtosAdminExpandidos.delete(id);
    else produtosAdminExpandidos.add(id);

    const botao = card.querySelector('.produto-resumo-toggle');
    if (botao) {
        botao.textContent = recolher ? '✏️ Editar' : '▲ Recolher';
        botao.setAttribute('aria-expanded', String(!recolher));
    }
    atualizarResumoProdutoAdmin(id);
}

function alternarProdutoAdmin(id) {
    const card = document.getElementById('produtoCard_' + id);
    if (!card) return;
    definirProdutoAdminRecolhido(id, !card.classList.contains('produto-card-recolhido'));
}

function expandirTodosProdutosAdmin() {
    document.querySelectorAll('#produtosAdminList .produto-admin-item').forEach(card => {
        if (card.style.display === 'none') return;
        const id = card.id.replace('produtoCard_', '');
        definirProdutoAdminRecolhido(id, false);
    });
}

function recolherTodosProdutosAdmin() {
    document.querySelectorAll('#produtosAdminList .produto-admin-item').forEach(card => {
        if (card.style.display === 'none') return;
        const id = card.id.replace('produtoCard_', '');
        definirProdutoAdminRecolhido(id, true);
    });
}

function garantirControlesCompactacaoProdutos() {
    const cabecalho = document.querySelector('.produtos-premium-lista-shell .produtos-premium-lista-head');
    if (!cabecalho || cabecalho.querySelector('.produtos-lista-acoes-compactacao')) return;

    const acoes = document.createElement('div');
    acoes.className = 'produtos-lista-acoes-compactacao';
    acoes.innerHTML = `
        <button type="button" class="btn-produtos-compactacao" onclick="expandirTodosProdutosAdmin()">▾ Expandir todos</button>
        <button type="button" class="btn-produtos-compactacao btn-produtos-compactacao--recolher" onclick="recolherTodosProdutosAdmin()">▴ Recolher todos</button>
    `;
    cabecalho.appendChild(acoes);
}

function criarResumoProdutoAdmin(id, produto) {
    const resumo = document.createElement('div');
    resumo.className = 'produto-resumo-premium';
    resumo.setAttribute('role', 'button');
    resumo.setAttribute('tabindex', '0');
    resumo.setAttribute('aria-label', 'Abrir ou recolher edição deste produto');

    const foto = (Array.isArray(produto.imagens) && produto.imagens[0]) || produto.imagem || '';
    const status = obterStatusProdutoAdmin(produto);
    const estoqueLigado = produto.controlarEstoque === true;
    const qtdEstoque = Math.max(0, Number(produto.estoqueProduto) || 0);

    resumo.innerHTML = `
        <div class="produto-resumo-thumb" aria-hidden="true"></div>
        <div class="produto-resumo-identidade">
            <strong data-prod-resumo="nome"></strong>
            <div class="produto-resumo-sublinha">
                <span data-prod-resumo="categoria"></span>
                <span class="produto-resumo-separador">•</span>
                <b data-prod-resumo="preco"></b>
            </div>
        </div>
        <div class="produto-resumo-sinais">
            <span data-prod-resumo="status" class="produto-resumo-status produto-resumo-status--${status}">${rotuloStatusProdutoResumo(status)}</span>
            <span data-prod-resumo="estoque" class="produto-resumo-chip" ${estoqueLigado ? '' : 'hidden'}>${estoqueLigado ? `📦 ${qtdEstoque} un.` : ''}</span>
            <span data-prod-resumo="encomenda" class="produto-resumo-chip" ${produto.disponivelParaEncomenda ? '' : 'hidden'}>🎂 Encomenda</span>
        </div>
        <button type="button" class="produto-resumo-toggle" aria-expanded="false">✏️ Editar</button>
    `;

    const thumb = resumo.querySelector('.produto-resumo-thumb');
    if (thumb) {
        if (foto) {
            const img = document.createElement('img');
            img.src = foto;
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = () => { thumb.textContent = '📦'; thumb.classList.add('sem-foto'); };
            thumb.appendChild(img);
        } else {
            thumb.textContent = '📦';
            thumb.classList.add('sem-foto');
        }
    }

    const nomeEl = resumo.querySelector('[data-prod-resumo="nome"]');
    const categoriaEl = resumo.querySelector('[data-prod-resumo="categoria"]');
    const precoEl = resumo.querySelector('[data-prod-resumo="preco"]');
    if (nomeEl) nomeEl.textContent = produto.nome || 'Produto sem nome';
    if (categoriaEl) categoriaEl.textContent = produto.categoria || 'Sem categoria';
    if (precoEl) precoEl.textContent = formatarPrecoResumoProduto(produto.preco);

    resumo.querySelector('.produto-resumo-toggle')?.addEventListener('click', event => {
        event.stopPropagation();
        alternarProdutoAdmin(id);
    });
    resumo.addEventListener('click', event => {
        if (event.target.closest('button')) return;
        alternarProdutoAdmin(id);
    });
    resumo.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        alternarProdutoAdmin(id);
    });

    return resumo;
}

// ---------- DISPONIBILIDADE PROGRAMADA DO PRODUTO ----------
// Campo opcional e retrocompatível: produtos antigos, sem agenda, continuam sempre disponíveis.
function normalizarAgendaDisponibilidadeProduto(produto) {
    const agenda = produto && produto.agendaDisponibilidade;
    if (!agenda || agenda.ativa !== true || !agenda.dias || typeof agenda.dias !== 'object') {
        return { ativa: false, dias: {} };
    }
    return { ativa: true, dias: agenda.dias || {} };
}

function resumoAgendaDisponibilidadeProduto(produto) {
    const agenda = normalizarAgendaDisponibilidadeProduto(produto);
    if (!agenda.ativa) return 'Sempre disponível';
    const diasAtivos = Object.values(agenda.dias).filter(d => d && d.ativo && d.inicio && d.fim);
    if (!diasAtivos.length) return 'Programação incompleta';
    return `${diasAtivos.length} dia${diasAtivos.length > 1 ? 's' : ''} programado${diasAtivos.length > 1 ? 's' : ''}`;
}

function alternarAgendaProduto(id) {
    const chk = document.getElementById('prodAgendaAtiva_' + id);
    const painel = document.getElementById('prodAgendaPainel_' + id);
    const resumo = document.getElementById('prodAgendaResumo_' + id);
    if (painel) painel.style.display = chk && chk.checked ? 'block' : 'none';
    if (resumo) resumo.textContent = chk && chk.checked ? 'Programada' : 'Sempre disponível';
}

function coletarAgendaDisponibilidadeProduto(id) {
    const ativa = !!document.getElementById('prodAgendaAtiva_' + id)?.checked;
    if (!ativa) return { ativa: false, dias: {} };

    const dias = {};
    let temDiaValido = false;
    for (let dia = 0; dia <= 6; dia++) {
        const ativo = !!document.getElementById(`prodAgendaDia_${id}_${dia}`)?.checked;
        const inicio = (document.getElementById(`prodAgendaInicio_${id}_${dia}`)?.value || '').trim();
        const fim = (document.getElementById(`prodAgendaFim_${id}_${dia}`)?.value || '').trim();
        dias[dia] = { ativo, inicio, fim };
        if (ativo && inicio && fim) temDiaValido = true;
        if (ativo && (!inicio || !fim)) {
            alert('Preencha o horário inicial e final de todos os dias marcados na disponibilidade programada.');
            return null;
        }
    }
    if (!temDiaValido) {
        alert('Marque pelo menos um dia com horário para usar a disponibilidade programada.');
        return null;
    }
    return { ativa: true, dias };
}

function htmlAgendaDisponibilidadeProduto(id, produto) {
    const agenda = normalizarAgendaDisponibilidadeProduto(produto);
    const nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const linhas = nomes.map((nome, dia) => {
        const regra = agenda.dias && agenda.dias[dia] ? agenda.dias[dia] : {};
        const ativo = regra.ativo === true;
        return `
            <div class="produto-agenda-dia ${ativo ? 'ativo' : ''}">
                <label class="produto-agenda-dia-check">
                    <input type="checkbox" id="prodAgendaDia_${id}_${dia}" ${ativo ? 'checked' : ''} onchange="this.closest('.produto-agenda-dia').classList.toggle('ativo', this.checked)">
                    <span>${nome}</span>
                </label>
                <div class="produto-agenda-horas">
                    <input type="time" id="prodAgendaInicio_${id}_${dia}" value="${regra.inicio || ''}" aria-label="Início ${nome}">
                    <span>até</span>
                    <input type="time" id="prodAgendaFim_${id}_${dia}" value="${regra.fim || ''}" aria-label="Fim ${nome}">
                </div>
            </div>`;
    }).join('');

    return `
        <details class="produto-agenda-card">
            <summary>
                <span class="produto-agenda-titulo">🕒 Disponibilidade por horário</span>
                <span class="produto-agenda-resumo" id="prodAgendaResumo_${id}">${resumoAgendaDisponibilidadeProduto(produto)}</span>
            </summary>
            <div class="produto-agenda-conteudo">
                <label class="produto-agenda-chave">
                    <input type="checkbox" id="prodAgendaAtiva_${id}" ${agenda.ativa ? 'checked' : ''} onchange="alternarAgendaProduto('${id}')">
                    <span>Programar dias e horários</span>
                </label>
                <div id="prodAgendaPainel_${id}" class="produto-agenda-painel" style="display:${agenda.ativa ? 'block' : 'none'};">
                    <p class="produto-agenda-ajuda">Fora desses horários o produto continua visível, mas não pode ser comprado. “Em falta” e “Inativo” continuam tendo prioridade.</p>
                    <div class="produto-agenda-grade">${linhas}</div>
                    <p class="produto-agenda-nota">Horários que atravessam a meia-noite também funcionam (ex.: 18:00 até 02:00).</p>
                </div>
            </div>
        </details>`;
}


// ---------- Editor visual de Adicionais por Produto ----------
// Mantém exatamente a mesma estrutura `grupoAdicionais` usada pelo cardápio,
// mas troca o cadastro técnico em texto por uma interface visual mais simples.
function escaparHtmlAdicional(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, caractere => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[caractere]);
}

function formatarPrecoAdicionalAdmin(valor) {
    const numero = Number(valor) || 0;
    return numero > 0 ? numero.toFixed(2).replace('.', ',') : '';
}

function htmlOpcaoAdicionalVisual(id, opcao = {}) {
    return `
        <div class="adicional-opcao-row" data-adicional-opcao>
            <div class="adicional-opcao-campo adicional-opcao-campo--nome">
                <label>Opção</label>
                <input type="text" class="adicional-opcao-nome" value="${escaparHtmlAdicional(opcao.nome || '')}" placeholder="Ex.: Chocolate" oninput="sincronizarTextareaAdicionaisProduto('${id}')">
            </div>
            <div class="adicional-opcao-campo adicional-opcao-campo--preco">
                <label>Acréscimo</label>
                <div class="adicional-preco-input">
                    <span>R$</span>
                    <input type="text" inputmode="decimal" class="adicional-opcao-preco" value="${formatarPrecoAdicionalAdmin(opcao.preco)}" placeholder="0,00" oninput="sincronizarTextareaAdicionaisProduto('${id}')">
                </div>
            </div>
            <button type="button" class="adicional-opcao-remover" title="Remover opção" aria-label="Remover opção" onclick="removerOpcaoAdicionalVisual('${id}', this)">×</button>
        </div>`;
}

function htmlGrupoAdicionalVisual(id, grupo = {}) {
    const obrigatorio = grupo.obrigatorio !== false;
    const opcoes = Array.isArray(grupo.opcoes) && grupo.opcoes.length
        ? grupo.opcoes
        : [{ nome: '', preco: 0 }, { nome: '', preco: 0 }];
    return `
        <div class="adicional-grupo-card" data-adicional-grupo>
            <div class="adicional-grupo-topo">
                <div class="adicional-grupo-campo-nome">
                    <label>Nome do grupo</label>
                    <input type="text" class="adicional-grupo-nome" value="${escaparHtmlAdicional(grupo.nome || '')}" placeholder="Ex.: Escolha o recheio" oninput="sincronizarTextareaAdicionaisProduto('${id}')">
                </div>
                <div class="adicional-grupo-campo-tipo">
                    <label>Como o cliente escolhe</label>
                    <select class="adicional-grupo-tipo" onchange="atualizarAjudaGrupoAdicionalVisual(this); sincronizarTextareaAdicionaisProduto('${id}')">
                        <option value="obrigatorio" ${obrigatorio ? 'selected' : ''}>1 escolha obrigatória</option>
                        <option value="opcional" ${!obrigatorio ? 'selected' : ''}>Extras opcionais</option>
                    </select>
                </div>
                <button type="button" class="adicional-grupo-remover" onclick="removerGrupoAdicionalVisual('${id}', this)">🗑 Remover grupo</button>
            </div>
            <div class="adicional-grupo-ajuda">
                ${obrigatorio
                    ? 'O cliente precisa escolher exatamente 1 opção deste grupo.'
                    : 'O cliente pode escolher quantas opções quiser — ou nenhuma.'}
            </div>
            <div class="adicionais-opcoes-list">
                ${opcoes.map(opcao => htmlOpcaoAdicionalVisual(id, opcao)).join('')}
            </div>
            <button type="button" class="adicional-add-opcao" onclick="adicionarOpcaoAdicionalVisual('${id}', this)">＋ Adicionar opção</button>
        </div>`;
}

function htmlEditorAdicionaisProduto(id, grupos) {
    const lista = Array.isArray(grupos) ? grupos : [];
    const totalOpcoes = lista.reduce((soma, grupo) => soma + ((grupo && grupo.opcoes) ? grupo.opcoes.length : 0), 0);
    const resumo = lista.length
        ? `${lista.length} ${lista.length === 1 ? 'grupo' : 'grupos'} • ${totalOpcoes} ${totalOpcoes === 1 ? 'opção' : 'opções'}`
        : 'Nenhum adicional configurado';
    return `
        <details class="adicionais-editor-premium" ${lista.length ? 'open' : ''}>
            <summary>
                <span class="adicionais-summary-icon">＋</span>
                <span class="adicionais-summary-texto">
                    <strong>Adicionais do produto</strong>
                    <small>Recheios, complementos e extras</small>
                </span>
                <span class="adicionais-summary-contador" id="adicionaisResumo_${id}">${resumo}</span>
                <span class="adicionais-summary-seta">⌄</span>
            </summary>
            <div class="adicionais-editor-corpo">
                <div class="adicionais-editor-intro">
                    <div>
                        <span class="adicionais-editor-kicker">CONFIGURAÇÃO VISUAL</span>
                        <h4>Monte as escolhas do cliente</h4>
                        <p>Crie grupos e opções sem códigos. Você pode cobrar um valor extra em cada opção.</p>
                    </div>
                    <div class="adicionais-editor-legenda">
                        <span><i class="obrigatorio"></i> 1 escolha obrigatória</span>
                        <span><i class="opcional"></i> Várias escolhas opcionais</span>
                    </div>
                </div>

                <div id="adicionaisEditor_${id}" class="adicionais-grupos-lista">
                    ${lista.length
                        ? lista.map(grupo => htmlGrupoAdicionalVisual(id, grupo)).join('')
                        : `<div class="adicionais-vazio">
                            <span class="adicionais-vazio-icon">✦</span>
                            <strong>Este produto ainda não tem adicionais</strong>
                            <p>Use um dos botões abaixo para criar o primeiro grupo.</p>
                        </div>`}
                </div>

                <div class="adicionais-acoes-criar">
                    <button type="button" class="adicional-criar-grupo adicional-criar-grupo--obrigatorio" onclick="adicionarGrupoAdicionalVisual('${id}', 'obrigatorio')">
                        <span>＋</span><div><strong>Escolha obrigatória</strong><small>Ex.: tamanho, recheio ou sabor</small></div>
                    </button>
                    <button type="button" class="adicional-criar-grupo adicional-criar-grupo--opcional" onclick="adicionarGrupoAdicionalVisual('${id}', 'opcional')">
                        <span>＋</span><div><strong>Extras opcionais</strong><small>Ex.: bacon, cobertura ou adicional</small></div>
                    </button>
                </div>

                <input type="hidden" id="prodAdicionais_${id}" value="${escaparHtmlAdicional(montarTextoAdicionaisParaEdicao(lista))}">
                <p id="avisoAdicionais_${id}" class="aviso-adicionais adicional-aviso-visual" style="display:none;"></p>
            </div>
        </details>`;
}

function atualizarAjudaGrupoAdicionalVisual(select) {
    const grupo = select && select.closest('[data-adicional-grupo]');
    const ajuda = grupo && grupo.querySelector('.adicional-grupo-ajuda');
    if (!ajuda) return;
    ajuda.textContent = select.value === 'obrigatorio'
        ? 'O cliente precisa escolher exatamente 1 opção deste grupo.'
        : 'O cliente pode escolher quantas opções quiser — ou nenhuma.';
}

function adicionarGrupoAdicionalVisual(id, tipo = 'obrigatorio') {
    const container = document.getElementById('adicionaisEditor_' + id);
    if (!container) return;
    const vazio = container.querySelector('.adicionais-vazio');
    if (vazio) vazio.remove();
    container.insertAdjacentHTML('beforeend', htmlGrupoAdicionalVisual(id, {
        nome: '',
        obrigatorio: tipo !== 'opcional',
        opcoes: [{ nome: '', preco: 0 }, { nome: '', preco: 0 }]
    }));
    const details = container.closest('details');
    if (details) details.open = true;
    const ultimoGrupo = container.lastElementChild;
    const campoNome = ultimoGrupo && ultimoGrupo.querySelector('.adicional-grupo-nome');
    if (campoNome) campoNome.focus();
    sincronizarTextareaAdicionaisProduto(id);
}

function removerGrupoAdicionalVisual(id, botao) {
    const grupo = botao && botao.closest('[data-adicional-grupo]');
    const container = document.getElementById('adicionaisEditor_' + id);
    if (!grupo || !container) return;
    const temConteudo = Array.from(grupo.querySelectorAll('input[type="text"]')).some(input => input.value.trim());
    if (temConteudo && !confirm('Remover este grupo de adicionais?')) return;
    grupo.remove();
    if (!container.querySelector('[data-adicional-grupo]')) {
        container.innerHTML = `<div class="adicionais-vazio">
            <span class="adicionais-vazio-icon">✦</span>
            <strong>Este produto ainda não tem adicionais</strong>
            <p>Use um dos botões abaixo para criar o primeiro grupo.</p>
        </div>`;
    }
    sincronizarTextareaAdicionaisProduto(id);
}

function adicionarOpcaoAdicionalVisual(id, botao) {
    const grupo = botao && botao.closest('[data-adicional-grupo]');
    const lista = grupo && grupo.querySelector('.adicionais-opcoes-list');
    if (!lista) return;
    lista.insertAdjacentHTML('beforeend', htmlOpcaoAdicionalVisual(id, { nome: '', preco: 0 }));
    const ultima = lista.lastElementChild;
    const campo = ultima && ultima.querySelector('.adicional-opcao-nome');
    if (campo) campo.focus();
    sincronizarTextareaAdicionaisProduto(id);
}

function removerOpcaoAdicionalVisual(id, botao) {
    const linha = botao && botao.closest('[data-adicional-opcao]');
    const lista = linha && linha.parentElement;
    if (!linha || !lista) return;
    if (lista.querySelectorAll('[data-adicional-opcao]').length <= 1) {
        linha.querySelectorAll('input').forEach(input => { input.value = ''; });
    } else {
        linha.remove();
    }
    sincronizarTextareaAdicionaisProduto(id);
}

function atualizarResumoAdicionaisVisual(id, grupos) {
    const resumo = document.getElementById('adicionaisResumo_' + id);
    if (!resumo) return;
    const totalGrupos = grupos.length;
    const totalOpcoes = grupos.reduce((soma, grupo) => soma + grupo.opcoes.length, 0);
    resumo.textContent = totalGrupos
        ? `${totalGrupos} ${totalGrupos === 1 ? 'grupo' : 'grupos'} • ${totalOpcoes} ${totalOpcoes === 1 ? 'opção' : 'opções'}`
        : 'Nenhum adicional configurado';
}

function sincronizarTextareaAdicionaisProduto(id, validar = false) {
    const container = document.getElementById('adicionaisEditor_' + id);
    const campoLegado = document.getElementById('prodAdicionais_' + id);
    const aviso = document.getElementById('avisoAdicionais_' + id);
    if (!container || !campoLegado) return '';

    const grupos = [];
    const cards = Array.from(container.querySelectorAll('[data-adicional-grupo]'));

    for (let gi = 0; gi < cards.length; gi++) {
        const card = cards[gi];
        const nome = (card.querySelector('.adicional-grupo-nome')?.value || '').trim();
        const obrigatorio = (card.querySelector('.adicional-grupo-tipo')?.value || 'obrigatorio') === 'obrigatorio';
        const linhas = Array.from(card.querySelectorAll('[data-adicional-opcao]'));
        const opcoes = linhas.map(linha => {
            const nomeOpcao = (linha.querySelector('.adicional-opcao-nome')?.value || '').trim();
            const precoTexto = (linha.querySelector('.adicional-opcao-preco')?.value || '').trim();
            const preco = paraNumeroFlexivel(precoTexto);
            return { nome: nomeOpcao, preco };
        }).filter(opcao => opcao.nome);

        const grupoTemAlgumConteudo = nome || linhas.some(linha =>
            (linha.querySelector('.adicional-opcao-nome')?.value || '').trim() ||
            (linha.querySelector('.adicional-opcao-preco')?.value || '').trim()
        );
        if (!grupoTemAlgumConteudo) continue;

        if (validar && !nome) {
            if (aviso) {
                aviso.style.display = 'block';
                aviso.textContent = `⚠️ Dê um nome ao grupo ${gi + 1} antes de salvar.`;
            }
            card.querySelector('.adicional-grupo-nome')?.focus();
            return null;
        }
        if (validar && opcoes.length === 0) {
            if (aviso) {
                aviso.style.display = 'block';
                aviso.textContent = `⚠️ Adicione pelo menos uma opção no grupo “${nome || gi + 1}”.`;
            }
            card.querySelector('.adicional-opcao-nome')?.focus();
            return null;
        }

        grupos.push({ nome, obrigatorio, opcoes });
    }

    const texto = montarTextoAdicionaisParaEdicao(grupos);
    campoLegado.value = texto;
    // Guarda a estrutura pronta no próprio campo oculto. Assim nomes de opções podem
    // ter vírgulas normalmente; o salvamento visual não depende mais do formato técnico antigo.
    campoLegado.__gruposAdicionais = grupos;
    atualizarResumoAdicionaisVisual(id, grupos);
    if (aviso && !validar) aviso.style.display = 'none';
    return texto;
}

function montarLinhaProduto(id, produto) {
    const div = document.createElement('div');
    div.classList.add('produto-admin-item');
    div.id = 'produtoCard_' + id;
    div.innerHTML = `
        <div class="produto-topo-premium">
            <div class="produto-identidade-estoque">
                <input class="produto-nome-topo" type="text" id="prodNome_${id}" value="${produto.nome || ''}" placeholder="Nome do produto">
                <div class="produto-estoque-mini" id="prodEstoqueBloco_${id}" ${produto.controlarEstoque ? '' : 'hidden'}>
                    <span>Estoque</span>
                    <input type="number" min="0" step="1" inputmode="numeric" id="prodEstoqueQtd_${id}" value="${produto.estoqueProduto != null ? produto.estoqueProduto : 0}" ${produto.controlarEstoque ? '' : 'disabled'} aria-label="Quantidade em estoque">
                    <small>un.</small>
                </div>
            </div>

            <div class="produto-controles-topo">
                <span class="produto-controles-titulo">Status</span>
                <div class="produto-status-opcoes" role="radiogroup" aria-label="Status do produto">
                    <label class="produto-status-opcao produto-status-opcao-ativo" title="Produto disponível para venda">
                        <input type="radio" name="prodStatus_${id}" value="ativo" ${obterStatusProdutoAdmin(produto) === 'ativo' ? 'checked' : ''} onchange="aplicarStatusProdutoNoFormulario('${id}')">
                        <span><i class="produto-status-ponto" aria-hidden="true"></i>Ativo</span>
                    </label>
                    <label class="produto-status-opcao produto-status-opcao-falta" title="Produto visível como esgotado">
                        <input type="radio" name="prodStatus_${id}" value="em_falta" ${obterStatusProdutoAdmin(produto) === 'em_falta' ? 'checked' : ''} onchange="aplicarStatusProdutoNoFormulario('${id}')">
                        <span><i class="produto-status-ponto" aria-hidden="true"></i>Em falta</span>
                    </label>
                    <label class="produto-status-opcao produto-status-opcao-inativo" title="Produto oculto do cardápio">
                        <input type="radio" name="prodStatus_${id}" value="inativo" ${obterStatusProdutoAdmin(produto) === 'inativo' ? 'checked' : ''} onchange="aplicarStatusProdutoNoFormulario('${id}')">
                        <span><i class="produto-status-ponto" aria-hidden="true"></i>Inativo</span>
                    </label>
                </div>
                <label class="produto-topo-toggle produto-topo-toggle-estoque" title="Controlar quantidade disponível deste produto">
                    <input type="checkbox" id="prodControlarEstoque_${id}" ${produto.controlarEstoque ? 'checked' : ''} onchange="alternarControleEstoqueProduto('${id}')">
                    <span>📦 Estoque</span>
                </label>
                <label class="produto-topo-toggle campo-encomenda-produto" title="Permitir venda por encomenda">
                    <input type="checkbox" id="prodEncomenda_${id}" ${produto.disponivelParaEncomenda ? 'checked' : ''} onchange="atualizarAjudaTopoProduto('${id}', 'encomenda')">
                    <span>🎂 Encomenda</span>
                </label>
                <!-- Mantém os campos antigos no DOM para salvar exatamente no formato já usado pelo sistema. -->
                <input type="checkbox" id="prodDisp_${id}" ${produto.disponivel !== false ? 'checked' : ''} style="display:none;">
                <input type="checkbox" id="prodEscondido_${id}" ${produto.escondido ? 'checked' : ''} style="display:none;">
            </div>
            <div class="produto-topo-ajuda" id="prodTopoAjuda_${id}" aria-live="polite">${obterStatusProdutoAdmin(produto) === 'ativo' ? 'Disponível para venda no cardápio.' : (obterStatusProdutoAdmin(produto) === 'em_falta' ? 'Continua visível no cardápio como esgotado.' : 'Fica oculto do cardápio até ser ativado novamente.')}</div>
        </div>

        <div class="produto-editor-grid">
            <div class="produto-editor-col produto-editor-col--principal">
            <textarea id="prodDesc_${id}" placeholder="Descrição" rows="2">${produto.descricao || ''}</textarea>

            <div class="produto-admin-linha produto-precos-grid">
                <div class="campo-com-label">
                    <label class="campo-label">Preço atual</label>
                    <input type="text" inputmode="decimal" id="prodPreco_${id}" value="${produto.preco != null ? produto.preco : ''}" placeholder="Ex: 45,00">
                </div>
                <div class="campo-com-label">
                    <label class="campo-label">Preço "de" (oferta — precisa ser MAIOR)</label>
                    <input type="text" inputmode="decimal" id="prodPrecoOriginal_${id}" value="${produto.precoOriginal != null ? produto.precoOriginal : ''}" placeholder="Ex: 55,00 (opcional)">
                </div>
            </div>

            <div class="produto-meta-grid">
                <div class="campo-com-label">
                    <label class="campo-label">Categoria</label>
                    <input type="text" id="prodCategoria_${id}" value="${produto.categoria || ''}" placeholder="Categoria" list="categoriasDatalist">
                </div>
                <div class="campo-com-label">
                    <label class="campo-label">Sabores/opções <span class="campo-ajuda-inline">separe por vírgula</span></label>
                    <input type="text" id="prodVariantes_${id}" value="${(produto.variantes || []).join(', ')}" placeholder="Ex: Chocolate, Morango, Baunilha" oninput="atualizarPreviaVariantes('${id}')">
                    <div id="previaVariantes_${id}" class="previa-variantes"></div>
                </div>
            </div>
            </div>

            <div class="produto-editor-col produto-editor-col--operacional">
            <div class="produto-config-grid">
                <div class="campo-vincular-ficha-tecnica">
                    <label class="campo-label">📋 Vincular à Ficha Técnica</label>
                    <span class="campo-ajuda-inline">Opcional — consome estoque automaticamente</span>
                    <select id="prodFichaTecnica_${id}">
                        <option value="">— Nenhuma —</option>
                        ${fichaTecnica.map(ft => `<option value="${ft.id}" ${produto.fichaTecnicaId === ft.id ? 'selected' : ''}>${ft.nome}</option>`).join('')}
                    </select>
                </div>
                ${htmlAgendaDisponibilidadeProduto(id, produto)}
            </div>

            <div class="produto-oferta-grid">
                <label class="produto-disponivel-check campo-oferta-check">
                    <input type="checkbox" id="prodOfertaAtiva_${id}" ${produto.ofertaAtiva ? 'checked' : ''}> 🎁 Sugerir este produto como oferta no carrinho
                </label>
                <div class="campo-oferta-preco">
                    <label class="campo-label" for="prodOfertaPreco_${id}">Preço especial na oferta</label>
                    <input type="text" inputmode="decimal" id="prodOfertaPreco_${id}" value="${produto.ofertaPrecoEspecial != null ? produto.ofertaPrecoEspecial : ''}" placeholder="Opcional — vazio usa o preço normal">
                </div>
            </div>

            <div class="produto-fotos-grid">
                <div class="produto-upload-bloco">
                    <label class="campo-label">📷 Foto principal</label>
                    <input type="hidden" id="prodImagens_${id}" value="${(Array.isArray(produto.imagens) && produto.imagens.length ? produto.imagens : (produto.imagem ? [produto.imagem] : [])).join(', ')}">
                    <div class="produto-upload-linha">
                        <input type="file" id="prodUploadFoto_${id}" accept="image/*">
                        <button type="button" class="btn-secondary" onclick="enviarFotoProduto('${id}')">📤 Enviar foto</button>
                    </div>
                    <p id="prodMsgUpload_${id}" class="ordem-categorias-msg"></p>
                    <div id="previaImagens_${id}" class="previa-imagens"></div>
                </div>

                <div class="produto-upload-bloco produto-upload-carrossel">
                    <label class="campo-label">🎠 Foto do Carrossel <span class="campo-ajuda-inline">opcional — sem foto usa a principal</span></label>
                    <input type="hidden" id="prodImagemCarrossel_${id}" value="${produto.imagemCarrossel || ''}">
                    <div class="produto-upload-linha">
                        <input type="file" id="prodUploadCarrossel_${id}" accept="image/*">
                        <button type="button" class="btn-secondary" onclick="enviarFotoCarrossel('${id}')">📤 Enviar foto do carrossel</button>
                    </div>
                    <p id="prodMsgUploadCarrossel_${id}" class="ordem-categorias-msg"></p>
                </div>
            </div>
            </div>
        </div>
        <div id="blocoAdicionais_${id}" style="display:${adicionaisAtivo ? 'block' : 'none'};">
            ${htmlEditorAdicionaisProduto(id, produto.grupoAdicionais)}
        </div>

        <div class="produto-admin-acoes">
            <button class="btn-salvar-produto" onclick="salvarProduto('${id}')">💾 Salvar</button>
            <button class="btn-excluir-produto" onclick="excluirProduto('${id}')">🗑️ Excluir</button>
        </div>
    `;

    const resumoCompacto = criarResumoProdutoAdmin(id, produto);
    div.prepend(resumoCompacto);
    if (!produtosAdminExpandidos.has(id)) div.classList.add('produto-card-recolhido');
    return div;
}

// Mostra na hora quantos "sabores" foram reconhecidos, pra confirmar que separou certo por vírgula
// Mostra as fotos de verdade (miniaturas), pra confirmar visualmente que os nomes dos arquivos estão certos
// Envia uma foto de produto direto pro Storage da própria loja (mesmo Storage que já
// guarda a logo) — depois de enviar, completa sozinho o campo de texto de fotos
// (que continua funcionando normal, por nome de arquivo ou link, sem mudar nada nisso)
async function enviarFotoProduto(id) {
    const inputArquivo = document.getElementById('prodUploadFoto_' + id);
    const msgEl = document.getElementById('prodMsgUpload_' + id);
    const arquivo = inputArquivo.files[0];
    if (!arquivo) { msgEl.textContent = 'Escolhe uma imagem primeiro.'; return; }
    if (!arquivo.type.startsWith('image/')) { msgEl.textContent = 'Isso não parece ser uma imagem.'; return; }
    if (arquivo.size > 5 * 1024 * 1024) { msgEl.textContent = 'Imagem muito grande — usa algo até 5MB.'; return; }

    msgEl.textContent = 'Enviando...';
    try {
        const extensao = arquivo.name.split('.').pop();
        const nomeArquivo = `produto-${id}-${Date.now()}.${extensao}`;
        const ref = firebase.storage().ref('produtos/' + nomeArquivo);
        await ref.put(arquivo);
        const url = await ref.getDownloadURL();

        const campoTexto = document.getElementById('prodImagens_' + id);
        const atuais = campoTexto.value.split(',').map(v => v.trim()).filter(v => v.length > 0);
        atuais.push(url);
        campoTexto.value = atuais.join(', ');
        atualizarPreviaImagens(id);

        msgEl.textContent = 'Foto enviada! Não esquece de clicar em Salvar Produto.';
        inputArquivo.value = '';
    } catch (err) {
        msgEl.textContent = 'Erro ao enviar: ' + err.message;
    }
}

// Envia uma foto EXCLUSIVA pro carrossel — diferente das fotos normais do produto,
// essa pode já vir editada/recortada do jeito ideal pro formato largo do banner
async function enviarFotoCarrossel(id) {
    const inputArquivo = document.getElementById('prodUploadCarrossel_' + id);
    const msgEl = document.getElementById('prodMsgUploadCarrossel_' + id);
    const arquivo = inputArquivo.files[0];
    if (!arquivo) { msgEl.textContent = 'Escolhe uma imagem primeiro.'; return; }
    if (!arquivo.type.startsWith('image/')) { msgEl.textContent = 'Isso não parece ser uma imagem.'; return; }
    if (arquivo.size > 2 * 1024 * 1024) { msgEl.textContent = 'Imagem muito grande — usa algo até 2MB.'; return; }

    msgEl.textContent = 'Enviando...';
    try {
        const extensao = arquivo.name.split('.').pop();
        const nomeArquivo = `produto-${id}-carrossel-${Date.now()}.${extensao}`;
        const ref = firebase.storage().ref('produtos/' + nomeArquivo);
        await ref.put(arquivo);
        const url = await ref.getDownloadURL();

        document.getElementById('prodImagemCarrossel_' + id).value = url;
        msgEl.textContent = 'Foto do carrossel enviada! Não esquece de clicar em Salvar Produto.';
        inputArquivo.value = '';
    } catch (err) {
        msgEl.textContent = 'Erro ao enviar: ' + err.message;
    }
}

function atualizarPreviaImagens(id) {
    const input = document.getElementById('prodImagens_' + id);
    const previa = document.getElementById('previaImagens_' + id);
    if (!input || !previa) return;
    const nomes = input.value.trim().split(',').map(v => v.trim()).filter(v => v.length > 0);
    if (nomes.length === 0) { previa.innerHTML = ''; return; }
    previa.innerHTML = nomes.map((nome, i) =>
        `<div class="previa-imagem-wrap">
            <img src="${nome}" alt="${nome}" class="previa-imagem-thumb" onerror="this.classList.add('previa-imagem-erro')">
            <button type="button" class="previa-imagem-excluir" onclick="removerImagemProduto('${id}', ${i})" title="Excluir essa foto">✕</button>
        </div>`
    ).join('');
}

// Remove uma foto específica da lista (pelo índice, contando da esquerda) — reescreve
// o campo de texto sem ela e atualiza a prévia
function removerImagemProduto(id, indice) {
    const input = document.getElementById('prodImagens_' + id);
    const nomes = input.value.trim().split(',').map(v => v.trim()).filter(v => v.length > 0);
    nomes.splice(indice, 1);
    input.value = nomes.join(', ');
    atualizarPreviaImagens(id);
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

// Vincula automaticamente cada produto do cardápio à ficha técnica de MESMO NOME,
// só nos que ainda não têm vínculo nenhum — não sobrescreve um vínculo já escolhido
// na mão, mesmo que aponte pra outro nome (respeita a escolha manual)
// Corrige pedidos REAIS do cardápio (não manuais) que foram feitos antes do sistema
// passar a guardar o vínculo com a Ficha Técnica em cada item — sem isso, o CMV desses
// pedidos antigos nunca vai ser calculado, mesmo com os produtos certinhos vinculados
async function corrigirFichaTecnicaPedidosAntigos() {
    const msgEl = document.getElementById('resultadoDiagnostico');
    msgEl.innerHTML = '<p class="dica-secao">Corrigindo pedidos antigos...</p>';

    const [pedidosSnap, produtosSnap] = await Promise.all([
        db.ref('pedidos').once('value'),
        db.ref('produtos').once('value')
    ]);
    const pedidosVal = pedidosSnap.val() || {};
    const produtosVal = produtosSnap.val() || {};

    let corrigidos = 0, jaCertos = 0, semProdutoOuFicha = 0;
    for (const [id, pedido] of Object.entries(pedidosVal)) {
        if (!pedido.itens) continue;
        let mudou = false;
        const itensCorrigidos = pedido.itens.map(item => {
            if (item.fichaTecnicaId || !item.produtoId) return item; // já tem, ou é item avulso (manual/recompensa sem produto)
            const produto = produtosVal[item.produtoId];
            if (!produto || !produto.fichaTecnicaId) { semProdutoOuFicha++; return item; }
            mudou = true;
            return { ...item, fichaTecnicaId: produto.fichaTecnicaId };
        });
        if (mudou) {
            await db.ref('pedidos/' + id + '/itens').set(itensCorrigidos);
            corrigidos++;
        } else {
            jaCertos++;
        }
    }

    msgEl.innerHTML = `<p class="dica-secao">✅ ${corrigidos} pedido(s) corrigido(s), ${jaCertos} já estavam certos ou não precisavam, ${semProdutoOuFicha} item(ns) sem produto/ficha correspondente (não deu pra corrigir). Confere o Dashboard de novo.</p>`;
}

async function autoVincularFichaTecnicaPorNome() {
    const msgEl = document.getElementById('resultadoDiagnostico');
    msgEl.innerHTML = '<p class="dica-secao">Vinculando produtos à ficha técnica...</p>';

    const produtosSnap = await db.ref('produtos').once('value');
    const produtosVal = produtosSnap.val() || {};

    let vinculados = 0, corrigidos = 0, jaCertos = 0, semFichaCorrespondente = 0;
    for (const [id, produto] of Object.entries(produtosVal)) {
        // Um vínculo só conta como "já certo" se apontar pra uma ficha técnica que
        // REALMENTE existe hoje — se aponta pra uma que já foi apagada (sobra de uma
        // ficha antiga), trata como se não tivesse vínculo nenhum e corrige
        const vinculoAtualValido = produto.fichaTecnicaId && fichaTecnica.some(ft => ft.id === produto.fichaTecnicaId);
        if (vinculoAtualValido) { jaCertos++; continue; }

        const ft = acharPorNome(fichaTecnica, produto.nome);
        if (!ft) { semFichaCorrespondente++; continue; }
        await db.ref('produtos/' + id + '/fichaTecnicaId').set(ft.id);
        if (produto.fichaTecnicaId) corrigidos++; else vinculados++;
    }

    msgEl.innerHTML = `<p class="dica-secao">✅ ${vinculados} vinculado(s) novo(s), ${corrigidos} corrigido(s) (apontavam pra ficha técnica já apagada), ${jaCertos} já estavam certos, ${semFichaCorrespondente} sem ficha técnica de mesmo nome.</p>`;
}

// ---------- Diagnóstico rápido das integrações ----------
async function executarDiagnosticoSistema() {
    const el = document.getElementById('resultadoDiagnosticoSistema');
    if (!el) return;
    el.textContent = 'Verificando...';
    try {
        const diagnosticar = firebase.functions().httpsCallable('diagnosticarSistema');
        const resposta = await diagnosticar();
        const d = resposta.data || {};
        const linha = (ok, texto) => `${ok ? '✅' : '⚠️'} ${texto}`;
        const presos = Number(d.pedidosPresosAguardandoPagamento || 0);
        el.innerHTML = [
            linha(!!d.functionsOk, 'Firebase Functions respondendo'),
            linha(!!d.infinitePayConfigurada, d.infinitePayConfigurada ? 'InfinitePay configurada' : 'InfinitePay sem InfiniteTag configurada'),
            linha(true, `${Number(d.tokensNotificacao || 0)} aparelho(s) cadastrado(s) para notificações`),
            linha(Number(d.destaquesAutomaticos || 0) > 0, Number(d.destaquesAutomaticos || 0) > 0
                ? `${d.destaquesAutomaticos} destaque(s) automático(s) calculado(s)`
                : 'Carrossel automático ainda sem destaques calculados'),
            linha(presos === 0, presos === 0
                ? 'Nenhum pedido preso aguardando pagamento'
                : `${presos} pedido(s) preso(s) há mais de 10min aguardando pagamento — confira se algum cliente já pagou`),
            linha(true, `Servidor: ${d.horaServidor || 'respondendo'}`)
        ].join('<br>');
    } catch (err) {
        el.textContent = '❌ Não foi possível concluir o diagnóstico: ' + err.message;
    }
}

// ---------- Carrossel — modo Manual, Automático ou Misto ----------
let destaquesManuaisAtuais = [];
let carrosselModoAtual = 'automatico'; // mantém o comportamento antigo até o lojista escolher outro modo
let carrosselAutoAtual = [];

function normalizarListaFirebase(valor) {
    if (Array.isArray(valor)) return valor.filter(Boolean);
    return valor ? Object.values(valor).filter(Boolean) : [];
}

function escutarDestaquesManuais() {
    db.ref('configuracao/destaquesManuais').on('value', snap => {
        destaquesManuaisAtuais = normalizarListaFirebase(snap.val());
        renderizarListaDestaquesManuais();
        atualizarStatusCarrosselPainel();
    });
    db.ref('configuracao/carrosselModo').on('value', snap => {
        const modo = snap.val();
        carrosselModoAtual = ['manual','automatico','misto'].includes(modo) ? modo : 'automatico';
        const select = document.getElementById('carrosselModoSelect');
        if (select) select.value = carrosselModoAtual;
        atualizarAjudaModoCarrossel();
        atualizarStatusCarrosselPainel();
    });
    db.ref('configuracao/carrosselDestaquesAuto').on('value', snap => {
        carrosselAutoAtual = normalizarListaFirebase(snap.val());
        atualizarStatusCarrosselPainel();
    });
}

function atualizarAjudaModoCarrossel() {
    const select = document.getElementById('carrosselModoSelect');
    const ajuda = document.getElementById('ajudaModoCarrossel');
    const bloco = document.getElementById('blocoDestaquesManuais');
    if (!select) return;
    const modo = select.value;
    if (ajuda) {
        ajuda.textContent = modo === 'manual'
            ? '✋ Manual: aparecem somente os produtos que você escolher abaixo.'
            : modo === 'misto'
                ? '🔀 Misto: seus escolhidos aparecem primeiro; as vagas restantes, até 5, são preenchidas pelos mais vendidos disponíveis.'
                : '⚙️ Automático: o sistema usa até 5 dos mais vendidos da semana que estiverem disponíveis no cardápio.';
    }
    if (bloco) bloco.style.display = modo === 'automatico' ? 'none' : 'block';
}

function atualizarStatusCarrosselPainel() {
    const statusEl = document.getElementById('statusCarrosselAtual');
    if (!statusEl) return;
    const qtdAuto = carrosselAutoAtual.length;
    const qtdManual = destaquesManuaisAtuais.length;
    if (carrosselModoAtual === 'manual') {
        statusEl.textContent = `✋ Modo MANUAL ativo — ${qtdManual} produto(s) escolhido(s). Só os disponíveis aparecem no site.`;
    } else if (carrosselModoAtual === 'misto') {
        statusEl.textContent = `🔀 Modo MISTO ativo — ${qtdManual} manual(is) + preenchimento automático com os mais vendidos disponíveis, até 5.`;
    } else {
        statusEl.textContent = qtdAuto > 0
            ? `⚙️ Modo AUTOMÁTICO ativo — o sistema tem ${qtdAuto} destaque(s) calculado(s) da semana e usa até 5 disponíveis.`
            : `⚙️ Modo AUTOMÁTICO ativo — ainda não há destaques automáticos suficientes; o carrossel pode ficar oculto até haver dados.`;
    }
}

function renderizarListaDestaquesManuais() {
    const container = document.getElementById('listaDestaquesManuais');
    if (!container) return;
    const produtos = Object.entries(ultimoValProdutosAdmin || {});
    if (produtos.length === 0) { container.innerHTML = '<p class="dica-secao">Cadastre produtos primeiro.</p>'; return; }

    container.innerHTML = produtos.map(([id, produto]) => {
        const disponivel = produto && produto.disponivel === true && !produto.escondido;
        const marcado = destaquesManuaisAtuais.includes(id);
        return `
        <label class="produto-disponivel-check" style="display:block; margin-top:4px; ${disponivel ? '' : 'opacity:.55;'}">
            <input type="checkbox" class="check-destaque-manual" value="${id}" ${marcado ? 'checked' : ''} ${disponivel ? '' : 'disabled'} onchange="limitarSelecaoDestaques(this)">
            ${produto.nome}${disponivel ? '' : ' — indisponível no cardápio'}
        </label>`;
    }).join('');
}

// Até 5 destaques. Como aparece um slide por vez, 5 dá variedade sem aumentar a altura da página.
function limitarSelecaoDestaques(checkboxClicado) {
    const marcados = document.querySelectorAll('.check-destaque-manual:checked:not(:disabled)');
    if (marcados.length > 5) {
        checkboxClicado.checked = false;
        alert('Máximo de 5 destaques por vez — desmarque algum antes de escolher outro.');
    }
}

async function salvarConfiguracaoCarrossel() {
    const msgEl = document.getElementById('msgDestaquesManuais');
    const select = document.getElementById('carrosselModoSelect');
    const modo = select ? select.value : 'automatico';
    const marcados = [...document.querySelectorAll('.check-destaque-manual:checked:not(:disabled)')]
        .map(c => c.value)
        .slice(0, 5);
    try {
        await Promise.all([
            db.ref('configuracao/carrosselModo').set(modo),
            db.ref('configuracao/destaquesManuais').set(marcados)
        ]);
        if (msgEl) msgEl.textContent = `Salvo! Modo ${modo.toUpperCase()} com ${marcados.length} destaque(s) manual(is).`;
    } catch (err) {
        if (msgEl) msgEl.textContent = 'Erro ao salvar: ' + err.message;
    }
}

// Mantém compatibilidade com qualquer botão/chamada antiga.
function salvarDestaquesManuais() { return salvarConfiguracaoCarrossel(); }


// ---------- Banners de campanha do carrossel ----------
let bannersCarrosselAtuais = {};

function escaparHtmlBanner(valor) {
    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function dataBannerLegivel(valor) {
    if (!valor) return 'sem limite';
    const partes = String(valor).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}

function escutarBannersCarrossel() {
    db.ref('configuracao/bannersCarrossel').on('value', snap => {
        bannersCarrosselAtuais = snap.val() || {};
        renderizarBannersCarrosselPainel();
    });
}

function dataLocalISOBannerPainel() {
    const agora = new Date();
    return agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
}

function statusBannerCarrosselPainel(banner) {
    const hoje = dataLocalISOBannerPainel();
    if (banner.ativo === false) return { chave: 'pausada', rotulo: '⏸️ Pausada' };
    if (banner.inicio && banner.inicio > hoje) return { chave: 'agendada', rotulo: '🗓️ Agendada' };
    if (banner.fim && banner.fim < hoje) return { chave: 'encerrada', rotulo: '🏁 Encerrada' };
    return { chave: 'ativa', rotulo: '✅ Ativa agora' };
}

function abrirFormularioBannerCarrossel(id) {
    const painel = document.getElementById('painelFormularioBannerCarrossel');
    if (!painel) return;
    const banner = id ? bannersCarrosselAtuais[id] : null;
    document.getElementById('bannerCarrosselEditandoId').value = id || '';
    document.getElementById('bannerCarrosselTitulo').value = banner?.titulo || '';
    document.getElementById('bannerCarrosselLink').value = banner?.link || '';
    document.getElementById('bannerCarrosselInicio').value = banner?.inicio || '';
    document.getElementById('bannerCarrosselFim').value = banner?.fim || '';
    document.getElementById('bannerCarrosselOrdem').value = banner?.ordem || 1;
    document.getElementById('bannerCarrosselAtivo').checked = banner ? banner.ativo !== false : true;
    document.getElementById('bannerCarrosselArquivo').value = '';
    document.getElementById('tituloFormularioBannerCarrossel').textContent = banner ? 'Editar campanha' : 'Nova campanha';
    document.getElementById('btnSalvarBannerCarrossel').textContent = banner ? '💾 Salvar alterações' : '📤 Adicionar ao carrossel';
    document.getElementById('ajudaImagemBannerCarrossel').textContent = banner ? 'Escolha uma nova imagem apenas se quiser trocar a arte atual.' : 'Use uma arte horizontal. A imagem é exibida inteira.';
    painel.style.display = 'block';
    painel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fecharFormularioBannerCarrossel() {
    const painel = document.getElementById('painelFormularioBannerCarrossel');
    if (painel) painel.style.display = 'none';
    const idEl = document.getElementById('bannerCarrosselEditandoId');
    if (idEl) idEl.value = '';
}

function cardBannerCarrosselPainel(banner, posicaoAtiva) {
    const status = statusBannerCarrosselPainel(banner);
    const periodo = `${dataBannerLegivel(banner.inicio)} até ${dataBannerLegivel(banner.fim)}`;
    const titulo = banner.titulo || 'Campanha sem nome';
    const foraVaga = status.chave === 'ativa' && posicaoAtiva > 5;
    const badgeExtra = foraVaga ? '<span class="banner-status-badge fora-vaga">Aguardando vaga entre as 5 primeiras</span>' : '';
    return `
        <div class="banner-carrossel-item${foraVaga ? ' banner-fora-vaga' : ''}">
            <img class="banner-carrossel-miniatura" src="${escaparHtmlBanner(banner.imagem || '')}" alt="${escaparHtmlBanner(titulo)}">
            <div class="banner-carrossel-info">
                <strong>${escaparHtmlBanner(titulo)}</strong>
                <p class="dica-secao">Ordem: ${Number(banner.ordem) || 1} · Período: ${escaparHtmlBanner(periodo)}</p>
                ${banner.link ? `<p class="dica-secao">Link: ${escaparHtmlBanner(banner.link)}</p>` : ''}
                <div class="banner-status-linha">
                    <span class="banner-status-badge ${status.chave}">${status.rotulo}</span>
                    ${badgeExtra}
                </div>
            </div>
            <div class="banner-carrossel-acoes">
                <button class="btn-secondary" onclick="abrirFormularioBannerCarrossel('${banner.id}')">✏️ Editar</button>
                <button class="btn-secondary" onclick="alternarBannerCarrossel('${banner.id}', ${banner.ativo === false ? 'true' : 'false'})">${banner.ativo === false ? '▶️ Ativar' : '⏸️ Pausar'}</button>
                <button class="btn-secondary" onclick="excluirBannerCarrossel('${banner.id}')">🗑️ Excluir</button>
            </div>
        </div>`;
}

function renderizarBannersCarrosselPainel() {
    const ativosEl = document.getElementById('listaBannersCarrosselAtivos');
    const inativosEl = document.getElementById('listaBannersCarrosselInativos');
    if (!ativosEl || !inativosEl) return;

    const itens = Object.entries(bannersCarrosselAtuais || {})
        .map(([id, banner]) => ({ id, ...(banner || {}) }))
        .sort((a, b) => (Number(a.ordem) || 999) - (Number(b.ordem) || 999) || (Number(a.criadoEm) || 0) - (Number(b.criadoEm) || 0));

    const ativos = itens.filter(b => statusBannerCarrosselPainel(b).chave === 'ativa');
    const outros = itens.filter(b => statusBannerCarrosselPainel(b).chave !== 'ativa');
    const ocupadas = Math.min(5, ativos.length);

    const resumo = document.getElementById('resumoVagasBanners');
    const contAtivos = document.getElementById('contadorBannersAtivos');
    const contInativos = document.getElementById('contadorBannersInativos');
    if (resumo) resumo.textContent = `${ocupadas} de 5 posições ocupadas agora`;
    if (contAtivos) contAtivos.textContent = String(ativos.length);
    if (contInativos) contInativos.textContent = String(outros.length);

    ativosEl.innerHTML = ativos.length
        ? ativos.map((b, i) => cardBannerCarrosselPainel(b, i + 1)).join('')
        : '<p class="dica-secao">Nenhuma campanha ativa no carrossel agora.</p>';

    inativosEl.innerHTML = outros.length
        ? outros.map(b => cardBannerCarrosselPainel(b, 0)).join('')
        : '<p class="dica-secao">Nenhuma campanha pausada, agendada ou encerrada.</p>';
}

async function salvarBannerCarrossel() {
    const msgEl = document.getElementById('msgBannerCarrossel');
    const editandoId = document.getElementById('bannerCarrosselEditandoId')?.value || '';
    const bannerAtual = editandoId ? bannersCarrosselAtuais[editandoId] : null;
    const inputArquivo = document.getElementById('bannerCarrosselArquivo');
    const arquivo = inputArquivo && inputArquivo.files ? inputArquivo.files[0] : null;
    const titulo = (document.getElementById('bannerCarrosselTitulo')?.value || '').trim();
    const link = (document.getElementById('bannerCarrosselLink')?.value || '').trim();
    const inicio = document.getElementById('bannerCarrosselInicio')?.value || null;
    const fim = document.getElementById('bannerCarrosselFim')?.value || null;
    const ordem = Math.max(1, Math.min(99, Number(document.getElementById('bannerCarrosselOrdem')?.value) || 1));
    const ativo = !!document.getElementById('bannerCarrosselAtivo')?.checked;

    if (!arquivo && !bannerAtual?.imagem) { if (msgEl) msgEl.textContent = 'Escolha a imagem do banner primeiro.'; return; }
    if (arquivo && !arquivo.type.startsWith('image/')) { if (msgEl) msgEl.textContent = 'O arquivo escolhido não parece ser uma imagem.'; return; }
    if (arquivo && arquivo.size > 4 * 1024 * 1024) { if (msgEl) msgEl.textContent = 'Imagem muito grande — use um arquivo de até 4MB.'; return; }
    if (inicio && fim && fim < inicio) { if (msgEl) msgEl.textContent = 'A data final não pode ser anterior à data inicial.'; return; }

    if (msgEl) msgEl.textContent = editandoId ? 'Salvando alterações...' : 'Enviando campanha...';
    try {
        let imagem = bannerAtual?.imagem || null;
        let storagePath = bannerAtual?.storagePath || null;
        let storagePathAntigo = null;

        if (arquivo) {
            const extensao = (arquivo.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
            const novoStoragePath = `produtos/banner-carrossel-${Date.now()}.${extensao}`;
            const ref = firebase.storage().ref(novoStoragePath);
            await ref.put(arquivo);
            imagem = await ref.getDownloadURL();
            storagePathAntigo = storagePath;
            storagePath = novoStoragePath;
        }

        const dados = {
            imagem, storagePath,
            titulo: titulo || null,
            link: link || null,
            inicio: inicio || null,
            fim: fim || null,
            ordem,
            ativo,
            atualizadoEm: firebase.database.ServerValue.TIMESTAMP
        };

        if (editandoId) {
            await db.ref(`configuracao/bannersCarrossel/${editandoId}`).update(dados);
            if (storagePathAntigo && storagePathAntigo !== storagePath) {
                try { await firebase.storage().ref(storagePathAntigo).delete(); } catch (e) { /* arquivo antigo pode já não existir */ }
            }
        } else {
            dados.criadoEm = firebase.database.ServerValue.TIMESTAMP;
            await db.ref('configuracao/bannersCarrossel').push(dados);
        }

        if (msgEl) msgEl.textContent = editandoId ? 'Campanha atualizada.' : 'Campanha adicionada ao carrossel.';
        fecharFormularioBannerCarrossel();
    } catch (err) {
        if (msgEl) msgEl.textContent = 'Erro ao salvar campanha: ' + err.message;
    }
}

async function alternarBannerCarrossel(id, novoEstado) {
    const msgEl = document.getElementById('msgBannerCarrossel');
    try {
        await db.ref(`configuracao/bannersCarrossel/${id}/ativo`).set(!!novoEstado);
        if (msgEl) msgEl.textContent = novoEstado ? 'Campanha ativada.' : 'Campanha pausada.';
    } catch (err) {
        if (msgEl) msgEl.textContent = 'Erro ao atualizar campanha: ' + err.message;
    }
}

async function excluirBannerCarrossel(id) {
    const banner = bannersCarrosselAtuais[id];
    if (!banner) return;
    if (!confirm(`Excluir a campanha "${banner.titulo || 'Campanha'}"?`)) return;
    const msgEl = document.getElementById('msgBannerCarrossel');
    try {
        await db.ref(`configuracao/bannersCarrossel/${id}`).remove();
        if (banner.storagePath) {
            try { await firebase.storage().ref(banner.storagePath).delete(); } catch (e) { /* arquivo pode já ter sido removido */ }
        }
        if (msgEl) msgEl.textContent = 'Campanha excluída.';
    } catch (err) {
        if (msgEl) msgEl.textContent = 'Erro ao excluir campanha: ' + err.message;
    }
}

function escutarProdutos() {
    db.ref('produtos').on('value', snap => {
        ultimoValProdutosAdmin = snap.val() || {};
        renderizarListaProdutosAdmin();
    });
}

// Guarda o valor salvo até o dropdown de produtos existir (populado só depois dos
// produtos carregarem) — sem isso, tentar selecionar antes das opções existirem falha
let produtoSugeridoFreteGratisSalvo = '';

function atualizarSelectProdutoSugeridoFreteGratis() {
    const sel = document.getElementById('produtoSugeridoFreteGratis');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">— Nenhum (só mostra a mensagem, sem sugestão) —</option>';
    Object.entries(ultimoValProdutosAdmin || {}).forEach(([id, produto]) => {
        if (!produto.nome) return;
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = produto.nome;
        sel.appendChild(opt);
    });
    sel.value = atual; // preserva a seleção se já tinha uma antes de repopular
}

function aplicarSelecaoProdutoSugeridoFreteGratis() {
    const sel = document.getElementById('produtoSugeridoFreteGratis');
    if (!sel || !produtoSugeridoFreteGratisSalvo) return;
    if ([...sel.options].some(o => o.value === produtoSugeridoFreteGratisSalvo)) {
        sel.value = produtoSugeridoFreteGratisSalvo;
    }
}

function normalizarTextoBuscaProduto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Pesquisa somente na lista que já está carregada na tela.
// Não consulta nem grava nada no Firebase e não recria os cards, preservando edições ainda não salvas.
function filtrarProdutosAdmin() {
    const campoBusca = document.getElementById('buscaProdutosAdmin');
    const lista = document.getElementById('produtosAdminList');
    const resultado = document.getElementById('resultadoBuscaProdutosAdmin');
    if (!campoBusca || !lista) return;

    const termo = normalizarTextoBuscaProduto(campoBusca.value);
    const cards = Array.from(lista.querySelectorAll('.produto-admin-item'));
    let visiveis = 0;

    cards.forEach(card => {
        const nome = card.querySelector('input[id^="prodNome_"]')?.value || '';
        const categoria = card.querySelector('input[id^="prodCategoria_"]')?.value || '';
        const texto = normalizarTextoBuscaProduto(`${nome} ${categoria}`);
        const mostrar = !termo || texto.includes(termo);

        // Usa uma classe própria porque os cards recolhidos possuem display:block !important
        // no layout premium. Assim a pesquisa realmente deixa na grade somente os achados,
        // no mesmo padrão visual da lista da Ficha Técnica, sem recriar nenhum card.
        card.classList.toggle('produto-busca-oculto', !mostrar);
        if (mostrar) visiveis++;
    });

    if (resultado) {
        if (!termo) resultado.textContent = '';
        else if (visiveis === 0) resultado.textContent = 'Nenhum produto encontrado.';
        else resultado.textContent = `${visiveis} produto${visiveis === 1 ? '' : 's'} encontrado${visiveis === 1 ? '' : 's'}.`;
    }
}

function limparBuscaProdutosAdmin() {
    const campoBusca = document.getElementById('buscaProdutosAdmin');
    if (!campoBusca) return;
    campoBusca.value = '';
    filtrarProdutosAdmin();
    campoBusca.focus();
}

function renderizarListaProdutosAdmin() {
    const lista = document.getElementById('produtosAdminList');
    const btnImportar = document.getElementById('btnImportarDados');
    if (!lista) return;
    garantirControlesCompactacaoProdutos();

    const val = ultimoValProdutosAdmin || {};
    const itens = Object.entries(val).map(([id, produto]) => ({ id, produto }));
    // Mais recentes primeiro — mesma lógica já aplicada na Ficha Técnica
    itens.sort((a, b) => (b.produto.criadoEm || 0) - (a.produto.criadoEm || 0));

    categoriasConhecidas = [...new Set(itens.map(i => i.produto.categoria).filter(Boolean))];
    produtosConhecidos = itens.map(i => i.produto.nome).filter(Boolean);
    atualizarDatalistCategorias();
    atualizarPreviaOrdemCategorias();
    atualizarSelectProdutoRecompensa();
    atualizarSelectProdutoSugeridoFreteGratis();
    aplicarSelecaoProdutoSugeridoFreteGratis();

    btnImportar.style.display = itens.length === 0 ? 'block' : 'none';

    lista.innerHTML = '';
    if (itens.length === 0) {
        lista.innerHTML = '<p class="vazio">Nenhum produto cadastrado ainda.</p>';
        return;
    }
    itens.forEach(({ id, produto }) => {
        lista.appendChild(montarLinhaProduto(id, produto));
        atualizarPreviaImagens(id);
        atualizarResumoProdutoAdmin(id);
    });

    if (produtoAdminAbrirAposRender) {
        const idAbrir = produtoAdminAbrirAposRender;
        produtoAdminAbrirAposRender = null;
        setTimeout(() => {
            const card = document.getElementById('produtoCard_' + idAbrir);
            if (!card) return;
            definirProdutoAdminRecolhido(idAbrir, false);
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.querySelector('#prodNome_' + idAbrir)?.focus();
        }, 80);
    }

    filtrarProdutosAdmin();
    if (typeof renderFichaTecnica === 'function' && fichaTecnica.length > 0) renderFichaTecnica();
    if (typeof renderizarListaDestaquesManuais === 'function') renderizarListaDestaquesManuais();
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
    const controlarEstoque = document.getElementById('prodControlarEstoque_' + id)?.checked === true;
    const estoqueCampo = document.getElementById('prodEstoqueQtd_' + id);
    const estoqueProduto = controlarEstoque ? Math.max(0, parseInt(estoqueCampo?.value || '0', 10) || 0) : null;
    const campoFichaTecnica = document.getElementById('prodFichaTecnica_' + id);
    const fichaTecnicaId = campoFichaTecnica ? (campoFichaTecnica.value || null) : null;
    const imagemCarrossel = document.getElementById('prodImagemCarrossel_' + id).value.trim() || null;
    const ofertaAtiva = document.getElementById('prodOfertaAtiva_' + id).checked;
    const ofertaPrecoEspecial = paraNumeroFlexivel(document.getElementById('prodOfertaPreco_' + id).value) || null;
    const agendaDisponibilidade = coletarAgendaDisponibilidadeProduto(id);
    if (agendaDisponibilidade === null) return;
    const variantesTexto = document.getElementById('prodVariantes_' + id).value.trim();
    const adicionaisTexto = sincronizarTextareaAdicionaisProduto(id, true);
    if (adicionaisTexto === null) return;
    const campoAdicionaisVisual = document.getElementById('prodAdicionais_' + id);
    const gruposAdicionaisVisuais = campoAdicionaisVisual && Array.isArray(campoAdicionaisVisual.__gruposAdicionais)
        ? campoAdicionaisVisual.__gruposAdicionais
        : [];

    const imagens = imagensTexto ? imagensTexto.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];

    if (!nome || isNaN(preco) || imagens.length === 0 || !categoria) {
        alert('Preencha nome, preço, ao menos uma foto e categoria antes de salvar.');
        return;
    }

    // Estoque controlado em 0 nunca pode continuar vendável. Mantemos "Inativo" separado:
    // se o produto estiver escondido manualmente, ele continua escondido mesmo após reposição.
    const disponivelComEstoque = controlarEstoque && estoqueProduto <= 0 ? false : disponivel;
    const dados = { nome, descricao, preco, imagem: imagens[0], imagens, categoria, disponivel: disponivelComEstoque, escondido, disponivelParaEncomenda, controlarEstoque, estoqueProduto, agendaDisponibilidade, fichaTecnicaId, imagemCarrossel, ofertaAtiva, ofertaPrecoEspecial, precoOriginal: null, variantes: null, grupoAdicionais: null };
    // Marca apenas o esgotamento causado pelo estoque, para uma devolução/reposição poder
    // reativar o produto sem confundir com um "Em falta" escolhido manualmente.
    dados.esgotadoAutomaticoEstoque = controlarEstoque && estoqueProduto <= 0;

    if (!isNaN(precoOriginal) && precoOriginal > preco) {
        dados.precoOriginal = precoOriginal;
    }

    if (variantesTexto) {
        dados.variantes = variantesTexto.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }

    dados.grupoAdicionais = gruposAdicionaisVisuais.length ? gruposAdicionaisVisuais : null;

    const avisoEl = document.getElementById('avisoAdicionais_' + id);
    if (avisoEl) avisoEl.style.display = 'none';

    db.ref('produtos/' + id).update(dados)
        .then(() => alert('Produto salvo!'))
        .catch(err => alert('Erro ao salvar produto: ' + err.message));
}


function excluirProduto(id) {
    if (!confirm('Excluir este produto do cardápio? Essa ação não pode ser desfeita.')) return;
    db.ref('produtos/' + id).remove().catch(err => alert('Erro ao excluir produto: ' + err.message));
}

// Cria o produto no cardápio a partir de uma ficha técnica já pronta — já vem com
// nome e preço calculado preenchidos e já vinculado a essa ficha técnica. Só falta
// a pessoa entrar na aba Produtos e completar foto + categoria
async function migrarFichaTecnicaParaProduto(id) {
    const ft = getFichaTecnica(id);
    if (!ft) return;
    const r = calcularCustoFichaTecnica(ft);

    if (!confirm(`Criar o produto "${ft.nome}" no cardápio, com preço R$ ${r.precoVenda.toFixed(2).replace('.', ',')}? Você já vai cair direto na aba Produtos pra completar foto e categoria.`)) return;

    try {
        const novoRef = db.ref('produtos').push();
        await novoRef.set({
            nome: ft.nome,
            descricao: '',
            preco: r.precoVenda,
            imagem: '',
            imagens: [],
            categoria: 'Outros',
            disponivel: false, // começa escondido de propósito — só liga depois de completar foto/categoria
            fichaTecnicaId: ft.id,
            criadoEm: firebase.database.ServerValue.TIMESTAMP
        });

        // Troca pra aba Produtos e rola até o card recém-criado — dá um tempinho pro
        // Firebase confirmar e o card aparecer na tela antes de tentar rolar até ele
        const botaoAbaProdutos = document.querySelector('.painel-tab-btn[data-tab="produtos"]');
        if (botaoAbaProdutos) botaoAbaProdutos.click();
        setTimeout(() => {
            const card = document.getElementById('produtoCard_' + novoRef.key);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('produto-recem-migrado');
                setTimeout(() => card.classList.remove('produto-recem-migrado'), 3000);
            }
        }, 700);
    } catch (err) {
        alert('Erro ao criar o produto: ' + err.message);
    }
}

function adicionarNovoProduto() {
    const novoRef = db.ref('produtos').push();
    produtoAdminAbrirAposRender = novoRef.key;
    produtosAdminExpandidos.add(novoRef.key);
    novoRef.set({
        nome: 'Novo produto',
        descricao: '',
        preco: 0,
        imagem: '',
        imagens: [],
        categoria: 'Outros',
        disponivel: false,
        criadoEm: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => {
        produtosAdminExpandidos.delete(novoRef.key);
        if (produtoAdminAbrirAposRender === novoRef.key) produtoAdminAbrirAposRender = null;
        alert('Erro ao criar produto: ' + err.message);
    });
}

// ---------- CUPONS ----------

let cuponsCache = {}; // guarda os cupons carregados, pra edição, filtros e resumo visual

function escaparHtmlCupomAdmin(valor) {
    return String(valor == null ? '' : valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function hojeIsoCupomAdmin() {
    return hojeIsoLocal();
}

function formatarDataCupomAdmin(dataIso) {
    if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return '—';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function obterStatusCupomAdmin(cupom) {
    cupom = cupom || {};
    const hoje = hojeIsoCupomAdmin();
    const usos = Math.max(0, Number(cupom.usosContados) || 0);
    const limite = Math.max(0, Number(cupom.limiteUsos) || 0);

    if (limite > 0 && usos >= limite) return 'esgotado';
    if (cupom.validoAte && cupom.validoAte < hoje) return 'expirado';
    if (cupom.validoDe && cupom.validoDe > hoje) return 'agendado';
    return 'ativo';
}

function rotuloStatusCupomAdmin(status) {
    return {
        ativo: '● Ativo',
        agendado: '◷ Agendado',
        expirado: 'Expirado',
        esgotado: 'Esgotado'
    }[status] || 'Ativo';
}

function detalheCupomAdmin(cupom) {
    if (!cupom) return 'Benefício não informado';
    if (cupom.tipo === 'percentual') return `${Number(cupom.valor) || 0}% de desconto`;
    if (cupom.tipo === 'fixo') return `R$ ${(Number(cupom.valor) || 0).toFixed(2).replace('.', ',')} de desconto`;
    if (cupom.tipo === 'frete_gratis') return 'Frete grátis';
    return 'Benefício configurado';
}

function tipoCupomAdmin(cupom) {
    return {
        percentual: 'Percentual',
        fixo: 'Valor fixo',
        frete_gratis: 'Frete grátis'
    }[(cupom && cupom.tipo) || ''] || 'Cupom';
}

function montarCupomLinha(codigo, cupom) {
    const div = document.createElement('div');
    const status = obterStatusCupomAdmin(cupom);
    div.className = `cupom-admin-item cupom-admin-item--premium cupom-status-${status}`;
    div.dataset.status = status;
    div.dataset.codigo = String(codigo || '').toUpperCase();

    const usos = Math.max(0, Number(cupom && cupom.usosContados) || 0);
    const limite = Math.max(0, Number(cupom && cupom.limiteUsos) || 0);
    const progresso = limite > 0 ? Math.min(100, Math.round((usos / limite) * 100)) : 0;
    const usoTexto = limite > 0 ? `${usos} de ${limite}` : `${usos} uso${usos === 1 ? '' : 's'} · sem limite`;
    const periodo = (cupom && (cupom.validoDe || cupom.validoAte))
        ? `${cupom.validoDe ? formatarDataCupomAdmin(cupom.validoDe) : 'Início livre'} → ${cupom.validoAte ? formatarDataCupomAdmin(cupom.validoAte) : 'Sem data final'}`
        : 'Sem período definido';

    div.innerHTML = `
        <div class="cupom-item-topo">
            <div class="cupom-item-identidade">
                <span class="cupom-item-codigo">${escaparHtmlCupomAdmin(codigo)}</span>
                <span class="cupom-item-tipo">${tipoCupomAdmin(cupom)}</span>
            </div>
            <span class="cupom-status-badge cupom-status-badge--${status}">${rotuloStatusCupomAdmin(status)}</span>
        </div>
        <div class="cupom-item-beneficio">${detalheCupomAdmin(cupom)}</div>
        <div class="cupom-item-meta-grid">
            <div class="cupom-item-meta">
                <span>UTILIZAÇÃO</span>
                <strong>${usoTexto}</strong>
                ${limite > 0 ? `<div class="cupom-uso-barra"><i style="width:${progresso}%"></i></div>` : '<small>Sem limite de resgates</small>'}
            </div>
            <div class="cupom-item-meta">
                <span>VALIDADE</span>
                <strong>${periodo}</strong>
                <small>${status === 'agendado' ? 'Ainda não iniciou' : (status === 'expirado' ? 'Período encerrado' : 'Período configurado')}</small>
            </div>
        </div>
        <div class="cupom-item-acoes">
            <button type="button" class="btn-secondary cupom-editar-btn" title="Editar ${escaparHtmlCupomAdmin(codigo)}">✏️ Editar</button>
            <button type="button" class="btn-excluir-cupom cupom-excluir-btn" title="Excluir ${escaparHtmlCupomAdmin(codigo)}">🗑️</button>
        </div>
    `;

    const editarBtn = div.querySelector('.cupom-editar-btn');
    const excluirBtn = div.querySelector('.cupom-excluir-btn');
    if (editarBtn) editarBtn.addEventListener('click', () => editarCupom(codigo));
    if (excluirBtn) excluirBtn.addEventListener('click', () => excluirCupom(codigo));
    return div;
}

function atualizarResumoCuponsAdmin() {
    const cupons = Object.values(cuponsCache || {});
    const contagem = { ativo: 0, agendado: 0, encerrado: 0 };
    cupons.forEach(c => {
        const status = obterStatusCupomAdmin(c);
        if (status === 'ativo') contagem.ativo += 1;
        else if (status === 'agendado') contagem.agendado += 1;
        else contagem.encerrado += 1;
    });

    const set = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    };
    set('cupomKpiTotal', cupons.length);
    set('cupomKpiAtivos', contagem.ativo);
    set('cupomKpiAgendados', contagem.agendado);
    set('cupomKpiEncerrados', contagem.encerrado);
}

function renderizarCuponsAdmin() {
    const lista = document.getElementById('cuponsAdminList');
    if (!lista) return;

    atualizarResumoCuponsAdmin();

    const buscaEl = document.getElementById('buscaCupomAdmin');
    const filtroEl = document.getElementById('filtroStatusCupomAdmin');
    const busca = (buscaEl ? buscaEl.value : '').trim().toUpperCase();
    const filtro = filtroEl ? filtroEl.value : 'todos';

    const prioridade = { ativo: 0, agendado: 1, esgotado: 2, expirado: 3 };
    const todos = Object.keys(cuponsCache || {}).sort((a, b) => {
        const sa = obterStatusCupomAdmin(cuponsCache[a]);
        const sb = obterStatusCupomAdmin(cuponsCache[b]);
        return (prioridade[sa] - prioridade[sb]) || a.localeCompare(b, 'pt-BR');
    });

    const codigos = todos.filter(codigo => {
        const status = obterStatusCupomAdmin(cuponsCache[codigo]);
        const bateBusca = !busca || codigo.toUpperCase().includes(busca);
        const bateFiltro = filtro === 'todos' || status === filtro || (filtro === 'encerrado' && ['expirado', 'esgotado'].includes(status));
        return bateBusca && bateFiltro;
    });

    lista.innerHTML = '';
    const resumo = document.getElementById('cupomListaResumo');
    if (resumo) resumo.textContent = `${codigos.length} de ${todos.length} cupom${todos.length === 1 ? '' : 's'} exibido${codigos.length === 1 ? '' : 's'} · benefício, uso, validade e situação em uma única visão.`;

    if (todos.length === 0) {
        lista.innerHTML = '<div class="cupons-vazio-premium"><span>🎟️</span><strong>Nenhum cupom cadastrado</strong><p>Crie o primeiro benefício no formulário ao lado.</p></div>';
        return;
    }
    if (codigos.length === 0) {
        lista.innerHTML = '<div class="cupons-vazio-premium"><span>🔎</span><strong>Nenhum cupom encontrado</strong><p>Ajuste a busca ou o filtro de status.</p></div>';
        return;
    }

    codigos.forEach(codigo => lista.appendChild(montarCupomLinha(codigo, cuponsCache[codigo])));
}

// Preenche o formulário com os valores atuais do cupom, mantendo o mesmo formato de dados já usado.
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
    atualizarPreviaCupomAdmin();

    const titulo = document.getElementById('cupomFormTitulo');
    const salvar = document.getElementById('btnCupomSalvar');
    const cancelar = document.getElementById('btnCupomCancelarEdicao');
    if (titulo) titulo.textContent = `Editar ${codigo}`;
    if (salvar) salvar.textContent = '💾 Salvar alterações';
    if (cancelar) cancelar.style.display = 'inline-flex';

    const input = document.getElementById('novoCupomCodigo');
    if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escutarCupons() {
    db.ref('cupons').on('value', snap => {
        cuponsCache = snap.val() || {};
        renderizarCuponsAdmin();
        atualizarPreviaCupomAdmin();
    });
}

function atualizarCampoValorCupom() {
    const tipoEl = document.getElementById('novoCupomTipo');
    const valorEl = document.getElementById('novoCupomValor');
    if (!tipoEl || !valorEl) return;
    const ocultarValor = tipoEl.value === 'frete_gratis';
    const campo = valorEl.closest('.cupom-form-campo');
    const grid = valorEl.closest('.cupom-form-grid');

    valorEl.style.display = ocultarValor ? 'none' : 'block';
    if (campo) campo.style.display = ocultarValor ? 'none' : 'flex';
    if (grid) grid.classList.toggle('cupom-form-grid--sem-valor', ocultarValor);
}

function atualizarPreviaCupomAdmin() {
    const codigoEl = document.getElementById('novoCupomCodigo');
    const tipoEl = document.getElementById('novoCupomTipo');
    const valorEl = document.getElementById('novoCupomValor');
    const limiteEl = document.getElementById('novoCupomLimiteUsos');
    const deEl = document.getElementById('novoCupomValidoDe');
    const ateEl = document.getElementById('novoCupomValidoAte');
    if (!codigoEl || !tipoEl) return;

    const codigo = codigoEl.value.trim().toUpperCase() || 'SEUCUPOM';
    const valor = paraNumero(valorEl ? valorEl.value : '');
    let beneficio = 'Defina o tipo e o valor do benefício.';
    if (tipoEl.value === 'percentual') beneficio = valor > 0 ? `${valor}% de desconto` : 'Percentual de desconto a definir';
    if (tipoEl.value === 'fixo') beneficio = valor > 0 ? `R$ ${valor.toFixed(2).replace('.', ',')} de desconto` : 'Valor de desconto a definir';
    if (tipoEl.value === 'frete_gratis') beneficio = 'Frete grátis no pedido';

    const limite = limiteEl && limiteEl.value.trim() ? `${limiteEl.value.trim()} resgates no máximo` : 'Sem limite de resgates';
    const de = deEl && deEl.value ? formatarDataCupomAdmin(deEl.value) : '';
    const ate = ateEl && ateEl.value ? formatarDataCupomAdmin(ateEl.value) : '';
    const periodo = de || ate ? `${de || 'início livre'} → ${ate || 'sem data final'}` : 'Sem período definido';

    const cod = document.getElementById('cupomPreviewCodigo');
    const ben = document.getElementById('cupomPreviewBeneficio');
    const regras = document.getElementById('cupomPreviewRegras');
    if (cod) cod.textContent = codigo;
    if (ben) ben.textContent = beneficio;
    if (regras) regras.textContent = `${limite} · ${periodo}`;
}

function limparFormularioCupomAdmin() {
    const campos = ['novoCupomCodigo', 'novoCupomValor', 'novoCupomLimiteUsos', 'novoCupomValidoDe', 'novoCupomValidoAte'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tipo = document.getElementById('novoCupomTipo');
    if (tipo) tipo.value = 'percentual';

    const titulo = document.getElementById('cupomFormTitulo');
    const salvar = document.getElementById('btnCupomSalvar');
    const cancelar = document.getElementById('btnCupomCancelarEdicao');
    if (titulo) titulo.textContent = 'Novo cupom';
    if (salvar) salvar.textContent = '💾 Salvar cupom';
    if (cancelar) cancelar.style.display = 'none';

    atualizarCampoValorCupom();
    atualizarPreviaCupomAdmin();
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

    // Se já existir um cupom com esse código (editando de novo), preserva o contador de usos.
    db.ref('cupons/' + codigo).once('value').then(snap => {
        const existente = snap.val();
        dadosCupom.usosContados = (existente && existente.usosContados) || 0;
        return db.ref('cupons/' + codigo).set(dadosCupom);
    })
        .then(() => {
            limparFormularioCupomAdmin();
            const msg = document.getElementById('cupomFormMsg');
            if (msg) {
                msg.textContent = '✅ Cupom salvo com sucesso.';
                setTimeout(() => { msg.textContent = ''; }, 3000);
            }
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
    pronto_retirada: 'Pronto pra retirada',
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
// A marca de "já lançado" fica fora de /pedidos para não tocar no status, estoque ou gatilhos do pedido.
// Ela é persistida em /configuracao/fechamentoLancados, que já é área administrativa do painel.
let fechamentoLancadosAtuais = {};

function pedidoEstaLancadoFechamento(id) {
    const registro = fechamentoLancadosAtuais[id];
    return registro === true || !!(registro && registro.lancado !== false);
}

function atualizarBotaoLancadoFechamento(id) {
    const lancado = pedidoEstaLancadoFechamento(id);
    const btn = document.getElementById('btnFechamentoLancado-' + id);
    if (btn) {
        btn.classList.toggle('lancado', lancado);
        btn.textContent = lancado ? '✅ Já lançado no sistema' : '☐ Marcar como lançado';
    }

    const selo = document.getElementById('statusFechamentoLancado-' + id);
    if (selo) {
        selo.classList.toggle('lancado', lancado);
        selo.textContent = lancado ? '✓ Lançado' : 'Pendente de lançamento';
    }
}

async function alternarLancadoFechamento(id) {
    if (!id || !fechamentoPedidosAtuais[id]) return;

    const estavaLancado = pedidoEstaLancadoFechamento(id);
    const btn = document.getElementById('btnFechamentoLancado-' + id);
    if (btn) btn.disabled = true;

    try {
        const ref = db.ref('configuracao/fechamentoLancados/' + id);
        if (estavaLancado) {
            await ref.remove();
            delete fechamentoLancadosAtuais[id];
        } else {
            await ref.set({
                lancado: true,
                lancadoEm: firebase.database.ServerValue.TIMESTAMP
            });
            fechamentoLancadosAtuais[id] = { lancado: true, lancadoEm: Date.now() };
        }
        atualizarBotaoLancadoFechamento(id);
    } catch (err) {
        alert('Não foi possível atualizar a marcação de lançamento: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

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

    // Busca os pedidos e, em paralelo, as marcações administrativas de "já lançado".
    // A marcação fica separada de /pedidos para não disparar nenhuma lógica de status/estoque.
    Promise.all([
        db.ref('pedidos').once('value'),
        db.ref('configuracao/fechamentoLancados').once('value')
    ]).then(([snap, lancadosSnap]) => {
        fechamentoLancadosAtuais = lancadosSnap.val() || {};
        let pedidosDoDia = [];
        snap.forEach(child => {
            const p = child.val();
            const ts = typeof p.timestamp === 'number' ? p.timestamp : 0;
            // "aguardando_pagamento" nunca conta aqui, mesmo com "Todos os status"
            // selecionado — só entra na lista quando o pagamento realmente confirma
            if (p.status === 'aguardando_pagamento') return;
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
        div.innerHTML = `
            <div class="fechamento-vazio-premium">
                <span>🔎</span>
                <strong>Nenhum pedido encontrado</strong>
                <p>Não há pedidos que correspondam aos filtros escolhidos nesse período.</p>
            </div>`;
        return;
    }

    const cancelados = pedidos.filter(p => p.status === 'recusado');
    const validos = pedidos.filter(p => p.status !== 'recusado');
    const concluidos = pedidos.filter(p => p.status === 'entregue');
    const emAndamento = pedidos.filter(p => p.status !== 'entregue' && p.status !== 'recusado');
    const totalConcluidos = concluidos.reduce((s, p) => s + totalDoPedido(p), 0);
    const totalEmAndamento = emAndamento.reduce((s, p) => s + totalDoPedido(p), 0);
    const lancados = pedidos.filter(p => pedidoEstaLancadoFechamento(p.id)).length;
    const pendentesLancamento = pedidos.length - lancados;

    const resumoHtml = `
        <div class="fechamento-kpis" aria-label="Resumo do fechamento">
            <div class="fechamento-kpi fechamento-kpi--concluido">
                <span class="fechamento-kpi-icone">✓</span>
                <div><small>Vendas concluídas</small><strong>${formatarPreco(totalConcluidos)}</strong><em>${concluidos.length} pedido${concluidos.length === 1 ? '' : 's'} entregue${concluidos.length === 1 ? '' : 's'}</em></div>
            </div>
            <div class="fechamento-kpi fechamento-kpi--andamento">
                <span class="fechamento-kpi-icone">◷</span>
                <div><small>Em andamento</small><strong>${formatarPreco(totalEmAndamento)}</strong><em>${emAndamento.length} pedido${emAndamento.length === 1 ? '' : 's'} · não contabilizado</em></div>
            </div>
            <div class="fechamento-kpi fechamento-kpi--cancelado">
                <span class="fechamento-kpi-icone">×</span>
                <div><small>Cancelados</small><strong>${cancelados.length}</strong><em>fora do faturamento</em></div>
            </div>
            <div class="fechamento-kpi fechamento-kpi--lancamento">
                <span class="fechamento-kpi-icone">↗</span>
                <div><small>Conferência</small><strong>${lancados}/${pedidos.length}</strong><em>${pendentesLancamento} pendente${pendentesLancamento === 1 ? '' : 's'} de lançamento</em></div>
            </div>
        </div>`;

    const listaValidosHtml = validos.map(p => montarCardPedidoFechamento(p)).join('');
    const listaCanceladosHtml = cancelados.length > 0 ? `
        <div class="fechamento-secao-head fechamento-secao-head--cancelados">
            <div><span>EXCEÇÕES</span><h3>❌ Pedidos cancelados</h3></div>
            <small>${cancelados.length} pedido${cancelados.length === 1 ? '' : 's'}</small>
        </div>
        ${cancelados.map(p => montarCardPedidoFechamento(p)).join('')}
    ` : '';

    // Produtos vendidos: para fechamento financeiro, só contabiliza pedidos concluídos.
    const produtosAgregados = {};
    concluidos.forEach(p => (p.itens || []).forEach(item => {
        if (!produtosAgregados[item.nome]) produtosAgregados[item.nome] = { quantidade: 0, subtotal: 0 };
        produtosAgregados[item.nome].quantidade += item.quantidade;
        produtosAgregados[item.nome].subtotal += (item.preco || 0) * item.quantidade;
    }));
    const produtosOrdenados = Object.entries(produtosAgregados).sort((a, b) => b[1].quantidade - a[1].quantidade);
    const produtosHtml = produtosOrdenados.length > 0 ? `
        <div class="fechamento-resumo-bloco">
            <div class="fechamento-resumo-bloco-head"><div><span>CONSOLIDADO</span><h3>🛍️ Produtos dos pedidos concluídos</h3></div><small>${produtosOrdenados.length} item${produtosOrdenados.length === 1 ? '' : 's'} diferente${produtosOrdenados.length === 1 ? '' : 's'}</small></div>
            <div class="fechamento-resumo-lista">
                ${produtosOrdenados.map(([nome, dados]) => `<div class="pedido-total-linha"><span>${nome} <small>· ${dados.quantidade} un.</small></span><strong>${formatarPreco(dados.subtotal)}</strong></div>`).join('')}
            </div>
        </div>
    ` : '';

    // Formas de pagamento: soma somente vendas concluídas, sem misturar pedidos em andamento.
    const pagamentosAgregados = {};
    concluidos.forEach(p => {
        const forma = p.formaPagamento || 'Não informado';
        pagamentosAgregados[forma] = (pagamentosAgregados[forma] || 0) + totalDoPedido(p);
    });
    const pagamentosHtml = Object.keys(pagamentosAgregados).length > 0 ? `
        <div class="fechamento-resumo-bloco">
            <div class="fechamento-resumo-bloco-head"><div><span>RECEBIMENTOS</span><h3>💳 Formas de pagamento das vendas concluídas</h3></div></div>
            <div class="fechamento-resumo-lista">
                ${Object.entries(pagamentosAgregados).map(([forma, valor]) => `<div class="pedido-total-linha"><span>${forma}</span><strong>${formatarPreco(valor)}</strong></div>`).join('')}
            </div>
        </div>
    ` : '';

    div.innerHTML = `
        <div class="fechamento-print-cabecalho">
            <h2>${LOJA_CONFIG.nome} — Fechamento Diário de Pedidos</h2>
            <p>${rotuloData}: ${dataFormatada}</p>
        </div>
        <div class="fechamento-periodo-barra">
            <div><span>PERÍODO ANALISADO</span><strong>${dataFormatada}</strong></div>
            <div><span>PEDIDOS NO FILTRO</span><strong>${pedidos.length}</strong></div>
        </div>
        ${resumoHtml}
        <div class="fechamento-secao-head">
            <div><span>CONFERÊNCIA PEDIDO A PEDIDO</span><h3>📋 Pedidos do ${mesmodia ? 'dia' : 'período'}</h3></div>
            <small>Clique em “Ver detalhes” somente quando precisar</small>
        </div>
        <div class="fechamento-lista-compacta">${listaValidosHtml}</div>
        ${listaCanceladosHtml}
        <div class="fechamento-consolidados">
            ${produtosHtml}
            ${pagamentosHtml}
        </div>
        <div class="fechamento-acoes fechamento-acoes--premium">
            <div><strong>Fechamento pronto para conferência</strong><span>Copie os dados ou gere o relatório impresso quando terminar.</span></div>
            <div class="fechamento-acoes-botoes">
                <button class="btn-secondary" onclick="copiarTodosPedidos('${dataFormatada}')">📋 Copiar todos os pedidos</button>
                <button class="btn-secondary" onclick="imprimirFechamento()">🖨️ Imprimir relatório</button>
            </div>
        </div>
    `;
}

function montarCardPedidoFechamento(p) {
    const statusLabel = STATUS_LABELS_FECHAMENTO[p.status] || p.status;
    const tipoLabel = p.tipoEntrega === 'entrega' ? '🛵 Delivery' : (p.tipoEntrega === 'retirada' ? '🏪 Retirada no local' : 'Não informado');
    const lancado = pedidoEstaLancadoFechamento(p.id);
    const numero = p.numero ? String(p.numero).padStart(3, '0') : '—';
    const total = formatarPreco(totalDoPedido(p));
    const formaPagamento = p.formaPagamento || 'Não informado';
    const itensHtml = (p.itens || []).map(item =>
        `<div class="pedido-total-linha"><span>${item.quantidade}x ${item.nome}${item.adicionaisTexto ? ` <em>(${item.adicionaisTexto})</em>` : ''}</span><span>${formatarPreco((item.preco || 0) * item.quantidade)}</span></div>`
    ).join('');

    return `
    <details class="fechamento-pedido-card fechamento-pedido-compacto${p.status === 'recusado' ? ' fechamento-pedido-compacto--cancelado' : ''}">
        <summary class="fechamento-pedido-resumo">
            <div class="fechamento-pedido-identidade">
                <span class="fechamento-pedido-numero">#${numero}</span>
                <div class="fechamento-pedido-cliente"><strong>${p.nome || 'Cliente não informado'}</strong><small>${formatarHorario(p.timestamp)} · ${tipoLabel} · ${formaPagamento}</small></div>
            </div>
            <div class="fechamento-pedido-resumo-direita">
                <span class="fechamento-status-badge tag-status-${p.status.replace('_', '-')}">${statusLabel}</span>
                <strong class="fechamento-pedido-total">${total}</strong>
                <span id="statusFechamentoLancado-${p.id}" class="fechamento-lancamento-selo${lancado ? ' lancado' : ''}">${lancado ? '✓ Lançado' : 'Pendente de lançamento'}</span>
                <span class="fechamento-ver-detalhes">Ver detalhes <b>⌄</b></span>
            </div>
        </summary>
        <div class="fechamento-pedido-detalhes">
            <div class="fechamento-pedido-detalhes-topo">
                <div><span>Cliente</span><strong>${p.nome || 'Não informado'}</strong></div>
                <div><span>Horário</span><strong>${formatarHorario(p.timestamp)}</strong></div>
                <div><span>Modalidade</span><strong>${tipoLabel}</strong></div>
                <div><span>Pagamento</span><strong>${formaPagamento}</strong></div>
            </div>
            <div class="fechamento-itens-box">
                <span class="fechamento-detalhe-label">Itens do pedido</span>
                ${itensHtml || '<p class="dica-secao">Itens não informados.</p>'}
            </div>
            <div class="fechamento-valores-grade">
                <div><span>Subtotal</span><strong>${formatarPreco(p.subtotal || 0)}</strong></div>
                <div><span>Desconto</span><strong>${formatarPreco(p.desconto || 0)}</strong></div>
                <div><span>Frete</span><strong>${formatarPreco(p.frete || 0)}</strong></div>
                <div class="total"><span>Total</span><strong>${total}</strong></div>
            </div>
            ${p.pagamento ? `<div class="fechamento-info-box"><strong>Status do pagamento</strong><span>${montarTagPagamento(p)}</span></div>` : ''}
            ${p.observacoes ? `<div class="fechamento-info-box"><strong>Observações</strong><span>${p.observacoes}</span></div>` : ''}
            ${p.tipoEntrega === 'entrega' ? `<div class="fechamento-info-box"><strong>Endereço</strong><span>${formatarEnderecoResumo(p.endereco)}</span></div>` : ''}
            <div class="fechamento-pedido-acoes">
                <button class="btn-secondary" onclick="copiarPedidoIndividual('${p.id}')">📋 Copiar pedido</button>
                <button id="btnFechamentoLancado-${p.id}" class="btn-lancado${lancado ? ' lancado' : ''}" onclick="alternarLancadoFechamento('${p.id}')">${lancado ? '✅ Já lançado no sistema' : '☐ Marcar como lançado'}</button>
            </div>
        </div>
    </details>`;
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
    if (p.pagamentoConfirmadoManual) {
        texto += `Status do pagamento: PAGO (confirmado manualmente)\n`;
    } else if (p.pagamento) {
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
function copiarTodosPedidos(dataFormatada) {
    const todos = Object.values(fechamentoPedidosAtuais).sort((a, b) => (a.numero || a.timestamp || 0) - (b.numero || b.timestamp || 0));
    if (todos.length === 0) return;

    const concluidos = todos.filter(p => p.status === 'entregue');
    const emAndamento = todos.filter(p => p.status !== 'entregue' && p.status !== 'recusado');
    const totalConcluido = concluidos.reduce((s, p) => s + totalDoPedido(p), 0);
    const totalEmAndamento = emAndamento.reduce((s, p) => s + totalDoPedido(p), 0);

    let texto = `📋 FECHAMENTO DE PEDIDOS\n${LOJA_CONFIG.nome.toUpperCase()}\nData: ${dataFormatada}\n\n--------------------------------\n\n`;
    todos.forEach(p => {
        texto += montarTextoPedido(p);
        texto += `\n--------------------------------\n\n`;
    });
    texto += `TOTAL CONCLUÍDO: ${formatarPreco(totalConcluido)}\n`;
    texto += `EM ANDAMENTO (NÃO CONTABILIZADO): ${formatarPreco(totalEmAndamento)}\n`;
    texto += `PEDIDOS NO FILTRO: ${todos.length}\n`;

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
        const pontosAntes = atual.pontos || 0;
        const novosPontos = Math.max(0, pontosAntes + pontosGanhos - pontosResgatados);
        return ref.set({
            nome: pedido.nome || atual.nome || '',
            pontos: novosPontos,
            totalGasto: Math.round(((atual.totalGasto || 0) + valorBase) * 100) / 100,
            ultimoPedido: {
                itens: (pedido.itens || []).map(i => ({ produtoId: i.produtoId || null, nome: i.nome, preco: i.preco, quantidade: i.quantidade, observacao: i.observacao || null })),
                tipoEntrega: pedido.tipoEntrega,
                data: Date.now()
            },
            atualizadoEm: firebase.database.ServerValue.TIMESTAMP
        }).then(() => avisarSeAtingiuPatamarFidelidade(pedido.nome || atual.nome, pontosAntes, novosPontos));
    }).catch(err => console.log('Erro ao ler/creditar fidelidade:', err));
}

// Avisa quando o cliente CRUZA um patamar de recompensa configurado (ex: passou de
// 90 pra 110 pontos, e uma recompensa pede 100) — sem isso, o crédito de pontos é
// completamente silencioso e ninguém no painel fica sabendo que alguém já pode resgatar
async function avisarSeAtingiuPatamarFidelidade(nomeCliente, pontosAntes, pontosDepois) {
    if (pontosDepois <= pontosAntes) return; // só interessa quando pontos SOBEM
    try {
        const snap = await db.ref('configuracao/recompensasFidelidade').once('value');
        const recompensas = (snap.val() || []).filter(Boolean);
        const cruzadas = recompensas.filter(r => pontosAntes < r.pontos && r.pontos <= pontosDepois);
        if (cruzadas.length === 0) return;
        tocarAlerta();
        const descricoes = cruzadas.map(r => `🎁 ${r.descricao} (${r.pontos} pontos)`).join('\n');
        alert(`⭐ ${nomeCliente || 'Um cliente'} acabou de atingir pontos suficientes pra resgatar:\n\n${descricoes}`);
    } catch (err) {
        console.log('Não foi possível checar patamares de fidelidade:', err.message);
    }
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

    iniciarTempoOperacaoLoja();
    escutarConfigLoja();
    escutarNotificacaoAberturaAtiva();
    escutarModelosNotificacao();
    escutarImpressaoAutomaticaAtiva();
    obterOuCriarCampanhaAtual().then(renderHistoricoCampanhasMensagemMassa);
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
    escutarDestaquesManuais();
    escutarBannersCarrossel();
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
    const campoPmData = document.getElementById('pmData');
    if (campoPmData) campoPmData.value = hojeFormatado;

    // E o período de visitas já vem com os últimos 7 dias
    const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
    const seteDiasAtrasFormatado = seteDiasAtras.getFullYear() + '-' + String(seteDiasAtras.getMonth() + 1).padStart(2, '0') + '-' + String(seteDiasAtras.getDate()).padStart(2, '0');
    document.getElementById('visitasDataInicio').value = seteDiasAtrasFormatado;
    document.getElementById('visitasDataFim').value = hojeFormatado;
    escutarRecompensas();

    const refPedidos = db.ref('pedidos');
    const statusFinais = ['entregue', 'recusado', 'aguardando_pagamento'];
    const ehStatusFinal = pedido => statusFinais.includes(pedido.status);

    // Kanban visual: reaproveita exatamente os status existentes no sistema.
    // Nenhum status novo é gravado no banco nesta etapa.
    function obterListaKanbanPorStatus(status) {
        if (status === 'pendente') return document.getElementById('listaKanbanNovos');
        if (status === 'aceito') return document.getElementById('listaKanbanPreparo');
        if (status === 'em_rota' || status === 'pronto_retirada') return document.getElementById('listaKanbanExpedicao');
        if (status === 'entregue') return document.getElementById('listaKanbanFinalizados');
        return null;
    }

    function textoVazioKanban(statusGrupo) {
        return {
            novos: 'Nenhum pedido novo.',
            preparo: 'Nenhum pedido em preparo.',
            expedicao: 'Nenhum pedido nesta etapa.',
            finalizados: 'Nenhum finalizado nas últimas 24h.'
        }[statusGrupo] || 'Nenhum pedido.';
    }

    function garantirVazioKanban(container, statusGrupo) {
        if (!container) return;
        const cards = container.querySelectorAll('.pedido-card');
        const vazio = container.querySelector('.vazio');
        if (cards.length === 0 && !vazio) {
            container.innerHTML = `<p class="vazio">${textoVazioKanban(statusGrupo)}</p>`;
        } else if (cards.length > 0 && vazio) {
            vazio.remove();
        }
    }

    function atualizarContadoresKanban() {
        const grupos = [
            ['listaKanbanNovos', 'contadorKanbanNovos', 'novos'],
            ['listaKanbanPreparo', 'contadorKanbanPreparo', 'preparo'],
            ['listaKanbanExpedicao', 'contadorKanbanExpedicao', 'expedicao'],
            ['listaKanbanFinalizados', 'contadorKanbanFinalizados', 'finalizados']
        ];
        grupos.forEach(([listaId, contadorId, grupo]) => {
            const lista = document.getElementById(listaId);
            const contador = document.getElementById(contadorId);
            if (!lista || !contador) return;
            garantirVazioKanban(lista, grupo);
            contador.textContent = lista.querySelectorAll('.pedido-card').length;
        });
        atualizarContador();
    }

    function colocarPedidoNoKanban(id, pedido, comAcoes = true) {
        const cardAnterior = document.getElementById('pendente-' + id);
        if (cardAnterior) cardAnterior.remove();

        const destino = obterListaKanbanPorStatus(pedido.status);
        if (!destino) {
            idsRenderizados.delete(id);
            atualizarContadoresKanban();
            return;
        }

        const vazio = destino.querySelector('.vazio');
        if (vazio) vazio.remove();
        destino.appendChild(montarCardPedido(id, pedido, comAcoes));
        if (pedido.status !== 'entregue') idsRenderizados.add(id);
        atualizarContadoresKanban();
    }

    function removerPedidoDoKanbanAtivo(id) {
        const card = document.getElementById('pendente-' + id);
        if (card) card.remove();
        idsRenderizados.delete(id);
        atualizarContadoresKanban();
    }

    // Guarda o status de pagamento (sinal/restante) já conhecido de cada pedido, pra
    // depois comparar no child_changed e detectar quando um pagamento é confirmado.
    const statusPagamentoConhecido = new Map();
    function statusPagamentoAtual(pedido) {
        return (pedido.pagamento ? pedido.pagamento.status : '') + '|' + (pedido.pagamentoRestante ? pedido.pagamentoRestante.status : '');
    }

    // Carrega os pedidos ativos já existentes, sem tocar som.
    refPedidos.limitToLast(60).once('value').then(snapshot => {
        ['listaKanbanNovos', 'listaKanbanPreparo', 'listaKanbanExpedicao'].forEach(idLista => {
            const el = document.getElementById(idLista);
            if (el) el.innerHTML = '';
        });
        idsRenderizados.clear();

        const itens = [];
        snapshot.forEach(child => itens.push({ id: child.key, pedido: child.val() }));
        itens.forEach(({ id, pedido }) => {
            statusPagamentoConhecido.set(id, statusPagamentoAtual(pedido));
            if (ehStatusFinal(pedido)) return;
            colocarPedidoNoKanban(id, pedido, true);
        });
        atualizarContadoresKanban();
        primeiraCargaConcluida = true;
        restaurarPosicaoRolagem();

        // A partir daqui, qualquer pedido novo dispara som + aparece na coluna correta.
        refPedidos.on('child_added', snap => {
            if (idsRenderizados.has(snap.key)) return;
            const pedido = snap.val();
            statusPagamentoConhecido.set(snap.key, statusPagamentoAtual(pedido));
            if (ehStatusFinal(pedido)) return;

            colocarPedidoNoKanban(snap.key, pedido, true);
            if (primeiraCargaConcluida && pedido.status === 'pendente' && !window._importandoBackupGestao) {
                tocarAlerta();
                const sinalJaPago = pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal' && pedido.pagamento.status === 'pago';
                const restanteJaPago = pedido.pagamentoRestante && pedido.pagamentoRestante.status === 'pago';
                const pagamentoNormalJaPago = pedido.pagamento && pedido.pagamento.tipoPagamento !== 'sinal' && pedido.pagamento.status === 'pago';
                if (sinalJaPago || restanteJaPago || pagamentoNormalJaPago) {
                    const tipoTexto = restanteJaPago && sinalJaPago ? 'Sinal e restante' : (restanteJaPago ? 'Restante' : (sinalJaPago ? 'Sinal' : 'Pagamento'));
                    mostrarAvisoFlutuantePagamento(`💰 ${tipoTexto} do pedido #${pedido.numero || ''} (${pedido.nome || ''}) foi confirmado como pago agora!`);
                }
            }
        });

        // Toda mudança de status apenas move o mesmo pedido entre as colunas.
        refPedidos.on('child_changed', snap => {
            const pedido = snap.val();

            const statusAnterior = statusPagamentoConhecido.get(snap.key) || '';
            const statusNovo = statusPagamentoAtual(pedido);
            if (statusAnterior !== statusNovo) {
                const acabouDePagarAlgumaCoisa = pedido.pagamento && pedido.pagamento.status === 'pago' && !statusAnterior.startsWith('pago');
                const restanteAcabouDePagar = pedido.pagamentoRestante && pedido.pagamentoRestante.status === 'pago' && !statusAnterior.endsWith('pago');
                if ((acabouDePagarAlgumaCoisa || restanteAcabouDePagar) && !window._importandoBackupGestao) {
                    tocarAlerta();
                    const ehSinal = pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal';
                    const tipoTexto = restanteAcabouDePagar && acabouDePagarAlgumaCoisa ? 'Sinal e restante' : (restanteAcabouDePagar ? 'Restante' : (ehSinal ? 'Sinal' : 'Pagamento'));
                    mostrarAvisoFlutuantePagamento(`💰 ${tipoTexto} do pedido #${pedido.numero || ''} (${pedido.nome || ''}) foi confirmado como pago agora!`);
                }
                statusPagamentoConhecido.set(snap.key, statusNovo);
            }

            if (ehStatusFinal(pedido)) {
                removerPedidoDoKanbanAtivo(snap.key);
            } else {
                const jaEstavaVisivel = idsRenderizados.has(snap.key);
                colocarPedidoNoKanban(snap.key, pedido, true);
                if (!jaEstavaVisivel && pedido.status === 'pendente' && !window._importandoBackupGestao) tocarAlerta();
            }
        });

        refPedidos.on('child_removed', snap => {
            removerPedidoDoKanbanAtivo(snap.key);
        });
    });

    // Histórico: pedidos das últimas 24 horas, exceto rascunhos aguardando pagamento.
    // Usa a ordenação padrão por chave (o Firebase já cria as chaves em ordem cronológica sozinho),
    // em vez de orderByChild('timestamp'), que exigiria um índice configurado na regra pra ser confiável.
    db.ref('pedidos').limitToLast(60).on('value', snapshot => {
        const listaHistoricoEl = document.getElementById('listaHistorico');
        const limite24h = Date.now() - (24 * 60 * 60 * 1000);
        const itens = [];
        snapshot.forEach(child => {
            const p = child.val();
            const ts = typeof p.timestamp === 'number' ? p.timestamp : 0;
            // Pedido online ainda aguardando confirmação de pagamento fica totalmente
            // invisível no painel. Ele só entra no histórico depois que o webhook/consulta
            // da InfinitePay confirmar o pagamento e mudar o status.
            if (p.status === 'aguardando_pagamento') return;
            if (ts >= limite24h) itens.push({ id: child.key, pedido: p });
        });
        itens.reverse();
        listaHistoricoEl.innerHTML = '';
        if (itens.length === 0) {
            listaHistoricoEl.innerHTML = '<p class="vazio">Nenhum pedido nas últimas 24 horas.</p>';
        } else {
            itens.forEach(({ id, pedido }) => {
                listaHistoricoEl.appendChild(montarCardPedido(id, pedido, false));
            });
        }

        // A coluna Finalizados é só uma visão rápida dos pedidos concluídos nas últimas 24h.
        // O histórico completo continua logo abaixo, sem mudar a lógica que já existia.
        const listaFinalizados = document.getElementById('listaKanbanFinalizados');
        if (listaFinalizados) {
            listaFinalizados.innerHTML = '';
            const finalizados = itens.filter(item => item.pedido.status === 'entregue');
            if (finalizados.length === 0) {
                listaFinalizados.innerHTML = '<p class="vazio">Nenhum finalizado nas últimas 24h.</p>';
            } else {
                finalizados.forEach(({ id, pedido }) => {
                    listaFinalizados.appendChild(montarCardPedido(id, pedido, false));
                });
            }
            const contadorFinalizados = document.getElementById('contadorKanbanFinalizados');
            if (contadorFinalizados) contadorFinalizados.textContent = finalizados.length;
        }
    });
}


// ---------- HUB CLIENTES & MARKETING / LOJA ----------
function mostrarSubabaClientesMarketing(nome) {
    const raiz = document.querySelector('section[data-tab="clientes-marketing"]');
    if (!raiz) return;
    raiz.querySelectorAll('[data-cm-subtab]').forEach(p => p.classList.toggle('active', p.dataset.cmSubtab === nome));
    raiz.querySelectorAll('[data-cm-subtab-btn]').forEach(b => b.classList.toggle('active', b.dataset.cmSubtabBtn === nome));
    localStorage.setItem('clientesMarketingSubaba', nome);
}

function mostrarSubabaLoja(nome) {
    const raiz = document.querySelector('section[data-tab="loja"]');
    if (!raiz) return;
    raiz.querySelectorAll('[data-loja-subtab]').forEach(p => p.classList.toggle('active', p.dataset.lojaSubtab === nome));
    raiz.querySelectorAll('[data-loja-subtab-btn]').forEach(b => b.classList.toggle('active', b.dataset.lojaSubtabBtn === nome));
    localStorage.setItem('lojaSubaba', nome);
}

document.addEventListener('DOMContentLoaded', () => {
    mostrarSubabaClientesMarketing(localStorage.getItem('clientesMarketingSubaba') || 'clientes');
    mostrarSubabaLoja(localStorage.getItem('lojaSubaba') || 'configuracoes');
});
