const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const https = require('https');
const LOJA = require('./loja-config');
admin.initializeApp();

/**
 * Dispara quando qualquer produto é criado, editado ou apagado no Firebase.
 * Decide se vale a pena avisar os clientes, e se sim, manda a notificação
 * pra todo mundo que já ativou (salvo em /notificacaoTokens).
 */
exports.avisarProdutoAtualizado = functions.database
    .ref('/produtos/{produtoId}')
    .onWrite(async (change, context) => {
        const antes = change.before.val();
        const depois = change.after.val();

        // Produto foi excluído -> não precisa avisar ninguém
        if (!depois) return null;

        let titulo = null;
        let corpo = null;

        const precoAntes = antes ? Number(antes.preco) : null;
        const precoOriginalAntes = antes ? Number(antes.precoOriginal) : null;
        const eraOferta = antes && precoOriginalAntes && precoOriginalAntes > precoAntes;

        const precoDepois = Number(depois.preco);
        const precoOriginalDepois = Number(depois.precoOriginal);
        const agoraOferta = precoOriginalDepois && precoOriginalDepois > precoDepois;

        if (!antes) {
            // Produto novo, criado agora
            if (depois.disponivel && !depois.escondido) {
                titulo = `🆕 Novidade na ${LOJA.nome}!`;
                corpo = `${depois.nome} já está disponível no cardápio.`;
            }
        } else if (!eraOferta && agoraOferta && depois.disponivel && !depois.escondido) {
            // Acabou de entrar em oferta
            titulo = `🔥 Oferta na ${LOJA.nome}!`;
            corpo = `${depois.nome}: de R$ ${precoOriginalDepois.toFixed(2).replace('.', ',')} por R$ ${precoDepois.toFixed(2).replace('.', ',')}.`;
        } else if (antes.disponivel === false && depois.disponivel === true && !depois.escondido) {
            // Voltou a ficar disponível
            titulo = '✅ Voltou a ficar disponível!';
            corpo = `${depois.nome} já pode ser pedido de novo na ${LOJA.nomeCurto}.`;
        }

        // Nada relevante mudou -> não avisa (evita notificação toda vez que só o preço normal muda, por exemplo)
        if (!titulo) return null;

        const tokensSnap = await admin.database().ref('notificacaoTokens').once('value');
        const tokensObj = tokensSnap.val() || {};
        const tokens = Object.keys(tokensObj);

        if (tokens.length === 0) return null;

        const mensagem = {
            notification: { title: titulo, body: corpo },
            tokens: tokens
        };

        const resposta = await admin.messaging().sendEachForMulticast(mensagem);

        // Limpa do banco os tokens que não funcionam mais (cliente desinstalou, bloqueou notificação, etc.)
        const remocoes = [];
        resposta.responses.forEach((r, i) => {
            if (!r.success) {
                remocoes.push(admin.database().ref('notificacaoTokens/' + tokens[i]).remove());
            }
        });
        await Promise.all(remocoes);

        return null;
    });

/**
 * Dispara quando o status de um pedido muda. Se aquele pedido específico tem um
 * token de notificação salvo (o cliente ativou notificações no aparelho dele na
 * hora de fazer o pedido), manda um aviso só pra ELE — nunca um broadcast geral.
 */
exports.avisarStatusPedidoAtualizado = functions.database
    .ref('/pedidos/{pedidoId}')
    .onUpdate(async (change, context) => {
        const antes = change.before.val();
        const depois = change.after.val();

        // Só notifica se o status realmente mudou, e se esse pedido tem um token salvo
        if (!depois.notificacaoToken || antes.status === depois.status) return null;

        const mensagensPorStatus = {
            aceito: { titulo: '✅ Pedido confirmado!', corpo: `${LOJA.nome} já está preparando o seu pedido.` },
            em_rota: { titulo: '🛵 Saiu para entrega!', corpo: 'Seu pedido já está a caminho.' },
            entregue: { titulo: '🎉 Pedido entregue!', corpo: `Bom apetite! Obrigado por escolher a ${LOJA.nomeCurto}.` },
            recusado: { titulo: 'Não foi possível aceitar seu pedido', corpo: `Entre em contato com a ${LOJA.nome} para mais detalhes.` }
        };

        const msg = mensagensPorStatus[depois.status];
        if (!msg) return null; // status "pendente" ou algum outro não mapeado -> não notifica

        try {
            await admin.messaging().send({
                notification: { title: msg.titulo, body: msg.corpo },
                token: depois.notificacaoToken
            });
        } catch (err) {
            // Token pode ter expirado/ficado inválido — não trava nada, só registra o motivo
            console.log('Não foi possível notificar o cliente sobre o status do pedido:', err.message);
        }

        return null;
    });

