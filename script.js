console.log("O script.js foi carregado com sucesso!");

// Produtos e cupons agora vêm do Firebase (gerenciados pelo painel admin.html).
// Começam vazios e são preenchidos assim que a função escutarProdutos()/escutarCupons() carregar os dados.
let produtos = [];

// Carrega o carrinho do Local Storage ou inicializa como vazio
let carrinho = JSON.parse(localStorage.getItem('carrinhoBritS')) || [];

/* ===================================================================
   TABELA DE BAIRROS E DISTÂNCIA EM KM ATÉ A CONFEITARIA
   (mesma tabela usada no catálogo de referência)
   =================================================================== */
const bairrosEntrega = {
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
const valorPorKm = 0.70;

// Estado atual do cálculo de frete (retirada é a opção padrão, então começa sem frete)
let freteAtual = 0;
let freteConfirmado = true;

// Referências aos elementos HTML
const listaProdutosDiv = document.querySelector('.lista-produtos');
const carrinhoItensDiv = document.querySelector('.carrinho-itens');
const subtotalCarrinhoSpan = document.getElementById('subtotal-carrinho');
const freteCarrinhoSpan = document.getElementById('frete-carrinho');
const totalCarrinhoSpan = document.getElementById('total-carrinho');
const botaoFinalizarCompra = document.querySelector('.finalizar-compra');
const categoriasNav = document.getElementById('categorias-nav'); // NOVO: Referência para a navegação de categorias
const infoFreteDiv = document.getElementById('infoFrete');

// Referências aos campos do formulário de endereço
const nomeClienteInput = document.getElementById('nomeCliente');
const telefoneClienteInput = document.getElementById('telefoneCliente');
const ruaClienteInput = document.getElementById('ruaCliente');
const numeroClienteInput = document.getElementById('numeroCliente');
const complementoClienteInput = document.getElementById('complementoCliente');
const bairroClienteInput = document.getElementById('bairroCliente');
const cidadeClienteInput = document.getElementById('cidadeCliente');
const estadoClienteInput = document.getElementById('estadoCliente');
const cepClienteInput = document.getElementById('cepCliente');
const clienteTrocoInput = document.getElementById('clienteTroco');
const clienteObsInput = document.getElementById('clienteObs');
const areaEntregaDiv = document.getElementById('areaEntrega');
const areaTrocoDiv = document.getElementById('areaTroco');

// Variável para armazenar a categoria atualmente selecionada
let categoriaAtual = 'Todos';

// Estado de como o cliente quer receber o pedido e a forma de pagamento
let tipoEntregaAtual = 'retirada';
let formaPagamentoAtual = 'Pix';

// Guarda a lista de imagens de cada carrossel (preenchido a cada renderizarProdutos())
let carrosselImagensRegistro = {};

// Visualizador de foto em tela cheia (lightbox)
let lightboxImagens = [];
let lightboxIndiceAtual = 0;

function abrirLightbox(imagens, indiceInicial) {
    if (!imagens || imagens.length === 0) return;
    lightboxImagens = imagens;
    lightboxIndiceAtual = indiceInicial || 0;
    atualizarLightbox();
    const lb = document.getElementById('lightboxImagem');
    if (lb) lb.style.display = 'flex';
}

function atualizarLightbox() {
    const img = document.getElementById('lightboxImg');
    if (img) img.src = lightboxImagens[lightboxIndiceAtual];
    document.querySelectorAll('.lightbox-seta').forEach(seta => {
        seta.style.display = lightboxImagens.length > 1 ? 'flex' : 'none';
    });
}

function lightboxNavegar(delta) {
    lightboxIndiceAtual = (lightboxIndiceAtual + delta + lightboxImagens.length) % lightboxImagens.length;
    atualizarLightbox();
}

function fecharLightbox() {
    const lb = document.getElementById('lightboxImagem');
    if (lb) lb.style.display = 'none';
}

// Ordem de categorias definida pelo dono da loja no painel (opcional)
let ordemCategoriasSalva = [];

// Coloca as categorias na ordem salva pelo painel; as que não foram listadas lá vão depois, na ordem natural
function ordenarCategorias(categorias) {
    const comOrdem = [];
    const semOrdem = [];
    categorias.forEach(cat => {
        const posicao = ordemCategoriasSalva.indexOf(cat);
        if (posicao === -1) semOrdem.push(cat);
        else comOrdem.push({ cat, posicao });
    });
    comOrdem.sort((a, b) => a.posicao - b.posicao);
    return [...comOrdem.map(c => c.cat), ...semOrdem];
}

function escutarOrdemCategorias() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    firebase.database().ref('configuracao/ordemCategorias').on('value', snap => {
        ordemCategoriasSalva = snap.val() || [];
        renderizarCategorias();
        renderizarProdutos();
    });
}

/* ===================================================================
   Os cupons de desconto agora são gerenciados pelo painel (admin.html),
   dentro da seção "🎟️ Cupons de desconto". Aqui só carregamos o que
   estiver cadastrado no Firebase.
   =================================================================== */
let cupons = {};

let cupomAplicado = null; // { codigo, tipo, valor }

function calcularDesconto(subtotal) {
    let desconto = 0;
    if (cupomAplicado) {
        if (cupomAplicado.tipo === 'percentual') desconto += subtotal * (cupomAplicado.valor / 100);
        else if (cupomAplicado.tipo === 'fixo') desconto += cupomAplicado.valor;
    }
    if (recompensaSelecionada && recompensaSelecionada.tipo === 'desconto') {
        desconto += recompensaSelecionada.valor;
    }
    return Math.min(desconto, subtotal);
}

function aplicarCupom() {
    const input = document.getElementById('cupomInput');
    const msg = document.getElementById('cupomMensagem');
    const codigo = input.value.trim().toUpperCase();

    if (!codigo) {
        msg.textContent = 'Digite um cupom.';
        msg.className = 'cupom-mensagem erro';
        return;
    }

    const cupom = cupons[codigo];
    if (!cupom) {
        cupomAplicado = null;
        msg.textContent = 'Cupom inválido.';
        msg.className = 'cupom-mensagem erro';
        atualizarCarrinhoHTML();
        return;
    }

    cupomAplicado = { codigo, ...cupom };
    msg.textContent = '✅ Cupom aplicado!';
    msg.className = 'cupom-mensagem sucesso';
    atualizarCarrinhoHTML();
}

// Salva o pedido no Firebase para aparecer em tempo real no painel da loja (admin.html)
// Horário padrão de funcionamento, usado enquanto a loja não configura nada no painel.
// Índice: 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
const horariosPadrao = [
    { aberto: true, abre: '09:00', fecha: '13:00' }, // Domingo
    { aberto: true, abre: '10:00', fecha: '18:00' }, // Segunda
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Terça
    { aberto: true, abre: '09:00', fecha: '18:00' }, // Quarta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Quinta
    { aberto: true, abre: '09:00', fecha: '21:00' }, // Sexta
    { aberto: true, abre: '09:00', fecha: '16:00' }  // Sábado
];

let lojaAbertaAtual = true;

