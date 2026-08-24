const auth = firebase.auth();
const db = firebase.database();

let idsRenderizados = new Set();
let primeiraCargaConcluida = false;

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

function tocarAlerta() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bip = (freq, atraso) => {
            setTimeout(() => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.45);
            }, atraso);
        };
        bip(880, 0);
        bip(1046, 260);
    } catch (e) {
        console.log('Não foi possível tocar o alerta sonoro:', e);
    }
}

// ---------- HELPERS ----------

function formatarPreco(v) {
    return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

function formatarHora(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------- MONTAGEM DO CARD DE PEDIDO ----------

function montarCardPedido(id, pedido, comAcoes) {
    const div = document.createElement('div');
    div.classList.add('pedido-card');
    if (comAcoes) {
        div.classList.add('novo');
        div.id = `pendente-${id}`; // id só usado na lista de pendentes, pra remover certinho
    }

    let itensHtml = '';
    (pedido.itens || []).forEach(item => {
        itensHtml += `<li><span>${item.quantidade}x ${item.nome}</span><span>${formatarPreco(item.preco * item.quantidade)}</span></li>`;
    });

    let enderecoHtml = '';
    if (pedido.tipoEntrega === 'entrega' && pedido.endereco) {
        const e = pedido.endereco;
        enderecoHtml = `<div class="pedido-endereco">📍 ${e.rua || ''}, ${e.numero || ''} ${e.complemento ? '(' + e.complemento + ')' : ''} — ${e.bairro || ''}, ${e.cidade || ''}/${e.estado || ''} — CEP ${e.cep || ''}</div>`;
    }

    const obsHtml = pedido.observacoes ? `<div class="pedido-obs">📝 ${pedido.observacoes}</div>` : '';

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
                <div class="pedido-cliente">${pedido.nome || 'Cliente'}</div>
                <div>
                    <span class="pedido-tag ${pedido.tipoEntrega === 'entrega' ? 'tag-entrega' : 'tag-retirada'}">${pedido.tipoEntrega === 'entrega' ? '🛵 Entrega' : '🏠 Retirada'}</span>
                    <span class="pedido-tag tag-pagamento">💰 ${pedido.formaPagamento || ''}${pedido.troco ? ' (troco p/ ' + pedido.troco + ')' : ''}</span>
                    ${tagStatus}
                </div>
            </div>
            <div class="pedido-hora">${formatarHora(pedido.timestamp)}</div>
        </div>
        <div>📞 ${pedido.telefone || ''}</div>
        <ul class="pedido-itens">${itensHtml}</ul>
        <div class="pedido-total-linha"><span>Subtotal</span><span>${formatarPreco(pedido.subtotal)}</span></div>
        ${freteLinha}
        <div class="pedido-total-linha total-final"><span>Total</span><span>${pedido.total != null ? formatarPreco(pedido.total) : 'A confirmar'}</span></div>
        ${enderecoHtml}
        ${obsHtml}
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

        <input type="text" id="prodCategoria_${id}" value="${produto.categoria || ''}" placeholder="Categoria">

        <label class="campo-label">Sabores/opções (digite cada um separado por VÍRGULA — deixe em branco se não tiver)</label>
        <input type="text" id="prodVariantes_${id}" value="${(produto.variantes || []).join(', ')}" placeholder="Ex: Chocolate, Morango, Baunilha" oninput="atualizarPreviaVariantes('${id}')">
        <div id="previaVariantes_${id}" class="previa-variantes"></div>

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

function escutarProdutos() {
    db.ref('produtos').on('value', snap => {
        const lista = document.getElementById('produtosAdminList');
        const btnImportar = document.getElementById('btnImportarDados');

        const val = snap.val() || {};
        const itens = Object.entries(val).map(([id, produto]) => ({ id, produto }));
        itens.sort((a, b) => (a.produto.criadoEm || 0) - (b.produto.criadoEm || 0));

        categoriasConhecidas = [...new Set(itens.map(i => i.produto.categoria).filter(Boolean))];
        produtosConhecidos = itens.map(i => i.produto.nome).filter(Boolean);
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

function salvarProduto(id) {
    const nome = document.getElementById('prodNome_' + id).value.trim();
    const descricao = document.getElementById('prodDesc_' + id).value.trim();
    const preco = paraNumero(document.getElementById('prodPreco_' + id).value);
    const precoOriginal = paraNumero(document.getElementById('prodPrecoOriginal_' + id).value);
    const imagensTexto = document.getElementById('prodImagens_' + id).value.trim();
    const categoria = document.getElementById('prodCategoria_' + id).value.trim();
    const disponivel = document.getElementById('prodDisp_' + id).checked;
    const variantesTexto = document.getElementById('prodVariantes_' + id).value.trim();

    const imagens = imagensTexto ? imagensTexto.split(',').map(v => v.trim()).filter(v => v.length > 0) : [];

    if (!nome || isNaN(preco) || imagens.length === 0 || !categoria) {
        alert('Preencha nome, preço, ao menos uma foto e categoria antes de salvar.');
        return;
    }

    const dados = { nome, descricao, preco, imagem: imagens[0], imagens, categoria, disponivel, precoOriginal: null, variantes: null };

    if (!isNaN(precoOriginal) && precoOriginal > preco) {
        dados.precoOriginal = precoOriginal;
    }

    if (variantesTexto) {
        dados.variantes = variantesTexto.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }

    db.ref('produtos/' + id).update(dados).catch(err => alert('Erro ao salvar produto: ' + err.message));
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

        // Numera os pedidos na ordem cronológica do período, antes de aplicar os filtros de exibição
        // (assim o número do pedido não muda dependendo do filtro escolhido)
        pedidosDoDia.forEach((p, i) => { p._numero = i + 1; });

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
            <h2>Brit's Confeitaria — Fechamento Diário de Pedidos</h2>
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
            <button class="btn-secondary" onclick="window.print()">🖨️ Imprimir relatório</button>
        </div>
    `;
}

function montarCardPedidoFechamento(p) {
    const statusLabel = STATUS_LABELS_FECHAMENTO[p.status] || p.status;
    const tipoLabel = p.tipoEntrega === 'entrega' ? '🛵 Delivery' : (p.tipoEntrega === 'retirada' ? '🏪 Retirada no local' : 'Não informado');
    const itensHtml = (p.itens || []).map(item =>
        `<div class="pedido-total-linha"><span>${item.quantidade}x ${item.nome}</span><span>${formatarPreco((item.preco || 0) * item.quantidade)}</span></div>`
    ).join('');
    const lancado = !!p.lancado;

    return `
    <div class="fechamento-pedido-card">
        <div class="fechamento-pedido-topo">
            <strong>🛒 Pedido #${String(p._numero).padStart(3, '0')}</strong>
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
        <p class="dica-secao"><strong>Pagamento:</strong> ${p.formaPagamento || 'Não informado'}</p>
        ${p.observacoes ? `<p class="dica-secao"><strong>Observações:</strong> ${p.observacoes}</p>` : ''}
        ${p.tipoEntrega === 'entrega' ? `<p class="dica-secao"><strong>Endereço:</strong> ${formatarEnderecoResumo(p.endereco)}</p>` : ''}

        <div class="fechamento-pedido-acoes">
            <button class="btn-secondary" onclick="copiarPedidoIndividual('${p.id}')">📋 Copiar pedido</button>
            <button class="btn-lancado ${lancado ? 'lancado' : ''}" id="btn-lancado-${p.id}" onclick="alternarLancado('${p.id}')">${lancado ? '🟢 Lançado' : '🟠 Pendente de lançamento'}</button>
        </div>
    </div>`;
}

function montarTextoPedido(p) {
    const statusLabel = STATUS_LABELS_FECHAMENTO[p.status] || p.status;
    const tipoLabel = p.tipoEntrega === 'entrega' ? 'Delivery' : (p.tipoEntrega === 'retirada' ? 'Retirada no local' : 'Não informado');
    let texto = `PEDIDO #${String(p._numero).padStart(3, '0')}\n\n`;
    texto += `Cliente: ${p.nome || 'Não informado'}\n`;
    texto += `Horário: ${formatarHorario(p.timestamp)}\n`;
    texto += `Status: ${statusLabel}\n`;
    texto += `Tipo: ${tipoLabel}\n\n`;
    texto += `Itens:\n`;
    (p.itens || []).forEach(item => { texto += `${item.quantidade}x ${item.nome}\n`; });
    texto += `\nSubtotal: ${formatarPreco(p.subtotal || 0)}\n`;
    texto += `Desconto: ${formatarPreco(p.desconto || 0)}\n`;
    texto += `Frete: ${formatarPreco(p.frete || 0)}\n`;
    texto += `Total: ${formatarPreco(totalDoPedido(p))}\n\n`;
    texto += `Forma de pagamento: ${p.formaPagamento || 'Não informado'}\n`;
    if (p.observacoes) texto += `\nObservação: ${p.observacoes}\n`;
    if (p.tipoEntrega === 'entrega') texto += `\nEndereço: ${formatarEnderecoResumo(p.endereco)}\n`;
    return texto;
}

function copiarPedidoIndividual(id) {
    const p = fechamentoPedidosAtuais[id];
    if (!p) return;
    copiarTexto(montarTextoPedido(p));
}

function copiarTodosPedidos(dataFormatada) {
    const todos = Object.values(fechamentoPedidosAtuais).sort((a, b) => a._numero - b._numero);
    if (todos.length === 0) return;

    const validos = todos.filter(p => p.status !== 'recusado');
    const totalDia = validos.reduce((s, p) => s + totalDoPedido(p), 0);

    let texto = `📋 FECHAMENTO DE PEDIDOS\nBRIT'S CONFEITARIA\nData: ${dataFormatada}\n\n--------------------------------\n\n`;
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

    // Histórico: últimos 15 pedidos (qualquer status), só pra consulta.
    // Usa a ordenação padrão por chave (o Firebase já cria as chaves em ordem cronológica sozinho),
    // em vez de orderByChild('timestamp'), que exigiria um índice configurado na regra pra ser confiável.
    db.ref('pedidos').limitToLast(15).on('value', snapshot => {
        const listaHistoricoEl = document.getElementById('listaHistorico');
        const itens = [];
        snapshot.forEach(child => itens.push({ id: child.key, pedido: child.val() }));
        itens.reverse();
        listaHistoricoEl.innerHTML = '';
        if (itens.length === 0) {
            listaHistoricoEl.innerHTML = '<p class="vazio">Ainda não há pedidos no histórico.</p>';
            return;
        }
        itens.forEach(({ id, pedido }) => {
            listaHistoricoEl.appendChild(montarCardPedido(id, pedido, false));
        });
    });
}