// ---------- Aviso de "loja abriu" (manual ou automático por horário) ----------

// Mesmo horário padrão usado no cardápio (script.js) — mantém os dois sincronizados
const horariosPadrao = [
    { aberto: true, abre: '09:00', fecha: '13:00' }, // Domingo
    { aberto: true, abre: '10:00', fecha: '18:00' }, // Segunda
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Terça
    { aberto: true, abre: '09:00', fecha: '18:00' }, // Quarta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Quinta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Sexta
    { aberto: true, abre: '09:00', fecha: '16:00' }  // Sábado
];

function horarioParaMinutos(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// Pega o dia da semana e o horário atual, sempre no fuso de Brasília — o servidor do
// Google roda em UTC por padrão, não dá pra confiar no fuso "local" da máquina
function obterDiaEMinutosBrasil() {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const mapa = {};
    formatter.formatToParts(new Date()).forEach(p => { mapa[p.type] = p.value; });
    const diasSemana = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { diaSemana: diasSemana[mapa.weekday], minutosAgora: parseInt(mapa.hour, 10) * 60 + parseInt(mapa.minute, 10) };
}

// Calcula se a loja está aberta agora — mesma lógica do cardápio (script.js),
// reimplementada aqui pra poder rodar no servidor
function calcularLojaAberta(config) {
    const modoManual = config && config.modoManual;
    if (modoManual === 'aberto') return true;
    if (modoManual === 'fechado') return false;

    const { diaSemana, minutosAgora } = obterDiaEMinutosBrasil();
    const horarios = config && config.horarios;
    const diaConfig = (horarios && horarios[diaSemana]) || horariosPadrao[diaSemana];
    if (!diaConfig || !diaConfig.aberto) return false;

    const abre = horarioParaMinutos(diaConfig.abre);
    const fecha = horarioParaMinutos(diaConfig.fecha);
    return minutosAgora >= abre && minutosAgora < fecha;
}

// Manda o aviso de "loja abriu" pra quem ativou notificações
async function enviarAvisoLojaAbriu() {
    const tokensSnap = await admin.database().ref('notificacaoTokens').once('value');
    const tokensObj = tokensSnap.val() || {};
    const tokens = Object.keys(tokensObj);
    if (tokens.length === 0) return;

    const resposta = await admin.messaging().sendEachForMulticast({
        notification: {
            title: '🟢 Estamos abertos!',
            body: `${LOJA.nome} já está aceitando pedidos. Vem conferir as delícias de hoje!`
        },
        tokens: tokens
    });

    const remocoes = [];
    resposta.responses.forEach((r, i) => {
        if (!r.success) remocoes.push(admin.database().ref('notificacaoTokens/' + tokens[i]).remove());
    });
    await Promise.all(remocoes);
}

// Usa uma transação pra garantir que o aviso só sai UMA vez por abertura, mesmo que o
// gatilho manual e o automático detectem a mudança quase ao mesmo tempo
/**
 * Manda uma notificação push com título/texto livres, escritos na hora pelo painel —
 * pra avisos que não se encaixam nos automáticos (loja abriu, produto novo, etc), tipo
 * "Hoje o pedido mínimo caiu!" ou "Funcionamos até mais tarde hoje". Só quem estiver
 * logado no painel (com o `auth` do Firebase) pode chamar essa função.
 */
// Manda a notificação de verdade pra todo mundo com token salvo, e limpa quem não
// funciona mais. Reaproveitada tanto pelo envio imediato quanto pelo agendado.
async function enviarNotificacaoParaTodos(titulo, corpo) {
    const tokensSnap = await admin.database().ref('notificacaoTokens').once('value');
    const tokensObj = tokensSnap.val() || {};
    const tokens = Object.keys(tokensObj);
    if (tokens.length === 0) {
        return { destinatarios: 0, enviados: 0, falhas: 0 };
    }

    const resposta = await admin.messaging().sendEachForMulticast({
        notification: { title: titulo, body: corpo },
        tokens: tokens
    });

    // Mesma limpeza de sempre: remove tokens que não funcionaram mais (app desinstalado, etc)
    const remocoes = [];
    resposta.responses.forEach((r, i) => {
        if (!r.success) remocoes.push(admin.database().ref('notificacaoTokens/' + tokens[i]).remove());
    });
    await Promise.all(remocoes);

    return { destinatarios: tokens.length, enviados: resposta.successCount, falhas: tokens.length - resposta.successCount };
}

/**
 * Verifica se uma data está disponível pra encomenda — olha se foi bloqueada manualmente
 * pela loja, e se o limite de encomendas do dia (se configurado) já foi atingido. Roda no
 * servidor porque o cliente não tem permissão de leitura da lista geral de pedidos (por
 * privacidade) — só assim dá pra contar quantos pedidos já tem numa data sem expor dados.
 * Não exige login — é chamada direto do cardápio, por qualquer visitante.
 */
exports.verificarDisponibilidadeData = functions.https.onCall(async (data, context) => {
    const dataDesejada = data && data.data; // formato 'YYYY-MM-DD'
    if (!dataDesejada || !/^\d{4}-\d{2}-\d{2}$/.test(dataDesejada)) {
        throw new functions.https.HttpsError('invalid-argument', 'Data inválida.');
    }
    // Confere no servidor também (não confia só no "min" do campo de data no navegador,
    // que dá pra burlar) — hoje, no fuso do servidor, comparando só a data (sem hora)
    const hojeISO = new Date().toISOString().slice(0, 10);
    if (dataDesejada < hojeISO) {
        return { disponivel: false, motivo: 'passada' };
    }

    const configSnap = await admin.database().ref('configuracao/agenda').once('value');
    const config = configSnap.val() || {};
    const datasBloqueadas = config.datasBloqueadas || {};
    const capacidadeMaxima = config.capacidadeMaximaDia || 0; // 0 = sem limite de quantidade

    if (datasBloqueadas[dataDesejada]) {
        return { disponivel: false, motivo: 'bloqueada' };
    }

    if (capacidadeMaxima > 0) {
        const pedidosSnap = await admin.database().ref('pedidos').once('value');
        const pedidos = pedidosSnap.val() || {};
        const jaAgendados = Object.values(pedidos).filter(p =>
            p.dataEncomenda === dataDesejada && p.status !== 'cancelado'
        ).length;

        if (jaAgendados >= capacidadeMaxima) {
            return { disponivel: false, motivo: 'lotada' };
        }
        return { disponivel: true, vagasRestantes: capacidadeMaxima - jaAgendados };
    }

    return { disponivel: true };
});

exports.enviarNotificacaoPersonalizada = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Só o painel logado pode enviar notificações.');
    }

    const titulo = (data && data.titulo || '').trim();
    const corpo = (data && data.corpo || '').trim();
    if (!titulo || !corpo) {
        throw new functions.https.HttpsError('invalid-argument', 'Preencha o título e a mensagem.');
    }

    const resultado = await enviarNotificacaoParaTodos(titulo, corpo);

    // Guarda no histórico, pra aparecer no painel depois — mesmo que tenha tido alguma
    // falha parcial, o envio em si aconteceu, então vale registrar
    await admin.database().ref('notificacoesEnviadas').push({
        titulo, corpo, tipo: 'imediata', status: 'enviada',
        timestamp: admin.database.ServerValue.TIMESTAMP,
        ...resultado
    });

    return resultado;
});