function horarioParaMinutos(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// Calcula se a loja está aberta agora, considerando o horário do dia da semana atual
function calcularAbertoPorHorario(horarios) {
    const agora = new Date();
    const diaSemana = agora.getDay();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const diaConfig = (horarios && horarios[diaSemana]) || horariosPadrao[diaSemana];

    if (!diaConfig || !diaConfig.aberto) return false;

    const abre = horarioParaMinutos(diaConfig.abre);
    const fecha = horarioParaMinutos(diaConfig.fecha);
    return minutosAgora >= abre && minutosAgora < fecha;
}

// Atualiza a faixa de status da loja e bloqueia/libera o botão de finalizar compra
function atualizarStatusLoja(config) {
    const banner = document.getElementById('statusLojaBanner');
    const texto = document.getElementById('statusLojaTexto');
    if (!banner || !texto) return;

    const horarios = config && config.horarios;
    const modoManual = config && config.modoManual;

    let aberta;
    if (modoManual === 'aberto') aberta = true;
    else if (modoManual === 'fechado') aberta = false;
    else aberta = calcularAbertoPorHorario(horarios);

    lojaAbertaAtual = aberta;

    banner.classList.remove('loja-aberta', 'loja-fechada');
    if (aberta) {
        banner.classList.add('loja-aberta');
        texto.textContent = '🟢 Estamos abertos! Pode fazer seu pedido.';
        if (botaoFinalizarCompra) {
            botaoFinalizarCompra.disabled = false;
            botaoFinalizarCompra.textContent = 'Finalizar Compra';
        }
    } else {
        banner.classList.add('loja-fechada');
        texto.textContent = '🔴 Estamos fechados no momento. Você pode ver o cardápio, mas os pedidos abrem no nosso próximo horário de funcionamento.';
        if (botaoFinalizarCompra) {
            botaoFinalizarCompra.disabled = true;
            botaoFinalizarCompra.textContent = 'Loja fechada no momento';
        }
    }

    ajustarPosicaoCategorias();
}

// Empurra a barra de categorias pra baixo da faixa "Aberto/Fechado", já que as duas ficam grudadas no topo.
// Mede a altura de verdade (o texto pode quebrar em 2 linhas em telas menores) em vez de usar um valor fixo.
function ajustarPosicaoCategorias() {
    const banner = document.getElementById('statusLojaBanner');
    const nav = document.querySelector('.categorias');
    if (!banner || !nav) return;
    nav.style.top = banner.offsetHeight + 'px';
}

window.addEventListener('resize', ajustarPosicaoCategorias);

// Escuta o status da loja em tempo real e reavalia a cada minuto (pra fechar/abrir sozinho no horário)
function escutarStatusLoja() {
    ajustarPosicaoCategorias(); // já deixa encaixado certo com o texto "Verificando..." inicial
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
        atualizarStatusLoja(null);
        return;
    }
    firebase.database().ref('configuracao/loja').on('value', snap => {
        atualizarStatusLoja(snap.val());
    });
    setInterval(() => {
        firebase.database().ref('configuracao/loja').once('value').then(snap => atualizarStatusLoja(snap.val()));
    }, 60000);
}

// Carrega o cardápio do Firebase e re-renderiza sozinho sempre que algo mudar no painel
function escutarProdutos() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
        listaProdutosDiv.innerHTML = '<p class="cardapio-erro">Não foi possível carregar o cardápio agora. Recarregue a página em instantes.</p>';
        return;
    }
    firebase.database().ref('produtos').on('value', snap => {
        const val = snap.val() || {};
        const lista = Object.values(val).filter(p => p && p.nome);
        lista.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
        produtos = lista;
        sincronizarPrecosCarrinho();
        renderizarCategorias();
        renderizarProdutos();
        atualizarCarrinhoHTML();
        atualizarAvisoOferta();
    });
}

// Mostra um aviso chamativo quando algum produto disponível está em oferta
function atualizarAvisoOferta() {
    const banner = document.getElementById('ofertaBanner');
    if (!banner) return;
    const temOferta = produtos.some(p => p.disponivel && p.precoOriginal && p.precoOriginal > p.preco);
    banner.style.display = (temOferta && !ofertaBannerFechadoPeloUsuario) ? 'flex' : 'none';
}

let ofertaBannerFechadoPeloUsuario = false;

function fecharAvisoOferta() {
    ofertaBannerFechadoPeloUsuario = true;
    const banner = document.getElementById('ofertaBanner');
    if (banner) banner.style.display = 'none';
}

// Carrega os cupons de desconto cadastrados no painel
function escutarCupons() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    firebase.database().ref('cupons').on('value', snap => {
        cupons = snap.val() || {};
    });
}

function salvarPedidoNoPainel(dadosPedido) {
    try {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
            console.log('Firebase indisponível — pedido seguirá só pelo WhatsApp.');
            return null;
        }
        const novoPedidoRef = firebase.database().ref('pedidos').push();
        novoPedidoRef.set({
            ...dadosPedido,
            status: 'pendente',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => console.log('Não foi possível salvar o pedido no painel:', err));
        return novoPedidoRef.key;
    } catch (err) {
        console.log('Não foi possível salvar o pedido no painel:', err);
        return null;
    }
}

// Acompanha em tempo real o status (pendente/aceito/recusado) de um pedido pro cliente
let refStatusPedidoAtual = null;

function mostrarStatusPedido(pedidoId) {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    const banner = document.getElementById('statusPedidoBanner');
    const texto = document.getElementById('statusPedidoTexto');
    if (!banner || !texto) return;

    if (refStatusPedidoAtual) {
        refStatusPedidoAtual.off();
    }

    const ref = firebase.database().ref('pedidos/' + pedidoId + '/status');
    refStatusPedidoAtual = ref;

    ref.on('value', snap => {
        const status = snap.val();
        if (!status) return;
        banner.classList.remove('status-pendente', 'status-aceito', 'status-recusado', 'status-em_rota', 'status-entregue');
        if (status === 'pendente') {
            banner.classList.add('status-pendente');
            texto.textContent = '🕒 Pedido enviado! Aguardando a confirmação da loja...';
        } else if (status === 'aceito') {
            banner.classList.add('status-aceito');
            texto.textContent = '✅ Seu pedido foi aceito e já está sendo preparado!';
        } else if (status === 'em_rota') {
            banner.classList.add('status-em_rota');
            texto.textContent = '🛵 Seu pedido saiu para entrega!';
        } else if (status === 'entregue') {
            banner.classList.add('status-entregue');
            texto.textContent = '🎉 Pedido entregue! Seus pontos do Clube Brit\'s já foram creditados. Bom apetite!';
        } else if (status === 'recusado') {
            banner.classList.add('status-recusado');
            texto.textContent = '❌ Seu pedido foi recusado. Fale com a gente pelo WhatsApp para mais detalhes.';
        }
        banner.style.display = 'flex';
    });
}

function fecharStatusPedido() {
    const banner = document.getElementById('statusPedidoBanner');
    if (banner) banner.style.display = 'none';
    if (refStatusPedidoAtual) {
        refStatusPedidoAtual.off();
        refStatusPedidoAtual = null;
    }
    localStorage.removeItem('ultimoPedidoBritS');
}

// Se o cliente tem um pedido recente rastreado (últimas 48h), volta a mostrar o status dele
function verificarPedidoSalvo() {
    try {
        const dados = JSON.parse(localStorage.getItem('ultimoPedidoBritS'));
        if (dados && dados.id) {
            const QUARENTA_OITO_HORAS = 48 * 60 * 60 * 1000;
            if (Date.now() - dados.criadoEm < QUARENTA_OITO_HORAS) {
                mostrarStatusPedido(dados.id);
            } else {
                localStorage.removeItem('ultimoPedidoBritS');
            }
        }
    } catch (e) {
        // localStorage vazio ou inválido, ignora
    }
}

