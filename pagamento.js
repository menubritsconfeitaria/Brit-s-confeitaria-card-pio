// PASSO 13 — tratamento comum dos checkouts de pedido novo.
// Mantém exatamente as mesmas ações que já existiam nos fluxos de sinal e pagamento
// online, mas concentra sucesso, limpeza de falha e restauração da interface aqui.
function concluirCheckoutPedidoNovo(resultado) {
    registrarEventoConversaoFront('checkout');
    carrinho = [];
    salvarCarrinho();
    atualizarCarrinhoHTML();
    limparFormularioEndereco();
    window.location.href = resultado.data.checkoutUrl;
}

async function limparPedidoFalhoPagamento(pedidoId) {
    try {
        const limparPedido = firebase.functions().httpsCallable('limparPedidoFalhoDeCheckout');
        await limparPedido({ pedidoId, token: obterTokenCliente() });
    } catch (e) {
        // Segue mesmo se a limpeza falhar — mesmo comportamento já validado antes.
    }
}

async function tratarFalhaCheckoutPedidoNovo({
    err,
    pedidoId,
    mensagemLog,
    mensagemCliente,
    textoBotao
}) {
    console.log(mensagemLog, err.message, '| Detalhes:', JSON.stringify(err.details));
    await limparPedidoFalhoPagamento(pedidoId);
    alert(mensagemCliente);
    botaoFinalizarCompra.disabled = false;
    botaoFinalizarCompra.textContent = textoBotao;
}

async function processarPagamentoSinalEncomenda(pedidoId, promessaSalvo) {
        if (!pedidoId) {
            alert('Não foi possível criar o pedido agora. Tente novamente em instantes.');
            return;
        }
        botaoFinalizarCompra.disabled = true;
        botaoFinalizarCompra.textContent = 'Preparando pagamento do sinal...';
        try {
            await promessaSalvo;
            const criarCheckoutSinal = firebase.functions().httpsCallable('criarCheckoutSinalEncomenda');
            const resultado = await criarCheckoutSinal({ pedidoId });
            concluirCheckoutPedidoNovo(resultado);
        } catch (err) {
            await tratarFalhaCheckoutPedidoNovo({
                err,
                pedidoId,
                mensagemLog: 'Não foi possível criar o checkout do sinal:',
                mensagemCliente: 'Não foi possível iniciar o pagamento do sinal. Tente novamente.',
                textoBotao: 'Finalizar Compra'
            });
        }
        return;
}

async function processarPagamentoOnline(pedidoId, promessaSalvo) {
        if (!pedidoId) {
            alert('Não foi possível criar o pedido agora. Tente novamente em instantes.');
            return;
        }
        botaoFinalizarCompra.disabled = true;
        botaoFinalizarCompra.textContent = 'Preparando pagamento...';
        try {
            // Espera o pedido REALMENTE terminar de ser escrito no banco antes de pedir
            // pra Cloud Function ler ele — senão, ela pode chegar cedo demais e não achar nada
            await promessaSalvo;
            const criarCheckout = firebase.functions().httpsCallable('criarCheckoutInfinitePay');
            const resultado = await criarCheckout({ pedidoId });
            concluirCheckoutPedidoNovo(resultado);
        } catch (err) {
            await tratarFalhaCheckoutPedidoNovo({
                err,
                pedidoId,
                mensagemLog: 'Não foi possível criar o checkout de pagamento:',
                mensagemCliente: 'Não foi possível iniciar o pagamento. Tente novamente.',
                textoBotao: '🌐 Pagar Agora'
            });
        }
        return;
}

async function processarPagamentoRestanteEncomenda(pedidoId) {
    if (!pedidoId) throw new Error('Pedido inválido para pagamento do restante.');

    const criarCheckout = firebase.functions().httpsCallable('criarCheckoutRestanteEncomenda');
    const resultado = await criarCheckout({ pedidoId });

    if (resultado.data && resultado.data.checkoutUrl) {
        window.location.href = resultado.data.checkoutUrl;
        return;
    }

    throw new Error('Não recebi o link de pagamento.');
}

async function processarPagamentoCheckout({
    sinalEncomendaSelecionado,
    pagamentoOnlineSelecionado,
    pedidoId,
    promessaSalvo
}) {
    // Se é uma encomenda agendada E a loja exige sinal de confirmação, o fluxo cobra só
    // uma % do valor (nunca o pedido inteiro) — funciona independente da forma de
    // pagamento escolhida, já que o sinal é sempre via Pix/Cartão pra confirmar de verdade
    if (sinalEncomendaSelecionado) {
        await processarPagamentoSinalEncomenda(pedidoId, promessaSalvo);
        return true;
    }

    // Se o cliente escolheu pagar online, o fluxo é diferente: em vez de ir pro WhatsApp,
    // manda pro checkout da InfinitePay (Pix ou Cartão), e só confirma o pedido de verdade
    // quando o pagamento realmente cair (isso quem confirma é o Webhook, não essa tela)
    if (pagamentoOnlineSelecionado) {
        await processarPagamentoOnline(pedidoId, promessaSalvo);
        return true;
    }

    return false;
}