/**
 * Agenda uma notificação pra ser enviada mais tarde — só grava no banco com status
 * "agendada". Quem realmente manda é processarNotificacoesAgendadas, que roda de
 * 5 em 5 minutos (mesmo padrão já usado pra abertura automática da loja).
 */
exports.agendarNotificacao = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Só o painel logado pode agendar notificações.');
    }

    const titulo = (data && data.titulo || '').trim();
    const corpo = (data && data.corpo || '').trim();
    const agendadoPara = data && data.agendadoPara;
    if (!titulo || !corpo) {
        throw new functions.https.HttpsError('invalid-argument', 'Preencha o título e a mensagem.');
    }
    if (!agendadoPara || typeof agendadoPara !== 'number' || agendadoPara <= Date.now()) {
        throw new functions.https.HttpsError('invalid-argument', 'Escolha uma data e hora no futuro.');
    }

    const novaRef = await admin.database().ref('notificacoesEnviadas').push({
        titulo, corpo, tipo: 'agendada', status: 'agendada',
        agendadoPara,
        criadoEm: admin.database.ServerValue.TIMESTAMP
    });

    return { id: novaRef.key };
});

/**
 * Cancela uma notificação agendada — só funciona se ela ainda não tiver sido enviada
 * (evita cancelar algo que já saiu, ou cancelar duas vezes por engano).
 */