// Preenche o formulário com os dados salvos da última compra (nome, telefone, endereço)
function carregarDadosClienteSalvos() {
    try {
        const dados = JSON.parse(localStorage.getItem('dadosClienteBritS'));
        if (!dados) return;
        if (dados.nome) nomeClienteInput.value = dados.nome;
        if (dados.telefone) telefoneClienteInput.value = dados.telefone;
        if (dados.rua) ruaClienteInput.value = dados.rua;
        if (dados.numero) numeroClienteInput.value = dados.numero;
        if (dados.complemento) complementoClienteInput.value = dados.complemento;
        if (dados.bairro) bairroClienteInput.value = dados.bairro;
        if (dados.cidade) cidadeClienteInput.value = dados.cidade;
        if (dados.estado) estadoClienteInput.value = dados.estado;
        if (dados.cep) cepClienteInput.value = dados.cep;
        if (dados.tipoEntrega === 'entrega') {
            selecionarTipoEntrega('entrega');
            if (dados.cep) calcularFrete(); // recalcula o frete, o valor pode ter mudado
        }
    } catch (e) {
        // localStorage vazio ou inválido, ignora
    }
}


// Função para salvar o carrinho no Local Storage
function salvarCarrinho() {
    localStorage.setItem('carrinhoBritS', JSON.stringify(carrinho));
}

// Alterna entre "Retirar no local" e "Entrega", mostrando/escondendo o endereço
function selecionarTipoEntrega(tipo) {
    tipoEntregaAtual = tipo;
    document.getElementById('btnRetirada').classList.toggle('selecionado', tipo === 'retirada');
    document.getElementById('btnEntrega').classList.toggle('selecionado', tipo === 'entrega');
    areaEntregaDiv.style.display = tipo === 'entrega' ? 'block' : 'none';

    if (tipo === 'retirada') {
        freteAtual = 0;
        freteConfirmado = true; // não há entrega, então não há valor "a confirmar"
        infoFreteDiv.style.display = 'none';
    } else if (!cepClienteInput.value) {
        freteConfirmado = false;
    }
    atualizarCarrinhoHTML();
}

// Alterna a forma de pagamento e mostra o campo de troco quando for "Dinheiro"
function selecionarPagamento(forma) {
    formaPagamentoAtual = forma;
    document.getElementById('btnPix').classList.toggle('selecionado', forma === 'Pix');
    document.getElementById('btnCartao').classList.toggle('selecionado', forma === 'Cartão');
    document.getElementById('btnDinheiro').classList.toggle('selecionado', forma === 'Dinheiro');
    areaTrocoDiv.style.display = forma === 'Dinheiro' ? 'block' : 'none';
}

