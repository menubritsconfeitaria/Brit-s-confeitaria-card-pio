/* Brit's Mãe / Kanban R5 — somente apresentação.
 * Em colunas com 2+ pedidos, ajusta a altura da lista à altura REAL do
 * primeiro card para preservar todos os itens, total e botões antes da rolagem.
 * Não consulta nem escreve dados; não modifica pedidos, status ou estoque.
 */
(() => {
    'use strict';

    function iniciar() {
        const quadro = document.getElementById('kanbanPedidos');
        if (!quadro || quadro.dataset.kanbanPrimeiroR5 === 'ativo') return;

        const listas = Array.from(quadro.querySelectorAll('.kanban-coluna > .kanban-lista'));
        if (!listas.length) return;
        quadro.dataset.kanbanPrimeiroR5 = 'ativo';

        let agendado = false;
        const observados = new Map();
        const observadorTamanho = ('ResizeObserver' in window)
            ? new ResizeObserver(() => agendar()) : null;

        function primeiroCard(lista) {
            return Array.from(lista.children).find(no => no.classList && no.classList.contains('pedido-card')) || null;
        }

        function haSegundoCard(lista, primeiro) {
            if (!primeiro) return false;
            let no = primeiro.nextElementSibling;
            while (no) {
                if (no.classList.contains('pedido-card')) return true;
                no = no.nextElementSibling;
            }
            return false;
        }

        function atualizar() {
            agendado = false;
            for (const lista of listas) {
                const primeiro = primeiroCard(lista);
                const anterior = observados.get(lista);
                if (anterior !== primeiro) {
                    if (anterior && observadorTamanho) observadorTamanho.unobserve(anterior);
                    if (primeiro && observadorTamanho) observadorTamanho.observe(primeiro);
                    observados.set(lista, primeiro);
                }

                if (!primeiro || !haSegundoCard(lista, primeiro)) {
                    lista.style.removeProperty('--brits-kanban-r5-primeiro-px');
                    continue;
                }

                // Durante login, aba oculta ou renderização inicial: não gravar zero.
                const altura = primeiro.getBoundingClientRect().height;
                if (!Number.isFinite(altura) || altura <= 0) continue;

                // Folga de 30 px após o primeiro card (separa a rolagem do rodapé).
                // O CSS da lista já soma seus paddings; medimos só a área dos cards.
                const nova = `${Math.ceil(altura + 30)}px`;
                if (lista.style.getPropertyValue('--brits-kanban-r5-primeiro-px') !== nova) {
                    lista.style.setProperty('--brits-kanban-r5-primeiro-px', nova);
                }
            }
        }

        function agendar() {
            if (agendado) return;
            agendado = true;
            requestAnimationFrame(atualizar);
        }

        // O painel substitui cards à medida que os pedidos mudam de status.
        // Observa somente adição/remoção direta, sem varrer atualizações de relógio.
        const observadorPedidos = new MutationObserver(agendar);
        for (const lista of listas) observadorPedidos.observe(lista, {childList: true});
        window.addEventListener('resize', agendar, {passive: true});
        window.addEventListener('pageshow', agendar);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) agendar();
        });
        agendar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar, {once: true});
    } else {
        iniciar();
    }
})();