exports.cancelarNotificacaoAgendada = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Só o painel logado pode cancelar.');
    }
    const id = data && data.id;
    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltou informar qual notificação cancelar.');
    }

    const ref = admin.database().ref('notificacoesEnviadas/' + id);
    const snap = await ref.once('value');
    const registro = snap.val();
    if (!registro || registro.status !== 'agendada') {
        throw new functions.https.HttpsError('failed-precondition', 'Essa notificação não pode mais ser cancelada.');
    }

    await ref.update({ status: 'cancelada' });
    return { ok: true };
});

/**
 * Roda a cada 5 minutos: procura notificações agendadas cuja hora já chegou, manda de
 * verdade, e atualiza o status (enviada ou falhou). Precisão de +/- 5 minutos — mesmo
 * padrão já usado pra abertura automática da loja.
 */
exports.processarNotificacoesAgendadas = functions.pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
        const agora = Date.now();
        const snap = await admin.database().ref('notificacoesEnviadas')
            .orderByChild('status').equalTo('agendada').once('value');
        const pendentes = snap.val() || {};

        const tarefas = Object.entries(pendentes)
            .filter(([id, n]) => n.agendadoPara && n.agendadoPara <= agora)
            .map(async ([id, n]) => {
                try {
                    const resultado = await enviarNotificacaoParaTodos(n.titulo, n.corpo);
                    await admin.database().ref('notificacoesEnviadas/' + id).update({
                        status: 'enviada',
                        enviadoEm: admin.database.ServerValue.TIMESTAMP,
                        ...resultado
                    });
                } catch (err) {
                    console.log('Falha ao enviar notificação agendada ' + id + ':', err.message);
                    await admin.database().ref('notificacoesEnviadas/' + id).update({ status: 'falhou' });
                }
            });

        await Promise.all(tarefas);
        return null;
    });

async function avisarSeAcabouDeAbrir(estaAbertaAgora) {
    let valorAntes;
    const resultado = await admin.database().ref('notificacoesEstado/lojaAberta').transaction(atual => {
        valorAntes = atual;
        return estaAbertaAgora;
    });

    const acabouDeAbrir = resultado.committed && estaAbertaAgora === true && valorAntes !== true;
    if (acabouDeAbrir) await enviarAvisoLojaAbriu();
}

/**
 * Dispara quando a configuração de horário/modo manual da loja muda (ex: você aperta
 * "Abrir loja" no painel). Se isso fez a loja passar de fechada pra aberta, avisa
 * quem ativou notificações.
 */
exports.avisarAberturaManualLoja = functions.database
    .ref('/configuracao/loja')
    .onWrite(async (change, context) => {
        await avisarSeAcabouDeAbrir(calcularLojaAberta(change.after.val()));
        return null;
    });

/**
 * Roda a cada 5 minutos e confere se a loja abriu sozinha pelo horário programado
 * (sem nenhuma ação manual) — cobre o caso de abertura automática.
 */
exports.verificarAberturaAutomaticaLoja = functions.pubsub
    .schedule('every 5 minutes')
    .onRun(async (context) => {
        const configSnap = await admin.database().ref('configuracao/loja').once('value');
        await avisarSeAcabouDeAbrir(calcularLojaAberta(configSnap.val()));
        return null;
    });

// ---------- Pagamento online via InfinitePay (Checkout Integrado) ----------

/**
 * Calcula o total "de verdade" do pedido, do mesmo jeito que o resto do sistema já
 * faz (mesma lógica usada no cardápio e no painel) — nunca confia em nenhum valor
 * que viesse do navegador do cliente, sempre recalcula aqui a partir dos itens.
 */