// Remove acentos e padroniza texto para comparar nomes de bairro
function normalizar(txt) {
    return (txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Consulta o ViaCEP, calcula o valor da entrega pelo bairro e auto-preenche o endereço
async function calcularFrete() {
    const cep = cepClienteInput.value.replace(/\D/g, '');

    if (cep.length !== 8) {
        return;
    }

    infoFreteDiv.style.display = 'block';
    infoFreteDiv.textContent = 'Calculando taxa de entrega...';

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const dados = await resp.json();

        if (dados.erro) {
            infoFreteDiv.textContent = 'CEP não encontrado. Confirme o valor da entrega pelo WhatsApp.';
            freteAtual = 0;
            freteConfirmado = false;
        } else {
            // Auto-preenche os campos de endereço com o retorno do ViaCEP
            if (dados.logradouro) ruaClienteInput.value = dados.logradouro;
            if (dados.bairro) bairroClienteInput.value = dados.bairro;
            if (dados.localidade) cidadeClienteInput.value = dados.localidade;
            if (dados.uf) estadoClienteInput.value = dados.uf;

            const bairroNormalizado = normalizar(dados.bairro || '');
            if (bairrosEntrega.hasOwnProperty(bairroNormalizado)) {
                const km = bairrosEntrega[bairroNormalizado];
                freteAtual = km * valorPorKm;
                freteConfirmado = true;
                infoFreteDiv.textContent = `Entrega em ${dados.bairro}: R$ ${freteAtual.toFixed(2).replace('.', ',')}`;
            } else {
                freteAtual = 0;
                freteConfirmado = false;
                infoFreteDiv.textContent = `Bairro (${dados.bairro || 'não identificado'}) fora da área calculada automaticamente. O valor da entrega será confirmado pelo WhatsApp.`;
            }
        }
    } catch (err) {
        freteAtual = 0;
        freteConfirmado = false;
        infoFreteDiv.textContent = 'Não foi possível calcular automaticamente. O valor da entrega será confirmado pelo WhatsApp.';
    }

    atualizarCarrinhoHTML();
}

// Função para renderizar os produtos na página
// Transforma o nome de uma categoria num id seguro pra usar como âncora (ex: "Bolo no Pote" -> "bolo-no-pote")
function categoriaParaId(categoria) {
    return 'categoria-' + (categoria || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function renderizarProdutos() {
    listaProdutosDiv.innerHTML = '';

    // Agrupa os produtos por categoria, respeitando a ordem definida no painel
    const categoriasNaOrdem = ordenarCategorias([...new Set(produtos.map(produto => produto.categoria))]);

    // Guarda a lista de imagens de cada carrossel, pra usar nos cliques (setas e lightbox)
    carrosselImagensRegistro = {};
    let contadorCarrossel = 0;

    // Monta o card de um produto (reaproveitado tanto na seção de Ofertas quanto na categoria normal dele)
    function construirCardProduto(produto) {
        const produtoItemDiv = document.createElement('div');
        produtoItemDiv.classList.add('produto-item');

        if (!produto.disponivel) {
            produtoItemDiv.classList.add('indisponivel');
        }

        const emOferta = produto.precoOriginal && produto.precoOriginal > produto.preco;
        const temVariantes = Array.isArray(produto.variantes) && produto.variantes.length > 0;

        const imagens = (Array.isArray(produto.imagens) && produto.imagens.length > 0)
            ? produto.imagens
            : (produto.imagem ? [produto.imagem] : []);
        const carrosselId = 'carrossel-' + (contadorCarrossel++);
        carrosselImagensRegistro[carrosselId] = imagens;
        const temVariasImagens = imagens.length > 1;

        produtoItemDiv.innerHTML = `
            ${emOferta ? `<div class="produto-tag">🔥 OFERTA</div>` : ''}
            <div class="produto-imagem-wrap" id="${carrosselId}" data-indice="0">
                <img src="${imagens[0] || ''}" alt="${produto.nome}" class="produto-imagem-atual">
                ${temVariasImagens ? `
                    <button type="button" class="carrossel-seta carrossel-anterior">‹</button>
                    <button type="button" class="carrossel-seta carrossel-proximo">›</button>
                    <div class="carrossel-dots">${imagens.map((_, i) => `<span class="carrossel-dot${i === 0 ? ' ativo' : ''}"></span>`).join('')}</div>
                ` : ''}
            </div>
            <h3>${produto.nome}</h3>
            <p class="descricao">${produto.descricao}</p>
            <p class="preco">
                ${emOferta ? `<span class="preco-original">R$ ${produto.precoOriginal.toFixed(2).replace('.', ',')}</span> ` : ''}R$ ${produto.preco.toFixed(2).replace('.', ',')}
            </p>
            ${produto.disponivel && temVariantes
                ? `<div class="variantes-lista">${produto.variantes.map(v => `<button type="button" class="variante-pill" data-variante="${v}">${v}</button>`).join('')}</div>`
                : ''
            }
            ${produto.disponivel ? `
                <div class="produto-quantidade-stepper">
                    <button type="button" class="qtd-btn qtd-menos">−</button>
                    <span class="qtd-valor">1</span>
                    <button type="button" class="qtd-btn qtd-mais">+</button>
                </div>` : ''
            }
            ${produto.disponivel
                ? `<button class="adicionar-carrinho" data-nome="${produto.nome}" data-preco="${produto.preco}">Adicionar ao Carrinho</button>`
                : `<button class="adicionar-carrinho indisponivel-btn" disabled>Indisponível</button>`
            }
        `;
        return produtoItemDiv;
    }

    // Seção especial "🔥 Ofertas do Dia" (só aparece se tiver algum produto em oferta disponível)
    const produtosEmOferta = produtos.filter(p => p.disponivel && p.precoOriginal && p.precoOriginal > p.preco);
    if (produtosEmOferta.length > 0) {
        const tituloOferta = document.createElement('h3');
        tituloOferta.classList.add('categoria-titulo', 'categoria-titulo-oferta');
        tituloOferta.id = 'secao-ofertas';
        tituloOferta.textContent = '🔥 Ofertas do Dia';
        listaProdutosDiv.appendChild(tituloOferta);

        const gridOferta = document.createElement('div');
        gridOferta.classList.add('categoria-grid');
        produtosEmOferta.forEach(produto => gridOferta.appendChild(construirCardProduto(produto)));
        listaProdutosDiv.appendChild(gridOferta);
    }

    categoriasNaOrdem.forEach(categoria => {
        const produtosDaCategoria = produtos.filter(produto => produto.categoria === categoria);
        if (produtosDaCategoria.length === 0) return;

        const tituloEl = document.createElement('h3');
        tituloEl.classList.add('categoria-titulo');
        tituloEl.id = categoriaParaId(categoria);
        tituloEl.textContent = categoria;
        listaProdutosDiv.appendChild(tituloEl);

        const gridEl = document.createElement('div');
        gridEl.classList.add('categoria-grid');

        produtosDaCategoria.forEach(produto => gridEl.appendChild(construirCardProduto(produto)));

        listaProdutosDiv.appendChild(gridEl);
    });

    // Interatividade do carrossel de fotos: setas trocam a imagem, clicar na foto abre o lightbox
    document.querySelectorAll('.produto-imagem-wrap').forEach(wrap => {
        const imagens = carrosselImagensRegistro[wrap.id] || [];
        const imgEl = wrap.querySelector('.produto-imagem-atual');

        function mostrarIndice(i) {
            wrap.dataset.indice = i;
            imgEl.src = imagens[i];
            wrap.querySelectorAll('.carrossel-dot').forEach((dot, idx) => dot.classList.toggle('ativo', idx === i));
        }

        const btnAnterior = wrap.querySelector('.carrossel-anterior');
        const btnProximo = wrap.querySelector('.carrossel-proximo');
        if (btnAnterior) {
            btnAnterior.addEventListener('click', (e) => {
                e.stopPropagation();
                const atual = parseInt(wrap.dataset.indice, 10);
                mostrarIndice((atual - 1 + imagens.length) % imagens.length);
            });
        }
        if (btnProximo) {
            btnProximo.addEventListener('click', (e) => {
                e.stopPropagation();
                const atual = parseInt(wrap.dataset.indice, 10);
                mostrarIndice((atual + 1) % imagens.length);
            });
        }

        if (imgEl && imagens.length > 0) {
            imgEl.addEventListener('click', () => {
                const atual = parseInt(wrap.dataset.indice, 10) || 0;
                abrirLightbox(imagens, atual);
            });
        }
    });

    // Clique num "sabor" seleciona ele e desmarca os outros do mesmo produto
    document.querySelectorAll('.variante-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            pill.closest('.variantes-lista').querySelectorAll('.variante-pill').forEach(p => p.classList.remove('selecionada'));
            pill.classList.add('selecionada');
        });
    });

    // Adiciona event listeners apenas para botões de produtos disponíveis
    // Clique nos botões +/− do seletor de quantidade de cada produto
    document.querySelectorAll('.produto-quantidade-stepper').forEach(stepper => {
        const valorEl = stepper.querySelector('.qtd-valor');
        stepper.querySelector('.qtd-menos').addEventListener('click', () => {
            const v = parseInt(valorEl.textContent, 10) || 1;
            if (v > 1) valorEl.textContent = v - 1;
        });
        stepper.querySelector('.qtd-mais').addEventListener('click', () => {
            const v = parseInt(valorEl.textContent, 10) || 1;
            valorEl.textContent = v + 1;
        });
    });

    document.querySelectorAll('.adicionar-carrinho:not(.indisponivel-btn)').forEach(botao => {
        botao.addEventListener('click', (evento) => {
            const nomeProduto = evento.target.dataset.nome;
            const precoProduto = parseFloat(evento.target.dataset.preco);

            const cardProduto = evento.target.closest('.produto-item');
            const listaVariantes = cardProduto.querySelectorAll('.variante-pill');
            const varianteSelecionada = cardProduto.querySelector('.variante-pill.selecionada');
            const inputObs = cardProduto.querySelector('.observacao-item');

            // Se o produto tem sabores/opções, é obrigatório escolher um antes de adicionar
            if (listaVariantes.length > 0 && !varianteSelecionada) {
                alert('Escolha um sabor/opção antes de adicionar ao carrinho.');
                return;
            }

            const observacaoValor = varianteSelecionada ? varianteSelecionada.dataset.variante : (inputObs ? inputObs.value.trim() : '');

            const stepperValor = cardProduto.querySelector('.qtd-valor');
            const quantidadeEscolhida = stepperValor ? (parseInt(stepperValor.textContent, 10) || 1) : 1;

            const produtoExistente = carrinho.find(item => item.nome === nomeProduto && (item.observacao || '') === observacaoValor);

            if (produtoExistente) {
                produtoExistente.quantidade += quantidadeEscolhida;
                produtoExistente.preco = precoProduto; // Garante que o preço fica sempre atualizado (ex: entrou em oferta)
            } else {
                const produtoAdicionar = {
                    nome: nomeProduto,
                    preco: precoProduto,
                    quantidade: quantidadeEscolhida,
                    observacao: observacaoValor || null
                };
                carrinho.push(produtoAdicionar);
            }

            if (inputObs) inputObs.value = '';
            if (stepperValor) stepperValor.textContent = '1'; // reseta o seletor de quantidade pro próximo uso
            cardProduto.querySelectorAll('.variante-pill').forEach(p => p.classList.remove('selecionada'));

            alert(`${quantidadeEscolhida}x ${nomeProduto} adicionado ao carrinho!`);
            console.log('Carrinho atual:', carrinho);
            salvarCarrinho();
            atualizarCarrinhoHTML();
        });
    });

    iniciarObservadorCategorias();
}

