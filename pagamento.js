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
            registrarEventoConversaoFront('checkout');
            carrinho = [];
            salvarCarrinho();
            atualizarCarrinhoHTML();
            limparFormularioEndereco();
            window.location.href = resultado.data.checkoutUrl;
        } catch (err) {
            console.log('Não foi possível criar o checkout do sinal:', err.message, '| Detalhes:', JSON.stringify(err.details));
            try {
                const limparPedido = firebase.functions().httpsCallable('limparPedidoFalhoDeCheckout');
                await limparPedido({ pedidoId, token: obterTokenCliente() });
            } catch (e2) { /* segue mesmo se não conseguir limpar */ }
            alert('Não foi possível iniciar o pagamento do sinal. Tente novamente.');
            botaoFinalizarCompra.disabled = false;
            botaoFinalizarCompra.textContent = 'Finalizar Compra';
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
            registrarEventoConversaoFront('checkout');
            carrinho = [];
            salvarCarrinho();
            atualizarCarrinhoHTML();
            limparFormularioEndereco();
            window.location.href = resultado.data.checkoutUrl;
        } catch (err) {
            console.log('Não foi possível criar o checkout de pagamento:', err.message, '| Detalhes:', JSON.stringify(err.details));
            // Apaga o pedido malsucedido via Cloud Function — o cliente (sem login)
            // não tem permissão de apagar direto, só criar. Sem isso, cada nova
            // tentativa ficava empilhando pedidos duplicados no painel
            try {
                const limparPedido = firebase.functions().httpsCallable('limparPedidoFalhoDeCheckout');
                await limparPedido({ pedidoId, token: obterTokenCliente() });
            } catch (e2) { /* segue mesmo se não conseguir limpar */ }
            alert('Não foi possível iniciar o pagamento. Tente novamente.');
            botaoFinalizarCompra.disabled = false;
            botaoFinalizarCompra.textContent = '🌐 Pagar Agora';
        }
        return;
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