// Busca a InfiniteTag configurada pelo painel primeiro (mais prático pra cliente novo,
// não precisa editar functions/loja-config.js); se não tiver nada lá, usa o arquivo
async function buscarInfiniteTagEfetiva() {
    const snap = await admin.database().ref('configuracao/loja/infiniteTag').once('value');
    const doPainel = snap.val();
    if (doPainel) return doPainel;
    return LOJA.infinitePayHandle;
}

function totalDoPedidoFn(pedido) {
    if (pedido.total != null) return pedido.total;
    const subtotal = pedido.subtotal || 0;
    const desconto = pedido.desconto || 0;
    const frete = pedido.frete || 0;
    return Math.max(0, subtotal - desconto + frete);
}

// Converte um valor em reais (ex: 20.5) pra centavos inteiros (ex: 2050), sem erro
// de arredondamento de ponto flutuante
function paraCentavos(valorReais) {
    return Math.round((valorReais || 0) * 100);
}

// Faz um POST em JSON usando o módulo nativo "https" do Node — mais garantido de
// funcionar em qualquer ambiente do que depender do fetch() global
function postJson(url, corpoObjeto) {
    return new Promise((resolve, reject) => {
        const corpoTexto = JSON.stringify(corpoObjeto);
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(corpoTexto)
            },
            timeout: 15000
        }, (res) => {
            let dados = '';
            res.on('data', (pedaco) => { dados += pedaco; });
            res.on('end', () => {
                let corpoResposta;
                try { corpoResposta = dados ? JSON.parse(dados) : {}; }
                catch (e) { corpoResposta = { erroDeParse: dados.slice(0, 500) }; }
                resolve({ status: res.statusCode, corpo: corpoResposta });
            });
        });
        req.on('timeout', () => { req.destroy(new Error('Tempo esgotado ao conectar com a InfinitePay')); });
        req.on('error', reject);
        req.write(corpoTexto);
        req.end();
    });
}

/**
 * Chamada pelo cardápio quando o cliente escolhe "pagar agora online". Recebe só o
 * ID de um pedido que já existe no Firebase, busca os dados reais desse pedido (nunca
 * confia em preço/itens vindos do navegador), monta os itens pro formato da InfinitePay,
 * cria o link de pagamento, e devolve a URL do checkout pro cardápio redirecionar o cliente.
 */