// NOVO: Função para renderizar as categorias
function renderizarCategorias() {
    // Pega todas as categorias únicas dos produtos, na ordem definida no painel
    const categorias = ['Todos', ...ordenarCategorias([...new Set(produtos.map(produto => produto.categoria))])];

    categoriasNav.innerHTML = ''; // Limpa a navegação de categorias

    // Botão especial de Ofertas, só aparece se tiver produto em oferta disponível
    const temOfertaAtiva = produtos.some(p => p.disponivel && p.precoOriginal && p.precoOriginal > p.preco);
    if (temOfertaAtiva) {
        const liOferta = document.createElement('li');
        const btnOferta = document.createElement('button');
        btnOferta.textContent = '🔥 Ofertas';
        btnOferta.classList.add('categoria-btn', 'categoria-btn-oferta');
        btnOferta.addEventListener('click', () => irParaOfertas());
        liOferta.appendChild(btnOferta);
        categoriasNav.appendChild(liOferta);
    }

    categorias.forEach(categoria => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.textContent = categoria;
        button.classList.add('categoria-btn');
        if (categoria === categoriaAtual) {
            button.classList.add('active'); // Adiciona classe 'active' para a categoria selecionada
        }
        button.addEventListener('click', () => {
            document.querySelectorAll('.categoria-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            if (categoria === 'Todos') {
                listaProdutosDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                const alvo = document.getElementById(categoriaParaId(categoria));
                if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        li.appendChild(button);
        categoriasNav.appendChild(li);
    });
}

// Rola a página até a seção "🔥 Ofertas do Dia" — usado pelo botão da barra de categorias e pelo aviso de oferta
function irParaOfertas() {
    const alvo = document.getElementById('secao-ofertas');
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Acompanha o scroll e destaca sozinho a categoria que está aparecendo na tela
let categoriaObserver = null;

function iniciarObservadorCategorias() {
    if (categoriaObserver) categoriaObserver.disconnect();
    if (typeof IntersectionObserver === 'undefined') return;

    categoriaObserver = new IntersectionObserver((entradas) => {
        entradas.forEach(entrada => {
            if (entrada.isIntersecting) {
                const nomeCategoria = entrada.target.textContent;
                document.querySelectorAll('.categoria-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.textContent === nomeCategoria);
                });
            }
        });
    }, { rootMargin: '-90px 0px -70% 0px', threshold: 0 });

    document.querySelectorAll('.categoria-titulo').forEach(titulo => categoriaObserver.observe(titulo));
}


// Função para atualizar a exibição do carrinho na página
function atualizarCarrinhoHTML() {
    carrinhoItensDiv.innerHTML = '';

    let totalGeral = 0;

    if (carrinho.length === 0) {
        carrinhoItensDiv.innerHTML = '<p>Seu carrinho está vazio.</p>';
    } else {
        carrinho.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('carrinho-item');
            itemDiv.innerHTML = `
                <span>${item.nome}${item.observacao ? ` <em class="obs-mini">(${item.observacao})</em>` : ''}</span>
                <div class="quantidade-controle">
                    <button class="btn-quantidade" data-index="${index}" data-acao="diminuir">-</button>
                    <span>${item.quantidade}</span>
                    <button class="btn-quantidade" data-index="${index}" data-acao="aumentar">+</button>
                </div>
                <span>R$ ${(item.preco * item.quantidade).toFixed(2).replace('.', ',')}</span>
            `;
            carrinhoItensDiv.appendChild(itemDiv);
            totalGeral += item.preco * item.quantidade;
        });
    }

    subtotalCarrinhoSpan.textContent = `R$ ${totalGeral.toFixed(2).replace('.', ',')}`;

    const desconto = calcularDesconto(totalGeral);
    const linhaDesconto = document.getElementById('linhaDesconto');
    const descontoSpan = document.getElementById('desconto-carrinho');
    if (desconto > 0) {
        linhaDesconto.style.display = 'block';
        descontoSpan.textContent = `- R$ ${desconto.toFixed(2).replace('.', ',')}`;
    } else {
        linhaDesconto.style.display = 'none';
    }

    const freteGratisCupom = cupomAplicado && cupomAplicado.tipo === 'frete_gratis';
    const subtotalComDesconto = totalGeral - desconto;

    if (freteConfirmado) {
        const freteFinal = freteGratisCupom ? 0 : freteAtual;
        freteCarrinhoSpan.textContent = freteGratisCupom ? 'Grátis 🎉' : `R$ ${freteAtual.toFixed(2).replace('.', ',')}`;
        totalCarrinhoSpan.textContent = `R$ ${(subtotalComDesconto + freteFinal).toFixed(2).replace('.', ',')}`;
    } else {
        freteCarrinhoSpan.textContent = 'A confirmar';
        totalCarrinhoSpan.textContent = `R$ ${subtotalComDesconto.toFixed(2).replace('.', ',')} + entrega`;
    }

    document.querySelectorAll('.btn-quantidade').forEach(botao => {
        botao.addEventListener('click', (event) => {
            const index = parseInt(event.target.dataset.index);
            const acao = event.target.dataset.acao;
            gerenciarQuantidade(index, acao);
        });
    });
}

// Função para gerenciar a quantidade de um item no carrinho
function gerenciarQuantidade(index, acao) {
    if (acao === 'aumentar') {
        carrinho[index].quantidade++;
    } else if (acao === 'diminuir') {
        if (carrinho[index].quantidade > 1) {
            carrinho[index].quantidade--;
        } else {
            const confirmarRemocao = confirm(`Deseja remover "${carrinho[index].nome}" do carrinho?`);
            if (confirmarRemocao) {
                carrinho.splice(index, 1);
            }
        }
    }
    salvarCarrinho();
    atualizarCarrinhoHTML();
    console.log('Carrinho atual:', carrinho);
}

// Função para limpar os campos do formulário de endereço
function limparFormularioEndereco() {
    nomeClienteInput.value = '';
    telefoneClienteInput.value = '';
    ruaClienteInput.value = '';
    numeroClienteInput.value = '';
    complementoClienteInput.value = '';
    bairroClienteInput.value = '';
    cidadeClienteInput.value = '';
    estadoClienteInput.value = '';
    cepClienteInput.value = '';
    clienteTrocoInput.value = '';
    clienteObsInput.value = '';
    infoFreteDiv.style.display = 'none';
    selecionarTipoEntrega('retirada');
    selecionarPagamento('Pix');

    cupomAplicado = null;
    const cupomInput = document.getElementById('cupomInput');
    const cupomMsg = document.getElementById('cupomMensagem');
    if (cupomInput) cupomInput.value = '';
    if (cupomMsg) { cupomMsg.textContent = ''; cupomMsg.className = 'cupom-mensagem'; }
}


// Funcionalidade para o botão Finalizar Compra
/* ===================================================================
   CLUBE BRIT'S (Fidelidade)
   =================================================================== */
let clubeIdentificado = null; // { nome, telefone }
let configFidelidade = {};
let recompensasFidelidade = [];
let dadosFidelidadeCliente = { pontos: 0, totalGasto: 0 };
let refFidelidadeCliente = null;
let recompensaSelecionada = null; // { pontos, tipo, valor|produtoNome, descricao, _index }

function normalizarTelefone(tel) {
    return (tel || '').replace(/\D/g, '');
}

function escutarConfigClube() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    firebase.database().ref('configuracao/fidelidade').on('value', snap => {
        configFidelidade = snap.val() || {};
        const card = document.getElementById('clubeBritsCard');
        if (card) card.style.display = configFidelidade.ativo ? 'block' : 'none';
        atualizarUIClube();
    });
    firebase.database().ref('configuracao/recompensasFidelidade').on('value', snap => {
        recompensasFidelidade = snap.val() || [];
        atualizarUIClube();
    });
}

function abrirFormClube() {
    document.getElementById('clubeNaoIdentificado').style.display = 'none';
    document.getElementById('clubeFormIdentificacao').style.display = 'block';
    // Já aproveita nome/telefone se o cliente já preencheu no formulário de entrega
    if (nomeClienteInput.value) document.getElementById('clubeNomeInput').value = nomeClienteInput.value;
    if (telefoneClienteInput.value) document.getElementById('clubeTelefoneInput').value = telefoneClienteInput.value;
}

