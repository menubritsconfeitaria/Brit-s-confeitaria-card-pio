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

    const clubeTituloAdmin = document.getElementById('clubeTituloAdmin');
    if (clubeTituloAdmin) clubeTituloAdmin.textContent = `⭐ Clube ${LOJA_CONFIG.nomeCurto} (Fidelidade)`;
}
aplicarConfigDaLojaNoAdmin();

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
        btn.addEventListener('click', () => mostrarAba(btn.dataset.tab, true));
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
    const tags = {
        aguardando: '<span class="pedido-tag tag-pagamento-aguardando">🟡 Aguardando pagamento</span>',
        pago: `<span class="pedido-tag tag-pagamento-pago">🟢 Pago (${p.metodo || 'Online'})</span>`,
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

function escutarProdutos() {
    db.ref('produtos').on('value', snap => {
        const lista = document.getElementById('produtosAdminList');
        const btnImportar = document.getElementById('btnImportarDados');

        const val = snap.val() || {};
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
    const variantesTexto = document.getElementById('prodVariantes_' + id).value.trim();
    const adicionaisTexto = document.getElementById('prodAdicionais_' + id).value.trim();

    const imagens = imagensTexto ? imagensTexto.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];

    if (!nome || isNaN(preco) || imagens.length === 0 || !categoria) {
        alert('Preencha nome, preço, ao menos uma foto e categoria antes de salvar.');
        return;
    }

    const dados = { nome, descricao, preco, imagem: imagens[0], imagens, categoria, disponivel, precoOriginal: null, variantes: null, grupoAdicionais: null };

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

function montarCupomLinha(codigo, cupom) {
    const div = document.createElement('div');
    div.classList.add('cupom-admin-item');
    let detalhe = 'Frete grátis';
    if (cupom.tipo === 'percentual') detalhe = `${cupom.valor}% de desconto`;
    else if (cupom.tipo === 'fixo') detalhe = `R$ ${Number(cupom.valor).toFixed(2).replace('.', ',')} de desconto`;

    div.innerHTML = `
        <div class="cupom-admin-info">
            <strong>${codigo}</strong>
            <span>${detalhe}</span>
        </div>
        <button class="btn-excluir-cupom" onclick="excluirCupom('${codigo}')">🗑️</button>
    `;
    return div;
}

function escutarCupons() {
    db.ref('cupons').on('value', snap => {
        const val = snap.val() || {};
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

    if (!codigo) { alert('Digite um código pro cupom.'); return; }
    if (tipo !== 'frete_gratis' && (isNaN(valorInput) || valorInput <= 0)) {
        alert('Digite um valor válido pro desconto.');
        return;
    }

    const dadosCupom = tipo === 'frete_gratis' ? { tipo } : { tipo, valor: valorInput };

    db.ref('cupons/' + codigo).set(dadosCupom)
        .then(() => {
            document.getElementById('novoCupomCodigo').value = '';
            document.getElementById('novoCupomValor').value = '';
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

function verFotosEmUso() {
    db.ref('produtos').once('value').then(snap => {
        const val = snap.val() || {};
        const nomesImagens = new Set();
        Object.values(val).forEach(produto => {
            const imagens = (Array.isArray(produto.imagens) && produto.imagens.length > 0)
                ? produto.imagens
                : (produto.imagem ? [produto.imagem] : []);
            imagens.forEach(img => { if (img) nomesImagens.add(img); });
        });
        renderFotosEmUso([...nomesImagens].sort());
    }).catch(err => alert('Não foi possível carregar as fotos em uso: ' + err.message));
}

function renderFotosEmUso(lista) {
    const div = document.getElementById('fotosEmUsoConteudo');
    const btnCopiar = document.getElementById('btnCopiarFotos');

    if (lista.length === 0) {
        div.innerHTML = '<p class="vazio">Nenhuma foto cadastrada em nenhum produto ainda.</p>';
        btnCopiar.style.display = 'none';
        window._fotosEmUsoTexto = '';
        return;
    }

    div.innerHTML = `<p class="dica-secao">${lista.length} foto(s) em uso agora. Qualquer arquivo do GitHub que NÃO estiver nessa lista pode ser removido com segurança:</p>` +
        lista.map(nome => `<div class="pedido-total-linha"><span>🖼️ ${nome}</span></div>`).join('');

    window._fotosEmUsoTexto = lista.join('\n');
    btnCopiar.style.display = 'block';
}

function copiarFotosEmUso() {
    if (!window._fotosEmUsoTexto) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window._fotosEmUsoTexto)
            .then(() => alert('Lista copiada! Já pode comparar com os arquivos do GitHub.'))
            .catch(() => alert('Não foi possível copiar automaticamente. Copie o texto manualmente da tela.'));
    } else {
        alert('Seu navegador não permite copiar automaticamente. Copie o texto manualmente da tela.');
    }
}

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
        versao: 1,
        cliente: { nome: p.nome || '', telefone: p.telefone || '' },
        data: dataFormatada,
        itens: (p.itens || []).map(item => ({ nome: item.nome, quantidade: item.quantidade })),
        descontoPercentual,
        frete: p.frete || 0,
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
    escutarHistoricoNotificacoes();
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
            if (primeiraCargaConcluida && pedido.status === 'pendente') tocarAlerta();
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