exports.criarCheckoutInfinitePay = functions.https.onCall(async (data, context) => {
    const pedidoId = data && data.pedidoId;
    if (!pedidoId) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltou informar o pedidoId.');
    }

    const infiniteTag = await buscarInfiniteTagEfetiva();
    if (!infiniteTag || infiniteTag === 'COLE_AQUI_SUA_INFINITETAG') {
        throw new functions.https.HttpsError('failed-precondition', 'A loja ainda não configurou a InfiniteTag (pelo painel ou em functions/loja-config.js).');
    }

    const pedidoRef = admin.database().ref('pedidos/' + pedidoId);

    // O pedido é criado em duas etapas no cardápio (gera o número, depois grava os dados) —
    // então pode levar um instante pra aparecer aqui. Tenta algumas vezes antes de desistir.
    let pedido = null;
    for (let tentativa = 0; tentativa < 4 && !pedido; tentativa++) {
        if (tentativa > 0) await new Promise(resolve => setTimeout(resolve, 500));
        const pedidoSnap = await pedidoRef.once('value');
        pedido = pedidoSnap.val();
    }
    if (!pedido) {
        throw new functions.https.HttpsError('not-found', 'Pedido não encontrado.');
    }

    const totalReais = totalDoPedidoFn(pedido);
    const totalCentavos = paraCentavos(totalReais);
    if (totalCentavos <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'O valor do pedido precisa ser maior que zero.');
    }

    // Monta um item por produto do pedido, usando o nome exato cadastrado (nunca inventa)
    const items = (pedido.itens || []).map(item => ({
        quantity: item.quantidade || 1,
        price: paraCentavos(item.preco),
        description: `${item.nome || 'Item'}${item.adicionaisTexto ? ' - ' + item.adicionaisTexto : ''}`.slice(0, 200) // a API tem limite de tamanho na descrição
    }));

    if (pedido.frete && pedido.frete > 0) {
        items.push({ quantity: 1, price: paraCentavos(pedido.frete), description: 'Taxa de entrega' });
    }
    if (pedido.desconto && pedido.desconto > 0) {
        items.push({ quantity: 1, price: -paraCentavos(pedido.desconto), description: 'Desconto' });
    }

    // Confere se a soma dos itens bate exatamente com o total esperado. Se não bater
    // (por qualquer motivo — arredondamento, item sem preço, etc.), NÃO manda itemizado:
    // manda uma linha única com o valor certo, pra nunca cobrar errado do cliente.
    const somaItens = items.reduce((soma, i) => soma + (i.price * i.quantity), 0);
    const itemsFinal = (somaItens === totalCentavos)
        ? items
        : [{ quantity: 1, price: totalCentavos, description: `Pedido #${pedido.numero || ''} - ${LOJA.nome}`.trim() }];

    const baseUrl = LOJA.urlCardapio.endsWith('/') ? LOJA.urlCardapio : LOJA.urlCardapio + '/';
    const projectId = process.env.GCLOUD_PROJECT;

    const payload = {
        handle: infiniteTag,
        redirect_url: `${baseUrl}pagamento-concluido.html?pedido=${pedidoId}`,
        webhook_url: `https://us-central1-${projectId}.cloudfunctions.net/webhookInfinitePay`,
        order_nsu: pedidoId,
        items: itemsFinal
    };
    if (pedido.nome) {
        payload.customer = { name: pedido.nome };
        if (pedido.telefone) payload.customer.phone_number = pedido.telefone;
    }

    let resposta;
    try {
        const resultado = await postJson('https://api.checkout.infinitepay.io/links', payload);
        resposta = resultado.corpo;
        if (resultado.status < 200 || resultado.status >= 300 || !resposta.url) {
            console.log('InfinitePay recusou o pedido. Status:', resultado.status, '| Payload enviado:', JSON.stringify(payload), '| Resposta:', JSON.stringify(resposta));
            throw new functions.https.HttpsError('internal', 'Não foi possível criar o link de pagamento.', resposta);
        }
    } catch (err) {
        if (err instanceof functions.https.HttpsError) throw err; // não mascara o erro específico de cima
        console.log('Erro ao chamar a InfinitePay:', err.message);
        throw new functions.https.HttpsError('internal', 'Não foi possível conectar com o InfinitePay agora.', { erroOriginal: err.message });
    }

    // Marca o pedido como "aguardando pagamento", separado do status normal do pedido
    await admin.database().ref('pedidos/' + pedidoId + '/pagamento').set({
        status: 'aguardando',
        provedor: 'infinitepay',
        checkoutUrl: resposta.url,
        criadoEm: admin.database.ServerValue.TIMESTAMP
    });

    return { checkoutUrl: resposta.url };
});

/**
 * Cria um checkout de pagamento só do SINAL (uma % do valor total) pra confirmar uma
 * encomenda agendada — não cobra o pedido inteiro, só a parte configurada pela loja.
 * Guarda um prazo de pagamento; se não pagar até lá, a função programada
 * `cancelarEncomendasSemSinal` cancela o pedido sozinha.
 */