function entrarNoClube() {
    const nome = document.getElementById('clubeNomeInput').value.trim();
    const telefone = normalizarTelefone(document.getElementById('clubeTelefoneInput').value);
    if (!nome || telefone.length < 10) {
        alert('Preencha seu nome e um WhatsApp válido (com DDD).');
        return;
    }
    clubeIdentificado = { nome, telefone };
    localStorage.setItem('clubeBritS', JSON.stringify(clubeIdentificado));

    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        const ref = firebase.database().ref('fidelidade/' + telefone);
        ref.once('value').then(snap => {
            if (!snap.exists()) {
                ref.set({ nome, pontos: 0, totalGasto: 0, criadoEm: firebase.database.ServerValue.TIMESTAMP });
            } else {
                ref.update({ nome });
            }
        });
    }
    escutarDadosFidelidadeCliente();
    atualizarUIClube();
}

function sairDoClube() {
    clubeIdentificado = null;
    localStorage.removeItem('clubeBritS');
    if (refFidelidadeCliente) { refFidelidadeCliente.off(); refFidelidadeCliente = null; }
    dadosFidelidadeCliente = { pontos: 0, totalGasto: 0 };
    atualizarUIClube();
}

function escutarDadosFidelidadeCliente() {
    if (!clubeIdentificado || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
    if (refFidelidadeCliente) refFidelidadeCliente.off();
    refFidelidadeCliente = firebase.database().ref('fidelidade/' + clubeIdentificado.telefone);
    refFidelidadeCliente.on('value', snap => {
        dadosFidelidadeCliente = snap.val() || { pontos: 0, totalGasto: 0 };
        atualizarUIClube();
    });
}

function calcularNivelClube(pontos, cfg) {
    if (pontos >= (cfg.minVip || 200)) return { nome: 'VIP', emoji: '💎' };
    if (pontos >= (cfg.minOuro || 100)) return { nome: 'Ouro', emoji: '🥇' };
    if (pontos >= (cfg.minPrata || 50)) return { nome: 'Prata', emoji: '🥈' };
    return { nome: 'Bronze', emoji: '🥉' };
}

function atualizarUIClube() {
    const naoIdent = document.getElementById('clubeNaoIdentificado');
    const form = document.getElementById('clubeFormIdentificacao');
    const perfil = document.getElementById('clubePerfil');
    if (!naoIdent) return;

    if (!clubeIdentificado) {
        naoIdent.style.display = 'block';
        form.style.display = 'none';
        perfil.style.display = 'none';
        return;
    }
    naoIdent.style.display = 'none';
    form.style.display = 'none';
    perfil.style.display = 'block';

    document.getElementById('clubeNomeExibido').textContent = clubeIdentificado.nome;

    const pontos = dadosFidelidadeCliente.pontos || 0;
    const nivel = calcularNivelClube(pontos, configFidelidade);
    document.getElementById('clubeNivelEmoji').textContent = nivel.emoji;
    document.getElementById('clubeNivelNome').textContent = nivel.nome;
    document.getElementById('clubePontosExibido').textContent = pontos;

    // Barra de progresso até a PRÓXIMA recompensa que o cliente ainda não alcançou
    const comIndice = recompensasFidelidade.map((r, i) => r ? { ...r, _index: i } : null).filter(Boolean);
    const ordenadas = [...comIndice].sort((a, b) => a.pontos - b.pontos);
    const proxima = ordenadas.find(r => r.pontos > pontos);
    const barra = document.getElementById('clubeBarraProgresso');
    const progressoTexto = document.getElementById('clubeProgressoTexto');

    if (proxima) {
        const anterior = [...ordenadas].reverse().find(r => r.pontos <= pontos);
        const base = anterior ? anterior.pontos : 0;
        const faixa = proxima.pontos - base;
        const pct = faixa > 0 ? Math.min(100, Math.round(((pontos - base) / faixa) * 100)) : 0;
        barra.style.width = pct + '%';

        const faltam = proxima.pontos - pontos;
        const perto = faixa > 0 && (faltam / faixa) <= 0.2; // faltando 20% ou menos da faixa, fica animado
        const prefixo = perto ? '🔥 Faltam apenas' : 'Faltam';
        progressoTexto.innerHTML = `⭐ <strong>${pontos} / ${proxima.pontos}</strong> pontos<br>${prefixo} ${faltam} ${faltam === 1 ? 'ponto' : 'pontos'} para ganhar: <strong>${proxima.descricao}</strong>!`;
    } else if (ordenadas.length > 0) {
        barra.style.width = '100%';
        progressoTexto.innerHTML = `⭐ <strong>${pontos}</strong> pontos<br>🎉 Você já pode resgatar todas as recompensas disponíveis!`;
    } else {
        barra.style.width = '0%';
        progressoTexto.innerHTML = `⭐ <strong>${pontos}</strong> pontos acumulados<br>Continue comprando pra ganhar prêmios!`;
    }

    renderRecompensasClube(comIndice, pontos);
    atualizarBotaoRepetirPedido();
}

function renderRecompensasClube(comIndice, pontos) {
    const div = document.getElementById('clubeRecompensas');
    if (!div) return;
    if (!comIndice || comIndice.length === 0) { div.innerHTML = ''; return; }
    const ordenadas = [...comIndice].sort((a, b) => a.pontos - b.pontos);
    div.innerHTML = '<h4 class="clube-recompensas-titulo">🎁 Recompensas disponíveis</h4>' + ordenadas.map(r => {
        const podeResgatar = pontos >= r.pontos;
        const detalhe = r.tipo === 'produto' ? r.produtoNome : `R$ ${Number(r.valor || 0).toFixed(2).replace('.', ',')} de desconto`;
        return `<div class="clube-recompensa-item ${podeResgatar ? '' : 'bloqueada'}">
            <span>${r.pontos} pts — ${r.descricao} (${detalhe})</span>
            ${podeResgatar ? `<button type="button" onclick="resgatarRecompensa(${r._index})">Resgatar</button>` : ''}
        </div>`;
    }).join('');
}

function resgatarRecompensa(index) {
    const r = recompensasFidelidade[index];
    if (!r) return;
    const pontos = dadosFidelidadeCliente.pontos || 0;
    if (pontos < r.pontos) { alert('Você ainda não tem pontos suficientes pra essa recompensa.'); return; }

    recompensaSelecionada = { ...r, _index: index };

    if (r.tipo === 'produto') {
        const produtoRef = produtos.find(p => p.nome === r.produtoNome);
        carrinho.push({
            nome: r.produtoNome,
            preco: 0,
            quantidade: 1,
            observacao: "🎁 Recompensa do Clube Brit's"
        });
        salvarCarrinho();
    }
    atualizarCarrinhoHTML();
    alert(`Recompensa selecionada: ${r.descricao}! Ela será aplicada quando você finalizar o pedido.`);
}

function atualizarBotaoRepetirPedido() {
    const btn = document.getElementById('btnRepetirPedido');
    if (!btn) return;
    const ultimo = dadosFidelidadeCliente.ultimoPedido;
    btn.style.display = (ultimo && ultimo.itens && ultimo.itens.length > 0) ? 'block' : 'none';
}

function repetirUltimoPedido() {
    const ultimo = dadosFidelidadeCliente.ultimoPedido;
    if (!ultimo || !ultimo.itens || ultimo.itens.length === 0) return;
    ultimo.itens.forEach(item => {
        const jaExiste = carrinho.find(c => c.nome === item.nome && (c.observacao || '') === (item.observacao || ''));
        if (jaExiste) jaExiste.quantidade += item.quantidade;
        else carrinho.push({ nome: item.nome, preco: item.preco, quantidade: item.quantidade, observacao: item.observacao || null });
    });
    salvarCarrinho();
    atualizarCarrinhoHTML();
    alert('Itens do seu último pedido foram adicionados ao carrinho!');
}

botaoFinalizarCompra.addEventListener('click', () => {
    if (!lojaAbertaAtual) {
        alert('Estamos fechados no momento. Assim que reabrirmos, você já pode finalizar seu pedido!');
        return;
    }
    if (carrinho.length === 0) {
        alert('Seu carrinho está vazio. Adicione alguns produtos antes de finalizar a compra!');
        return;
    }

    // Coleta os dados do formulário
    const nome = nomeClienteInput.value.trim();
    const telefone = telefoneClienteInput.value.trim();
    const rua = ruaClienteInput.value.trim();
    const numero = numeroClienteInput.value.trim();
    const complemento = complementoClienteInput.value.trim();
    const bairro = bairroClienteInput.value.trim();
    const cidade = cidadeClienteInput.value.trim();
    const estado = estadoClienteInput.value.trim();
    const cep = cepClienteInput.value.trim();
    const troco = clienteTrocoInput.value.trim();
    const obs = clienteObsInput.value.trim();

    // Validação simples dos campos obrigatórios
    if (!nome || !telefone) {
        alert('Por favor, preencha seu nome e telefone.');
        return;
    }
    if (tipoEntregaAtual === 'entrega' && (!rua || !numero || !bairro || !cidade || !estado || !cep)) {
        alert('Por favor, preencha todos os campos obrigatórios de entrega.');
        return;
    }

    // Formata os itens do carrinho para a mensagem
    let itensPedido = '';
    let subtotalPedido = 0;
    carrinho.forEach(item => {
        const subitem = item.preco * item.quantidade;
        subtotalPedido += subitem;
        itensPedido += `- ${item.nome}${item.observacao ? ` (${item.observacao})` : ''} (x${item.quantidade}) - R$ ${subitem.toFixed(2).replace('.', ',')}\n`;
    });

    const desconto = calcularDesconto(subtotalPedido);
    const freteGratisCupom = cupomAplicado && cupomAplicado.tipo === 'frete_gratis';
    const subtotalTexto = `R$ ${subtotalPedido.toFixed(2).replace('.', ',')}`;
    const frete = (tipoEntregaAtual === 'entrega' && !freteGratisCupom) ? freteAtual : 0;
    const freteTexto = tipoEntregaAtual === 'entrega'
        ? (freteGratisCupom ? 'Grátis (cupom)' : (freteConfirmado ? `R$ ${frete.toFixed(2).replace('.', ',')}` : 'A confirmar pelo WhatsApp'))
        : 'Não se aplica (retirada no local)';
    const totalPedido = (tipoEntregaAtual === 'retirada' || freteConfirmado)
        ? `R$ ${(subtotalPedido - desconto + frete).toFixed(2).replace('.', ',')}`
        : `${subtotalTexto} + entrega (a confirmar)`;

    // Monta a mensagem final
    let mensagemPedido = `🍰 *Novo Pedido - Brit's Confeitaria* 🍰\n\n`;
    mensagemPedido += `*Cliente:* ${nome}\n`;
    mensagemPedido += `*Telefone:* ${telefone}\n`;
    mensagemPedido += `*Tipo:* ${tipoEntregaAtual === 'entrega' ? 'Entrega' : 'Retirada no local'}\n`;
    if (tipoEntregaAtual === 'entrega') {
        mensagemPedido += `*Endereço:* ${rua}, ${numero} ${complemento ? `(${complemento})` : ''}\n`;
        mensagemPedido += `*Bairro:* ${bairro}\n`;
        mensagemPedido += `*Cidade/Estado:* ${cidade}/${estado}\n`;
        mensagemPedido += `*CEP:* ${cep}\n`;
    }
    mensagemPedido += `*Forma de pagamento:* ${formaPagamentoAtual}\n`;
    if (formaPagamentoAtual === 'Dinheiro' && troco) mensagemPedido += `*Troco para:* ${troco}\n`;
    mensagemPedido += `\n*Itens:*\n${itensPedido}\n`;
    mensagemPedido += `*Subtotal:* ${subtotalTexto}\n`;
    if (cupomAplicado) mensagemPedido += `*Cupom:* ${cupomAplicado.codigo}${desconto > 0 ? ` (- R$ ${desconto.toFixed(2).replace('.', ',')})` : ''}\n`;
    if (recompensaSelecionada) mensagemPedido += `*Recompensa do Clube:* ${recompensaSelecionada.descricao} (${recompensaSelecionada.pontos} pontos)\n`;
    if (tipoEntregaAtual === 'entrega') mensagemPedido += `*Taxa de entrega:* ${freteTexto}\n`;
    mensagemPedido += `*Total:* ${totalPedido}\n`;
    if (obs) mensagemPedido += `\n*Observações:* ${obs}\n`;
    mensagemPedido += `\nAguardando a confirmação!`;

    // Salva o pedido no painel da loja (Firebase), sem travar o fluxo caso falhe
    const pedidoId = salvarPedidoNoPainel({
        nome, telefone,
        tipoEntrega: tipoEntregaAtual,
        endereco: tipoEntregaAtual === 'entrega' ? { rua, numero, complemento, bairro, cidade, estado, cep } : null,
        formaPagamento: formaPagamentoAtual,
        troco: (formaPagamentoAtual === 'Dinheiro' && troco) ? troco : null,
        observacoes: obs || null,
        itens: carrinho.map(item => ({ nome: item.nome, preco: item.preco, quantidade: item.quantidade, observacao: item.observacao || null })),
        subtotal: subtotalPedido,
        cupom: cupomAplicado ? cupomAplicado.codigo : null,
        desconto: desconto > 0 ? desconto : 0,
        frete: tipoEntregaAtual === 'entrega' ? (freteConfirmado ? frete : null) : 0,
        total: (tipoEntregaAtual === 'retirada' || freteConfirmado) ? (subtotalPedido - desconto + frete) : null,
        // Guarda a recompensa resgatada (se houver) — os pontos só são efetivamente creditados/descontados
        // quando a loja marcar o pedido como "Entregue" no painel, não na hora do pedido
        recompensaResgatada: recompensaSelecionada ? {
            pontos: recompensaSelecionada.pontos,
            descricao: recompensaSelecionada.descricao
        } : null
    });

    // Guarda esse pedido pra mostrar o status (pendente/aceito/em rota/entregue/recusado) pro cliente
    if (pedidoId) {
        localStorage.setItem('ultimoPedidoBritS', JSON.stringify({ id: pedidoId, criadoEm: Date.now() }));
        mostrarStatusPedido(pedidoId);
    }

    // Importante: os pontos de fidelidade NÃO são creditados aqui — só quando a loja confirmar
    // que o pedido foi entregue, lá no painel. Isso evita creditar pontos de pedidos recusados.
    recompensaSelecionada = null;

    // Guarda os dados do cliente pra já vir preenchido na próxima compra
    localStorage.setItem('dadosClienteBritS', JSON.stringify({
        nome, telefone, rua, numero, complemento, bairro, cidade, estado, cep,
        tipoEntrega: tipoEntregaAtual
    }));

    // Configuração e abertura do WhatsApp
    const numeroWhatsApp = '5527997633871'; // Seu número de WhatsApp configurado
    const linkWhatsApp = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(mensagemPedido)}`;

    // Abre o WhatsApp em uma nova aba
    window.open(linkWhatsApp, '_blank');

    // Limpa o carrinho e o formulário após o envio para o WhatsApp
    carrinho = [];
    salvarCarrinho();
    atualizarCarrinhoHTML();
    limparFormularioEndereco();
    console.log('Pedido enviado para o WhatsApp. Carrinho e formulário limpos.');
});

// Atualiza os preços de itens que já estavam salvos no carrinho do navegador,
// caso o preço do produto tenha mudado (ex: entrou ou saiu de oferta) desde a última visita
function sincronizarPrecosCarrinho() {
    let mudou = false;
    carrinho.forEach(item => {
        const produtoAtual = produtos.find(p => p.nome === item.nome);
        if (produtoAtual && produtoAtual.preco !== item.preco) {
            item.preco = produtoAtual.preco;
            mudou = true;
        }
    });
    if (mudou) {
        salvarCarrinho();
    }
}

// Chama as funções iniciais ao carregar a página
escutarProdutos(); // Carrega o cardápio do Firebase (e re-renderiza sozinho quando o painel mudar algo)
escutarOrdemCategorias(); // Carrega a ordem de categorias definida no painel

// Clube Brit's: recupera o cliente já identificado nesse navegador (se houver) e escuta a configuração
try {
    const salvo = JSON.parse(localStorage.getItem('clubeBritS'));
    if (salvo && salvo.telefone) {
        clubeIdentificado = salvo;
        escutarDadosFidelidadeCliente();
    }
} catch (e) { /* localStorage vazio ou inválido, ignora */ }
escutarConfigClube();

/* ===================================================================
   VISITANTES (contador online em tempo real + histórico de visitas por dia)
   =================================================================== */
function iniciarRastreioVisitantes() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;

    // Cada aba/sessão do navegador tem um ID único, criado uma vez e reaproveitado
    let sessionId = sessionStorage.getItem('sessaoVisitanteBritS');
    if (!sessionId) {
        sessionId = 'v_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        sessionStorage.setItem('sessaoVisitanteBritS', sessionId);
    }

    const presencaRef = firebase.database().ref('presenca/' + sessionId);
    const conectadoRef = firebase.database().ref('.info/connected');

    // Toda vez que a conexão com o Firebase (re)conecta, registra presença e programa
    // a remoção automática pro momento em que o visitante sair/fechar a aba
    conectadoRef.on('value', snap => {
        if (snap.val() === true) {
            presencaRef.onDisconnect().remove();
            presencaRef.set(firebase.database.ServerValue.TIMESTAMP);
        }
    });

    // Conta essa visita no histórico do dia, só uma vez por sessão (não infla recarregando a página)
    if (!sessionStorage.getItem('visitaContadaBritS')) {
        sessionStorage.setItem('visitaContadaBritS', '1');
        const hoje = new Date();
        const hojeFormatado = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
        firebase.database().ref('visitasPorDia/' + hojeFormatado).transaction(atual => (atual || 0) + 1);
    }
}
iniciarRastreioVisitantes();
escutarCupons(); // Carrega os cupons de desconto cadastrados no painel
atualizarCarrinhoHTML();
carregarDadosClienteSalvos(); // Preenche nome/telefone/endereço da última compra
verificarPedidoSalvo(); // Mostra o status do último pedido, se ainda for recente
escutarStatusLoja(); // Mostra se a loja está aberta ou fechada agora

// Registra o Service Worker (pra permitir instalar como app / carregar mais rápido)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(err => {
            console.log('Não foi possível registrar o service worker:', err);
        });
    });
}

// Tela de boas-vindas: aparece só na primeira vez que o cliente abre o site nessa visita
function mostrarBoasVindas() {
    try {
        if (sessionStorage.getItem('boasVindasBritS')) return;
    } catch (e) {
        return; // sessionStorage bloqueado (ex: navegação privada restrita) — não mostra pra não travar
    }
    const tela = document.getElementById('telaBoasVindas');
    if (tela) tela.style.display = 'flex';
}

function fecharBoasVindas() {
    const tela = document.getElementById('telaBoasVindas');
    if (!tela) return;
    tela.classList.add('fechando');
    try { sessionStorage.setItem('boasVindasBritS', '1'); } catch (e) { /* ignora */ }
    setTimeout(() => { tela.style.display = 'none'; }, 300);
}

mostrarBoasVindas();

/* ===================================================================
   NOTIFICAÇÕES PUSH
   Depois de gerar a chave VAPID no Firebase (Configurações do projeto >
   Cloud Messaging > Certificados push da Web), cole ela aqui embaixo.
   =================================================================== */
const VAPID_KEY = 'COLE_AQUI_A_SUA_CHAVE_VAPID';

function podeReceberNotificacoes() {
    return typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length &&
        typeof firebase.messaging === 'function' &&
        typeof Notification !== 'undefined' &&
        'serviceWorker' in navigator;
}

function atualizarBotaoNotificacao() {
    const btn = document.getElementById('btnAtivarNotificacoes');
    if (!btn) return;
    const ativado = localStorage.getItem('notificacoesAtivasBritS') === '1';
    if (ativado) {
        btn.textContent = '🔔 Notificações ativadas';
        btn.disabled = true;
    }
}

async function ativarNotificacoes() {
    if (!podeReceberNotificacoes()) {
        alert('Seu navegador não é compatível com notificações. Tente pelo Chrome.');
        return;
    }
    if (VAPID_KEY === 'COLE_AQUI_A_SUA_CHAVE_VAPID') {
        console.log('Configure a VAPID_KEY no script.js antes de usar as notificações.');
        return;
    }
    try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
            alert('Você optou por não receber notificações. Pode ativar depois nas permissões do navegador.');
            return;
        }
        const registration = await navigator.serviceWorker.ready;
        const messaging = firebase.messaging();
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (token) {
            await firebase.database().ref('notificacaoTokens/' + token).set({
                criadoEm: firebase.database.ServerValue.TIMESTAMP
            });
            localStorage.setItem('notificacoesAtivasBritS', '1');
            atualizarBotaoNotificacao();
        }
    } catch (err) {
        console.log('Erro ao ativar notificações:', err);
        alert('Não foi possível ativar as notificações agora. Tente de novo mais tarde.');
    }
}

// Mostra um aviso na tela quando a notificação chega com o site já aberto
function mostrarToastNotificacao(titulo, corpo) {
    const toast = document.getElementById('toastNotificacao');
    const tituloEl = document.getElementById('toastNotificacaoTitulo');
    const corpoEl = document.getElementById('toastNotificacaoCorpo');
    if (!toast || !tituloEl || !corpoEl) return;
    tituloEl.textContent = titulo || '';
    corpoEl.textContent = corpo || '';
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 6000);
}

atualizarBotaoNotificacao();

if (podeReceberNotificacoes() && VAPID_KEY !== 'COLE_AQUI_A_SUA_CHAVE_VAPID') {
    try {
        firebase.messaging().onMessage((payload) => {
            const titulo = (payload.notification && payload.notification.title) || "Brit's Confeitaria";
            const corpo = (payload.notification && payload.notification.body) || '';
            mostrarToastNotificacao(titulo, corpo);
        });
    } catch (e) {
        console.log('Não foi possível escutar notificações em primeiro plano:', e);
    }
}

// Fecha o lightbox clicando fora da imagem, e permite navegar com o teclado (setas e Esc)
document.addEventListener('DOMContentLoaded', () => {
    const lb = document.getElementById('lightboxImagem');
    if (lb) {
        lb.addEventListener('click', (e) => {
            if (e.target.id === 'lightboxImagem') fecharLightbox();
        });
    }
});
document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightboxImagem');
    if (!lb || lb.style.display !== 'flex') return;
    if (e.key === 'Escape') fecharLightbox();
    if (e.key === 'ArrowLeft') lightboxNavegar(-1);
    if (e.key === 'ArrowRight') lightboxNavegar(1);
});
