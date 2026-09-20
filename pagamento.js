// PASSO 14 — o módulo financeiro deixa de acessar diretamente estado/UI do script.js.
// As ações de interface, carrinho, token e limpeza de pedido são recebidas por parâmetro.
// Firebase/InfinitePay continuam aqui porque fazem parte da responsabilidade financeira.
function concluirCheckoutPedidoNovo(resultado, acoesPagamentoCheckout) {
    acoesPagamentoCheckout.concluirCheckout(resultado.data.checkoutUrl);
}

async function limparPedidoFalhoPagamento(pedidoId, acoesPagamentoCheckout) {
    try {
        await acoesPagamentoCheckout.limparPedidoFalho(pedidoId);
    } catch (e) {
        // Segue mesmo se a limpeza falhar — mesmo comportamento já validado antes.
    }
}

async function tratarFalhaCheckoutPedidoNovo({
    err,
    pedidoId,
    mensagemLog,
    mensagemCliente,
    textoBotao,
    acoesPagamentoCheckout
}) {
    console.log(mensagemLog, err.message, '| Detalhes:', JSON.stringify(err.details));
    await limparPedidoFalhoPagamento(pedidoId, acoesPagamentoCheckout);
    acoesPagamentoCheckout.avisar(mensagemCliente);
    acoesPagamentoCheckout.restaurarBotao(textoBotao);
}

async function processarPagamentoSinalEncomenda(pedidoId, promessaSalvo, acoesPagamentoCheckout) {
        if (!pedidoId) {
            acoesPagamentoCheckout.avisar('Não foi possível criar o pedido agora. Tente novamente em instantes.');
            return;
        }
        acoesPagamentoCheckout.prepararBotao('Preparando pagamento do sinal...');
        try {
            await promessaSalvo;
            const criarCheckoutSinal = firebase.functions().httpsCallable('criarCheckoutSinalEncomenda');
            const token = acoesPagamentoCheckout.obterToken();
            const resultado = await criarCheckoutSinal({ pedidoId, token });
            concluirCheckoutPedidoNovo(resultado, acoesPagamentoCheckout);
        } catch (err) {
            await tratarFalhaCheckoutPedidoNovo({
                err,
                pedidoId,
                mensagemLog: 'Não foi possível criar o checkout do sinal:',
                mensagemCliente: 'Não foi possível iniciar o pagamento do sinal. Tente novamente.',
                textoBotao: 'Finalizar Compra',
                acoesPagamentoCheckout
            });
        }
        return;
}

async function processarPagamentoOnline(pedidoId, promessaSalvo, acoesPagamentoCheckout) {
        if (!pedidoId) {
            acoesPagamentoCheckout.avisar('Não foi possível criar o pedido agora. Tente novamente em instantes.');
            return;
        }
        acoesPagamentoCheckout.prepararBotao('Preparando pagamento...');
        try {
            // Espera o pedido REALMENTE terminar de ser escrito no banco antes de pedir
            // pra Cloud Function ler ele — senão, ela pode chegar cedo demais e não achar nada
            await promessaSalvo;
            const criarCheckout = firebase.functions().httpsCallable('criarCheckoutInfinitePay');
            const token = acoesPagamentoCheckout.obterToken();
            const resultado = await criarCheckout({ pedidoId, token });
            concluirCheckoutPedidoNovo(resultado, acoesPagamentoCheckout);
        } catch (err) {
            await tratarFalhaCheckoutPedidoNovo({
                err,
                pedidoId,
                mensagemLog: 'Não foi possível criar o checkout de pagamento:',
                mensagemCliente: 'Não foi possível iniciar o pagamento. Tente novamente.',
                textoBotao: '🌐 Pagar Agora',
                acoesPagamentoCheckout
            });
        }
        return;
}

async function processarPagamentoRestanteEncomenda(pedidoId, token) {
    if (!pedidoId) throw new Error('Pedido inválido para pagamento do restante.');
    if (!token) throw new Error('Aparelho inválido para pagamento do restante.');

    const criarCheckout = firebase.functions().httpsCallable('criarCheckoutRestanteEncomenda');
    const resultado = await criarCheckout({ pedidoId, token });

    if (resultado.data && resultado.data.checkoutUrl) {
        window.location.href = resultado.data.checkoutUrl;
        return;
    }

    throw new Error('Não recebi o link de pagamento.');
}

async function processarPagamentoCheckout({
    contextoCheckout,
    pedidoId,
    promessaSalvo,
    acoesPagamentoCheckout
}) {
    // PASSO 15 — pagamento.js passa a ser o único responsável por decidir
    // qual caminho financeiro o checkout deve seguir. O script.js só entrega
    // o contexto já consolidado e recebe de volta se o pagamento foi processado.
    const sinalEncomendaSelecionado = contextoCheckout.encomenda.querAgendar
        && contextoCheckout.encomenda.percentualSinal > 0;

    const pagamentoOnlineSelecionado = contextoCheckout.pagamento.onlineAtivo
        && !contextoCheckout.encomenda.querAgendar
        && (contextoCheckout.pagamento.forma === 'Pix' || contextoCheckout.pagamento.forma === 'Cartão');

    // Se é uma encomenda agendada E a loja exige sinal de confirmação, o fluxo cobra só
    // uma % do valor (nunca o pedido inteiro) — funciona independente da forma de
    // pagamento escolhida, já que o sinal é sempre via Pix/Cartão pra confirmar de verdade
    if (sinalEncomendaSelecionado) {
        await processarPagamentoSinalEncomenda(pedidoId, promessaSalvo, acoesPagamentoCheckout);
        return true;
    }

    // Se o cliente escolheu pagar online, o fluxo é diferente: em vez de ir pro WhatsApp,
    // manda pro checkout da InfinitePay (Pix ou Cartão), e só confirma o pedido de verdade
    // quando o pagamento realmente cair (isso quem confirma é o Webhook, não essa tela)
    if (pagamentoOnlineSelecionado) {
        await processarPagamentoOnline(pedidoId, promessaSalvo, acoesPagamentoCheckout);
        return true;
    }

    return false;
}