exports.criarCheckoutSinalEncomenda = functions.https.onCall(async (data, context) => {
    const pedidoId = data && data.pedidoId;
    if (!pedidoId) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltou informar o pedidoId.');
    }
    const infiniteTag = await buscarInfiniteTagEfetiva();
    if (!infiniteTag || infiniteTag === 'COLE_AQUI_SUA_INFINITETAG') {
        throw new functions.https.HttpsError('failed-precondition', 'A loja ainda não configurou a InfiniteTag (pelo painel ou em functions/loja-config.js).');
    }

    const configAgendaSnap = await admin.database().ref('configuracao/agenda').once('value');
    const configAgenda = configAgendaSnap.val() || {};
    const percentualSinal = configAgenda.percentualSinal || 0;
    const prazoPagamentoHoras = configAgenda.prazoPagamentoHoras || 24;
    if (percentualSinal <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Sinal de encomenda não está configurado.');
    }

    const pedidoRef = admin.database().ref('pedidos/' + pedidoId);
    let pedido = null;
    for (let tentativa = 0; tentativa < 4 && !pedido; tentativa++) {
        if (tentativa > 0) await new Promise(resolve => setTimeout(resolve, 500));
        const pedidoSnap = await pedidoRef.once('value');
        pedido = pedidoSnap.val();
    }
    if (!pedido) {
        throw new functions.https.HttpsError('not-found', 'Pedido não encontrado.');
    }

    const totalReais = totalDoPedidoFn(pedido);
    const valorSinalReais = Math.round(totalReais * (percentualSinal / 100) * 100) / 100;
    const valorSinalCentavos = paraCentavos(valorSinalReais);
    if (valorSinalCentavos <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'O valor do sinal precisa ser maior que zero.');
    }

    const baseUrl = LOJA.urlCardapio.endsWith('/') ? LOJA.urlCardapio : LOJA.urlCardapio + '/';
    const projectId = process.env.GCLOUD_PROJECT;

    const payload = {
        handle: infiniteTag,
        redirect_url: `${baseUrl}pagamento-concluido.html?pedido=${pedidoId}`,
        webhook_url: `https://us-central1-${projectId}.cloudfunctions.net/webhookInfinitePay`,
        order_nsu: pedidoId,
        items: [{
            quantity: 1,
            price: valorSinalCentavos,
            description: `Sinal (${percentualSinal}%) - Pedido #${pedido.numero || ''} - ${LOJA.nome}`.slice(0, 200)
        }]
    };
    if (pedido.nome) {
        payload.customer = { name: pedido.nome };
        if (pedido.telefone) payload.customer.phone_number = pedido.telefone;
    }

    let resposta;
    try {
        const resultado = await postJson('https://api.checkout.infinitepay.io/links', payload);
        resposta = resultado.corpo;
        if (resultado.status < 200 || resultado.status >= 300 || !resposta.url) {
            console.log('InfinitePay recusou o checkout de sinal. Status:', resultado.status, '| Payload:', JSON.stringify(payload), '| Resposta:', JSON.stringify(resposta));
            throw new functions.https.HttpsError('internal', 'Não foi possível criar o link de pagamento do sinal.', resposta);
        }
    } catch (err) {
        if (err instanceof functions.https.HttpsError) throw err;
        console.log('Erro ao chamar a InfinitePay (sinal):', err.message);
        throw new functions.https.HttpsError('internal', 'Não foi possível conectar com o InfinitePay agora.', { erroOriginal: err.message });
    }

    const prazoPagamento = Date.now() + (prazoPagamentoHoras * 60 * 60 * 1000);
    await admin.database().ref('pedidos/' + pedidoId + '/pagamento').set({
        status: 'aguardando',
        provedor: 'infinitepay',
        tipoPagamento: 'sinal',
        valorSinal: valorSinalReais,
        percentualSinal: percentualSinal,
        prazoPagamento: prazoPagamento,
        checkoutUrl: resposta.url,
        criadoEm: admin.database.ServerValue.TIMESTAMP
    });

    return { checkoutUrl: resposta.url, valorSinal: valorSinalReais, prazoPagamento };
});

/**
 * Roda periodicamente e cancela sozinha qualquer encomenda cujo sinal não foi pago
 * dentro do prazo configurado — evita segurar uma vaga da agenda indefinidamente
 * por um pedido que nunca vai ser confirmado.
 */
exports.cancelarEncomendasSemSinal = functions.pubsub
    .schedule('every 60 minutes')
    .onRun(async (context) => {
        const agora = Date.now();
        const pedidosSnap = await admin.database().ref('pedidos').once('value');
        const pedidos = pedidosSnap.val() || {};

        const cancelamentos = Object.entries(pedidos)
            .filter(([id, p]) =>
                p.dataEncomenda &&
                p.pagamento && p.pagamento.tipoPagamento === 'sinal' &&
                p.pagamento.status === 'aguardando' &&
                p.pagamento.prazoPagamento && p.pagamento.prazoPagamento <= agora &&
                // Só mexe em pedido ainda "em aberto" — nunca cancela algo que já foi
                // entregue, recusado ou cancelado por outro motivo (proteção extra,
                // mesmo sendo raro o pagamento ficar "aguardando" nesses casos)
                p.status !== 'cancelado' && p.status !== 'entregue' && p.status !== 'recusado'
            )
            .map(([id]) => admin.database().ref('pedidos/' + id).update({
                status: 'cancelado',
                canceladoAutomaticamente: 'Sinal da encomenda não foi pago dentro do prazo'
            }));

        await Promise.all(cancelamentos);
        return null;
    });

