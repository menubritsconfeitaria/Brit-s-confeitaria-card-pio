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
