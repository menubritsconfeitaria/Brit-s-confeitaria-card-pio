/* PedeAki / Brit's — Detalhes Premium de Produto R1 — CANDIDATA LOCAL.
 * Camada de interface. Reutiliza finalizarAdicaoAoCarrinho para preservar estoque,
 * carrinho, encomendas, adicionais, preços e os controles vigentes da Brit's.
 * Não consulta nem escreve Firebase, pagamentos, Rules, Auth ou Storage.
 */
(() => {
  'use strict';
  const RAIZ = 'pdpOverlayR1';
  let dialogo = null, produtoAtual = null, origem = null, rolagemAnterior = 0;
  let quantidade = 1, variante = null, selecoes = [], fotoIndice = 0, sucesso = false, assinaturaAbertura = null;

  const dinheiro = valor => 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
  const texto = (tag, classe, valor) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (valor != null) el.textContent = String(valor);
    return el;
  };
  const id = sufixo => document.getElementById('pdpR1_' + sufixo);
  const escapar = v => String(v == null ? '' : v);
  const disponivel = produto => {
    if (!produto || produto.disponivel === false || produto.escondido) return false;
    try {
      if (typeof produtoDisponivelPorHorarioAgora === 'function' && !produtoDisponivelPorHorarioAgora(produto)) return false;
      if (typeof obterSituacaoEstoqueProduto === 'function') {
        const estoque = obterSituacaoEstoqueProduto(produto.id, produto.nome);
        if (estoque.controlado && estoque.disponivelParaAdicionar <= 0) return false;
      }
      return true;
    } catch (_) { return false; }
  };
  const fotos = produto => Array.isArray(produto.imagens) && produto.imagens.length
    ? produto.imagens.filter(v => typeof v === 'string' && /^https?:\/\/|^data:image\//i.test(v))
    : (typeof produto.imagem === 'string' && /^https?:\/\/|^data:image\//i.test(produto.imagem) ? [produto.imagem] : []);
  const produtoAtualizado = () => {
    if (typeof produtos === 'undefined' || !Array.isArray(produtos) || !produtoAtual) return null;
    return (produtoAtual.id != null ? produtos.find(p => p.id === produtoAtual.id) : null)
      || produtos.find(p => p.nome === produtoAtual.nome) || null;
  };

  function montarEstrutura() {
    if (dialogo) return;
    dialogo = document.createElement('dialog');
    dialogo.id = RAIZ;
    dialogo.className = 'pdp-r1';
    dialogo.setAttribute('aria-labelledby', 'pdpR1_nome');
    dialogo.innerHTML = `
      <div class="pdp-r1-shell">
        <header class="pdp-r1-topo">
          <button type="button" class="pdp-r1-voltar" id="pdpR1_voltar" aria-label="Voltar ao cardápio">← <span>Voltar ao cardápio</span></button>
          <span class="pdp-r1-topo-marca">BRIT'S · DETALHES DO PRODUTO</span>
          <button type="button" class="pdp-r1-fechar" id="pdpR1_fechar" aria-label="Fechar detalhes">×</button>
        </header>
        <div class="pdp-r1-corpo" id="pdpR1_corpo">
          <section class="pdp-r1-galeria" aria-label="Fotos do produto">
            <div id="pdpR1_fotoArea" class="pdp-r1-foto-area">
              <img id="pdpR1_foto" class="pdp-r1-foto" alt="Foto do produto" />
              <div id="pdpR1_semFoto" class="pdp-r1-sem-foto" hidden>🧁 <span>Feito com carinho</span></div>
              <button type="button" id="pdpR1_fotoAnterior" class="pdp-r1-foto-seta pdp-r1-anterior" aria-label="Foto anterior">‹</button>
              <button type="button" id="pdpR1_fotoProxima" class="pdp-r1-foto-seta pdp-r1-proxima" aria-label="Próxima foto">›</button>
            </div>
            <div id="pdpR1_fotoContagem" class="pdp-r1-foto-contagem"></div>
          </section>
          <section class="pdp-r1-formulario" aria-label="Personalizar produto">
            <span class="pdp-r1-sobretitulo">ESCOLHA DO SEU JEITO</span>
            <h2 id="pdpR1_nome"></h2>
            <p id="pdpR1_descricao" class="pdp-r1-descricao"></p>
            <div class="pdp-r1-preco-base">A partir de <strong id="pdpR1_precoBase"></strong></div>
            <div id="pdpR1_avisoDisponibilidade" class="pdp-r1-aviso" hidden></div>
            <div id="pdpR1_campos" class="pdp-r1-campos">
              <div id="pdpR1_variantes"></div>
              <div id="pdpR1_adicionais"></div>
              <label class="pdp-r1-obs-label" for="pdpR1_obs">Observações <small>(opcional)</small></label>
              <textarea id="pdpR1_obs" maxlength="300" rows="3" placeholder="Alguma preferência para o seu pedido?"></textarea>
            </div>
            <p id="pdpR1_erro" class="pdp-r1-erro" role="alert" aria-live="polite"></p>
          </section>
        </div>
        <div class="pdp-r1-concluido" id="pdpR1_concluido" hidden>
          <div class="pdp-r1-concluido-icone">✓</div>
          <h2>Produto adicionado!</h2>
          <p id="pdpR1_concluidoResumo"></p>
          <button type="button" id="pdpR1_continuar" class="pdp-r1-botao-secundario">← Continuar comprando</button>
          <button type="button" id="pdpR1_verCarrinho" class="pdp-r1-botao-principal">Ver meu carrinho 🛒</button>
        </div>
        <footer id="pdpR1_rodape" class="pdp-r1-rodape">
          <div class="pdp-r1-stepper" aria-label="Quantidade do produto">
            <button type="button" id="pdpR1_menos" aria-label="Diminuir quantidade">−</button>
            <output id="pdpR1_qtd" aria-live="polite">1</output>
            <button type="button" id="pdpR1_mais" aria-label="Aumentar quantidade">+</button>
          </div>
          <button type="button" id="pdpR1_adicionar" class="pdp-r1-botao-principal">Adicionar ao carrinho</button>
        </footer>
      </div>`;
    document.body.appendChild(dialogo);
    id('voltar').addEventListener('click', fechar);
    id('fechar').addEventListener('click', fechar);
    id('continuar').addEventListener('click', fechar);
    id('verCarrinho').addEventListener('click', () => {
      fechar();
      const destino = document.getElementById('carrinho');
      if (destino) destino.scrollIntoView({behavior:'smooth',block:'start'});
    });
    id('menos').addEventListener('click', () => { quantidade = Math.max(1, quantidade - 1); atualizarTotal(); });
    id('mais').addEventListener('click', () => { quantidade = Math.min(99, quantidade + 1); atualizarTotal(); });
    id('adicionar').addEventListener('click', confirmar);
    id('fotoAnterior').addEventListener('click', () => alterarFoto(-1));
    id('fotoProxima').addEventListener('click', () => alterarFoto(1));
    dialogo.addEventListener('click', e => { if (e.target === dialogo) fechar(); });
    dialogo.addEventListener('close', () => restaurarFoco());
  }

  function atualizarFoto() {
    const imagens = fotos(produtoAtual);
    const img = id('foto');
    const temFoto = imagens.length > 0;
    img.hidden = !temFoto;
    id('semFoto').hidden = temFoto;
    if (temFoto) {
      fotoIndice = (fotoIndice + imagens.length) % imagens.length;
      img.src = imagens[fotoIndice];
      img.alt = `${escapar(produtoAtual.nome)} — foto ${fotoIndice + 1}`;
      img.onerror = () => { img.hidden = true; id('semFoto').hidden = false; };
    } else img.removeAttribute('src');
    id('fotoAnterior').hidden = imagens.length < 2;
    id('fotoProxima').hidden = imagens.length < 2;
    id('fotoContagem').textContent = imagens.length > 1 ? `${fotoIndice+1} de ${imagens.length} fotos` : '';
  }
  function alterarFoto(delta) { fotoIndice += delta; atualizarFoto(); }

  function criarGrupo(nome, obrigatorio, escolhas, multiplo, aoMudar, marcadoInicial) {
    const grupo = document.createElement('fieldset');
    grupo.className = 'pdp-r1-grupo';
    const legenda = texto('legend', 'pdp-r1-grupo-titulo', nome);
    legenda.appendChild(texto('span', obrigatorio ? 'pdp-r1-etiqueta pdp-r1-obrigatorio' : 'pdp-r1-etiqueta', obrigatorio ? 'Obrigatório' : 'Opcional'));
    grupo.appendChild(legenda);
    const opcoes = texto('div', 'pdp-r1-opcoes');
    escolhas.forEach((opt, i) => {
      const rotulo = texto('label', 'pdp-r1-opcao');
      const campo = document.createElement('input');
      campo.type = multiplo ? 'checkbox' : 'radio';
      campo.name = `pdpR1_grupo_${String(nome).replace(/[^a-z0-9]/gi,'_')}_${grupo.dataset.indice||''}`;
      campo.value = String(i);
      campo.checked = typeof marcadoInicial === 'function' && marcadoInicial(i);
      campo.addEventListener('change', () => { aoMudar(i, campo.checked); atualizarTotal(); });
      rotulo.appendChild(campo);
      rotulo.appendChild(texto('span', 'pdp-r1-opcao-nome', opt.nome));
      if (Number(opt.preco) > 0) rotulo.appendChild(texto('span', 'pdp-r1-opcao-preco', '+ ' + dinheiro(opt.preco)));
      opcoes.appendChild(rotulo);
    });
    grupo.appendChild(opcoes);
    return grupo;
  }

  function renderizarEscolhas() {
    const variantesEl = id('variantes');
    const adicionaisEl = id('adicionais');
    variantesEl.replaceChildren(); adicionaisEl.replaceChildren();
    const variantes = Array.isArray(produtoAtual.variantes) ? produtoAtual.variantes : [];
    if (variantes.length) {
      const grp = criarGrupo('Escolha o sabor / opção', true, variantes.map(v => ({nome:String(v)})), false, i => { variante = i; }, i => i === variante);
      grp.querySelectorAll('input').forEach(x => x.name = 'pdpR1_variante');
      variantesEl.appendChild(grp);
    }
    const extras = typeof adicionaisAtivo !== 'undefined' && adicionaisAtivo === true && Array.isArray(produtoAtual.grupoAdicionais)
      ? produtoAtual.grupoAdicionais : [];
    selecoes = extras.map(grp => grp.obrigatorio ? null : new Set());
    extras.forEach((grupo, gi) => {
      const el = criarGrupo(grupo.nome || 'Personalize seu produto', !!grupo.obrigatorio, Array.isArray(grupo.opcoes)?grupo.opcoes:[], !grupo.obrigatorio,
        (oi, checked) => {
          if (grupo.obrigatorio) selecoes[gi] = oi;
          else if (checked) selecoes[gi].add(oi);
          else selecoes[gi].delete(oi);
        });
      el.dataset.index = String(gi);
      el.querySelectorAll('input').forEach(x => x.name = `pdpR1_extras_${gi}`);
      adicionaisEl.appendChild(el);
    });
  }

  function totalExtras() {
    const grupos = typeof adicionaisAtivo !== 'undefined' && adicionaisAtivo === true && Array.isArray(produtoAtual.grupoAdicionais)
      ? produtoAtual.grupoAdicionais : [];
    let soma = 0;
    grupos.forEach((grupo, gi) => {
      const escolhidos = grupo.obrigatorio ? (Number.isInteger(selecoes[gi]) ? [selecoes[gi]] : []) : [...(selecoes[gi] || [])];
      escolhidos.forEach(oi => { soma += Math.max(0, Number(grupo.opcoes?.[oi]?.preco) || 0); });
    });
    return soma;
  }
  function atualizarTotal() {
    if (!produtoAtual) return;
    id('qtd').value = quantidade;
    id('qtd').textContent = quantidade;
    const botao = id('adicionar');
    const ativo = disponivel(produtoAtual);
    botao.disabled = !ativo;
    botao.textContent = ativo
      ? `Adicionar · ${dinheiro(((Number(produtoAtual.preco)||0) + totalExtras())*quantidade)}`
      : 'Produto indisponível no momento';
  }

  function abrir(produto, card, gatilho) {
    if (!produto || !produto.nome || produto.escondido) return;
    montarEstrutura();
    produtoAtual = produto;
    assinaturaAbertura = JSON.stringify({variantes:produto.variantes||[],grupos:produto.grupoAdicionais||[]});
    origem = gatilho || card;
    rolagemAnterior = window.scrollY;
    quantidade = Math.min(99, Math.max(1, Number(card?.querySelector('.qtd-valor')?.textContent)||1));
    const variantes = Array.isArray(produto.variantes) ? produto.variantes : [];
    const valorVarianteSelecionado = card?.querySelector('.variante-pill.selecionada')?.dataset.variante;
    variante = valorVarianteSelecionado ? variantes.findIndex(v => String(v)===String(valorVarianteSelecionado)) : null;
    if (variante === -1) variante = null;
    fotoIndice = 0; sucesso = false;
    id('nome').textContent = escapar(produto.nome);
    id('descricao').textContent = escapar(produto.descricao || 'Feito com carinho, especialmente para você.');
    id('precoBase').textContent = dinheiro(produto.preco);
    id('obs').value = '';
    id('erro').textContent = '';
    id('avisoDisponibilidade').hidden = disponivel(produto);
    id('avisoDisponibilidade').textContent = produto.disponivel===false?'Produto esgotado no momento.':'Este produto está fora do horário de atendimento.';
    id('corpo').hidden = false;
    id('rodape').hidden = false;
    id('concluido').hidden = true;
    atualizarFoto(); renderizarEscolhas(); atualizarTotal();
    dialogo.showModal();
    id('voltar').focus({preventScroll:true});
  }

  function restaurarFoco() {
    const ant = origem;
    origem = null; produtoAtual = null;
    if (ant && ant.isConnected && typeof ant.focus === 'function') {
      ant.focus({preventScroll:true});
    }
    if (Number.isFinite(rolagemAnterior) && Math.abs(window.scrollY-rolagemAnterior)>3) window.scrollTo(0, rolagemAnterior);
  }
  function fechar() { if (dialogo && dialogo.open) dialogo.close(); }
  function aviso(s) { id('erro').textContent = s; }

  function confirmar() {
    if (!produtoAtual || sucesso) return;
    const atual = produtoAtualizado();
    if (!atual || !disponivel(atual)) { aviso('Este produto não está disponível agora. Volte ao cardápio para atualizar.'); return; }
    const oldGroups = Array.isArray(produtoAtual.grupoAdicionais) ? produtoAtual.grupoAdicionais : [];
    const newGroups = Array.isArray(atual.grupoAdicionais) ? atual.grupoAdicionais : [];
    if (assinaturaAbertura!==JSON.stringify({variantes:atual.variantes||[],grupos:newGroups})) {
      aviso('As opções deste produto foram atualizadas. Volte ao cardápio para escolher novamente.'); return;
    }
    const variantes = Array.isArray(atual.variantes) ? atual.variantes : [];
    if (variantes.length && (variante == null || !variantes[variante])) { aviso('Escolha um sabor ou opção para continuar.'); id('variantes').querySelector('input')?.focus(); return; }
    const grupos = typeof adicionaisAtivo !== 'undefined' && adicionaisAtivo && Array.isArray(atual.grupoAdicionais) ? atual.grupoAdicionais : [];
    for (let gi=0;gi<grupos.length;gi++) {
      if (grupos[gi].obrigatorio && !Number.isInteger(selecoes[gi])) {
        aviso(`Escolha uma opção em “${grupos[gi].nome}” para continuar.`);
        id('adicionais').children[gi]?.querySelector('input')?.focus();
        return;
      }
    }
    const anotacao = id('obs').value.trim();
    const observacao = variantes.length ? (anotacao ? `${variantes[variante]} · Obs.: ${anotacao}` : String(variantes[variante])) : anotacao;
    const gruposSelecionados = [];
    const partes = [];
    grupos.forEach((g,gi) => {
      const indices = g.obrigatorio ? [selecoes[gi]] : [...(selecoes[gi]||[])];
      indices.forEach(oi => {
        const opcao = g.opcoes?.[oi]; if (!opcao) return;
        partes.push((g.obrigatorio?'':'+ ') + opcao.nome);
      });
      gruposSelecionados.push({grupoIndex:gi,opcaoIndices:indices});
    });
    if (atual.disponivelParaEncomenda && (!dataEncomendaEscolhida || !horaEncomendaEscolhida)) {
      aviso('Para encomendas, confirme a data e o horário na seção Encomendas antes de adicionar.'); return;
    }
    const unidade=(Number(atual.preco)||0)+grupos.reduce((sum,g,gi)=>sum+(g.obrigatorio?[selecoes[gi]]:[...(selecoes[gi]||[])]).reduce((acc,oi)=>acc+Math.max(0,Number(g.opcoes?.[oi]?.preco)||0),0),0);
    if (typeof finalizarAdicaoAoCarrinho!=='function') { aviso('Não foi possível adicionar agora. Recarregue o cardápio.'); return; }
    const resultado = finalizarAdicaoAoCarrinho(atual.id, atual.nome, unidade, quantidade, observacao, partes.join(', '), grupos.length?gruposSelecionados:null);
    if (!resultado?.adicionado) return;
    sucesso = true;
    id('concluidoResumo').textContent = `${resultado.quantidadeAdicionada} × ${atual.nome} adicionado ao seu pedido.`;
    id('corpo').hidden = true;
    id('rodape').hidden = true;
    id('concluido').hidden = false;
    id('continuar').focus({preventScroll:true});
  }

  // Escuta em captura para preservar a lógica aprovada dos botões do carrinho:
  // não executa o fluxo antigo nem abre lightbox simultaneamente ao detalhe.
  document.addEventListener('click', evento => {
    if (dialogo?.open) return;
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
    const alvo=evento.target;
    if (!(alvo instanceof Element)) return;
    const card=alvo.closest('.produto-item');
    if (!card) return;
    if (alvo.closest('.btn-copiar-link-produto,.carrossel-seta,.carrossel-dot,.variante-pill,.produto-quantidade-stepper,input,textarea,select,a')) return;
    const outroBotao = alvo.closest('button');
    if (outroBotao && !outroBotao.classList.contains('adicionar-carrinho')) return;
    if (outroBotao?.disabled) return;
    if (typeof produtos === 'undefined' || !Array.isArray(produtos)) return;
    const nome = card.querySelector('.adicionar-carrinho')?.dataset.nome || card.querySelector('h3')?.textContent;
    const pid = card.id?.startsWith('produto-') ? card.id.slice(8) : null;
    const p = (pid && produtos.find(x=>String(x.id)===pid)) || produtos.find(x=>x.nome===nome);
    if (!p) return;
    evento.preventDefault(); evento.stopImmediatePropagation();
    abrir(p,card,outroBotao || alvo);
  }, true);

  window.PedeAkiDetalhePremiumR1 = Object.freeze({versao:'R1-CANDIDATA',abrirProdutoPorId(idProduto) {
    if (typeof produtos === 'undefined' || !Array.isArray(produtos)) return false;
    const p = produtos.find(x=>String(x.id)===String(idProduto));
    if (!p) return false;
    abrir(p, document.querySelector('.produto-item[id="produto-'+String(idProduto).replace(/[^-a-zA-Z0-9_]/g,'')+'"]'), document.activeElement);
    return true;
  }});
})();