/**
 * Recebe a confirmação de pagamento da InfinitePay — chamada por ELES (servidor a
 * servidor), nunca pelo navegador do cliente. É aqui que o pedido realmente vira
 * "pago" de verdade; o cliente só voltar pra página de retorno NUNCA confirma nada
 * sozinho, é sempre esse webhook (ou a consulta de status) que manda a real.
 */
exports.webhookInfinitePay = functions.https.onRequest(async (req, res) => {
    try {
        const corpo = req.body || {};
        const pedidoId = corpo.order_nsu;
        const transactionNsu = corpo.transaction_nsu || null;

        if (!pedidoId) {
            console.log('Webhook da InfinitePay recebido sem order_nsu — ignorando.');
            res.status(400).send('order_nsu ausente');
            return;
        }

        const pedidoRef = admin.database().ref('pedidos/' + pedidoId);
        const pedidoSnap = await pedidoRef.once('value');
        const pedido = pedidoSnap.val();

        if (!pedido) {
            // Pode ser um order_nsu de outro projeto, ou o pedido ainda não propagou —
            // responde 400 pra InfinitePay tentar de novo mais tarde, por segurança
            console.log('Webhook recebido pra um pedido que não foi encontrado:', pedidoId);
            res.status(400).send('Pedido não encontrado');
            return;
        }

        // Proteção contra webhook duplicado: se essa MESMA transação já foi processada
        // e já está paga, não reprocessa — só confirma OK pra InfinitePay parar de reenviar
        if (pedido.pagamento && pedido.pagamento.status === 'pago' && pedido.pagamento.transactionNsu === transactionNsu) {
            console.log('Webhook duplicado (transação já processada), ignorando:', transactionNsu);
            res.status(200).send('OK (já processado)');
            return;
        }

        // Se for pagamento de SINAL de uma encomenda, o valor esperado é só o valor do
        // sinal (guardado quando o checkout foi criado), não o total do pedido inteiro
        const ehPagamentoDeSinal = pedido.pagamento && pedido.pagamento.tipoPagamento === 'sinal';
        const valorEsperadoCentavos = ehPagamentoDeSinal
            ? paraCentavos(pedido.pagamento.valorSinal)
            : paraCentavos(totalDoPedidoFn(pedido));
        const valorPagoCentavos = (corpo.paid_amount != null) ? corpo.paid_amount : corpo.amount;
        // Só é "divergente" de verdade se o cliente pagou MENOS do que devia — pagar um
        // pouco a mais é normal no cartão (taxa da maquininha repassada pro cliente),
        // e isso nunca prejudica a loja, então não precisa de alerta manual por causa disso
        const bateComOEsperado = valorPagoCentavos != null && valorPagoCentavos >= valorEsperadoCentavos;

        const metodoLegivel = corpo.capture_method === 'pix' ? 'Pix'
            : corpo.capture_method === 'credit_card' ? 'Cartão de Crédito'
            : (corpo.capture_method || 'Não informado');

        const dadosPagamento = {
            provedor: 'infinitepay',
            status: bateComOEsperado ? 'pago' : 'divergente',
            metodo: metodoLegivel,
            transactionNsu: transactionNsu,
            invoiceSlug: corpo.invoice_slug || null,
            receiptUrl: corpo.receipt_url || null,
            valorEsperado: valorEsperadoCentavos,
            valorPago: valorPagoCentavos != null ? valorPagoCentavos : null,
            parcelas: corpo.installments || 1,
            confirmadoEm: admin.database.ServerValue.TIMESTAMP
        };

        if (!bateComOEsperado) {
            console.log(`⚠️ Pagamento com valor divergente no pedido ${pedidoId}: esperado ${valorEsperadoCentavos}, recebido ${valorPagoCentavos}`);
        }

        await pedidoRef.child('pagamento').update(dadosPagamento);

        res.status(200).send('OK');
    } catch (err) {
        console.log('Erro processando webhook da InfinitePay:', err.message);
        // Responde 400 pra InfinitePay tentar reenviar depois, seguindo a recomendação deles
        res.status(400).send('Erro ao processar');
    }
});
