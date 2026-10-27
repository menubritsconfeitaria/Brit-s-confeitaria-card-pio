/* Brit's / PedeAki — PDV Premium de balcão, camada de interface.
 * Reutiliza cadastro e salvamento legados; não altera financeiro, estoque, Rules ou Functions.
 * Fonte canônica: Brit's main HEAD verificado antes da publicação.
 */
(() => {
  'use strict';
  const sec = document.querySelector('.gestao-subconteudo[data-subtab-content="sub-pedidos-manuais"]');
  if (!sec || document.getElementById('bpvRaiz')) return;
  const $ = id => document.getElementById(id);
  const moeda = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const telefoneChave = s => String(s || '').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  const centavos = entrada => {
    const s = String(entrada || '').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
    if (!s || !(/^\d+(?:[.,]\d{1,2})?$/.test(s) || /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s))) return null;
    const agrupado = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s);
    const num = Number(agrupado ? s.replace(/\./g,'').replace(',','.') : s.replace(',','.'));
    const cents = Math.round(num*100);
    return Number.isFinite(num) && Number.isSafeInteger(cents) && cents>=0 && cents<=100000000 ? cents : null;
  };
  const element = (tag, cls, str) => { const el=document.createElement(tag); if(cls) el.className=cls; if(str!=null) el.textContent=String(str); return el; };
  let escolhido = null, trava = false, termo = '', categoria='Todos';
  const raiz = element('section','bpv',null); raiz.id = 'bpvRaiz';
  raiz.innerHTML = `<div class="bpv-bar"><div><span class="bpv-overline">ATENDIMENTO ASSISTIDO · BALCÃO</span><h3>🧁 PDV Premium de Balcão</h3><p>Venda rápida integrada ao lançamento de pedidos existente.</p></div><div class="bpv-bar-acoes"><button type="button" class="bpv-outline" id="bpvNovo">↻ Novo atendimento</button><button type="button" class="bpv-outline" id="bpvClassico">Modo clássico</button></div></div>
  <div class="bpv-grade"><div class="bpv-card bpv-form">
   <div class="bpv-titulo"><span>01</span><div><strong>Identificação rápida</strong><small>Busque por nome ou telefone ou registre um cliente novo.</small></div></div>
   <div class="bpv-campos"><label>Cliente cadastrado (opcional)<input id="bpvBuscaCliente" type="search" autocomplete="off" placeholder="🔍 Nome ou telefone" aria-controls="bpvResultadosCliente" aria-expanded="false"><div id="bpvResultadosCliente" class="bpv-menu" hidden></div></label><label>Forma de pagamento<select id="bpvPagamento"><option value="">Selecionar</option><option>Dinheiro</option><option>Pix</option><option>Cartão de Crédito</option><option>Cartão de Débito</option><option>Transferência Bancária</option><option>Outros</option></select></label></div>
   <div class="bpv-clientes-acao"><button type="button" class="bpv-outline" id="bpvCadAbrir">+ Cadastrar cliente na hora</button><span id="bpvClienteSelecionado">Cliente balcão · sem cadastro</span></div>
   <div class="bpv-cadastro" id="bpvCadastro" hidden><div class="bpv-campos"><label>Nome *<input id="bpvCadNome" maxlength="100" autocomplete="off"></label><label>Telefone com DDD *<input id="bpvCadTel" inputmode="tel" maxlength="20" placeholder="(27) 99999-9999"></label></div><label>Endereço (opcional para balcão)<input id="bpvCadEnd" maxlength="240" placeholder="Rua, número, bairro"></label><div class="bpv-clientes-acao"><button type="button" class="bpv-main" id="bpvCadSalvar">Cadastrar e selecionar</button><button type="button" class="bpv-outline" id="bpvCadFechar">Cancelar</button></div><p id="bpvCadMsg" role="status"></p></div>
   <div class="bpv-separador"></div><div class="bpv-titulo"><span>02</span><div><strong>Adicionar produtos</strong><small>Utiliza os preços das fichas técnicas cadastradas.</small></div></div>
   <input id="bpvBuscaProduto" class="bpv-pesquisa" type="search" placeholder="🔎 Buscar produto..."><div class="bpv-categorias" id="bpvCategorias"></div><div class="bpv-produtos" id="bpvProdutos"></div>
   <div class="bpv-separador"></div><div class="bpv-titulo"><span>03</span><div><strong>Observação geral</strong><small>Preferências, retirada ou orientações da venda.</small></div></div><textarea id="bpvObs" rows="3" placeholder="Observações (opcional)"></textarea>
   <p class="bpv-nota">Encomendas com sinal e edição de pedidos existentes permanecem disponíveis no modo clássico.</p>
  </div><aside class="bpv-card bpv-resumo"><div class="bpv-resumo-cab"><span>RESUMO EM TEMPO REAL</span><h3>Pedido atual <b id="bpvItensNum">0 itens</b></h3></div><div id="bpvItens" class="bpv-itens"></div><div class="bpv-totais"><div><span>Cliente</span><strong id="bpvResumoCliente">Cliente balcão</strong></div><div id="bpvLinhaTelefone" hidden><span>Telefone</span><strong id="bpvResumoTelefone">—</strong></div><div><span>Subtotal</span><strong id="bpvSubtotal">R$ 0,00</strong></div><div><span>Atendimento</span><strong>🏪 Balcão · retirada</strong></div><div class="bpv-total"><span>Total</span><strong id="bpvTotal">R$ 0,00</strong></div>
   <div id="bpvDinheiro" class="bpv-dinheiro" hidden><label>💵 Valor recebido em dinheiro<input id="bpvRecebido" inputmode="decimal" placeholder="Ex.: 50,00"></label><button type="button" class="bpv-outline" id="bpvExato">Valor exato</button><p id="bpvTroco" role="status">Informe o valor recebido.</p></div>
   <button type="button" class="bpv-main bpv-finalizar" id="bpvSalvar" disabled>Registrar pedido no painel</button><p id="bpvStatus" role="status" aria-live="polite"></p><small class="bpv-nota">O registro usa o lançamento original da Brit's. O troco é informativo e não confirma recebimento no financeiro.</small>
   </div></aside></div>`;
  const local = sec.querySelector('.lancar-pedido-layout');
  if (!local) return;
  local.before(raiz);
  sec.classList.add('bpv-ativo');
  const titulo = $('bpvStatus');
  const somar = () => (typeof tempItensPedidoManual==='undefined' ? 0 : tempItensPedidoManual.reduce((s,it)=>s+(Number(it.preco)||0)*(Number(it.quantidade)||0),0));
  const formatarCliente = c => c ? c.nome : 'Cliente balcão';
  function atualizarCliente(){ $('bpvResumoCliente').textContent=formatarCliente(escolhido); $('bpvClienteSelecionado').textContent=escolhido ? '✓ '+escolhido.nome+' · cadastro selecionado':'Cliente balcão · sem cadastro';$('bpvLinhaTelefone').hidden=!(escolhido?.telefone);$('bpvResumoTelefone').textContent=escolhido?.telefone || '—'; }
  function clientes(){return (typeof clientesGestao!=='undefined' && Array.isArray(clientesGestao)) ? clientesGestao : [];}
  function pesquisaCliente(){ const box=$('bpvResultadosCliente'), q=norm($('bpvBuscaCliente').value);box.replaceChildren();if(!q){box.hidden=true;$('bpvBuscaCliente').setAttribute('aria-expanded','false');return;}const found=clientes().filter(c=>norm(c.nome).includes(q)||telefoneChave(c.telefone).includes(telefoneChave(q) || '\0')).slice(0,12);if(!found.length){box.append(element('div','bpv-vazio','Nenhum cliente encontrado. Pode cadastrar na hora.'));}else found.forEach(c=>{const b=element('button','bpv-cliente-item',c.nome+(c.telefone?' · '+c.telefone:''));b.type='button';b.addEventListener('click',()=>selecionarCliente(c));box.append(b)});box.hidden=false;$('bpvBuscaCliente').setAttribute('aria-expanded','true'); }
  function selecionarCliente(c){escolhido=c;$('bpvBuscaCliente').value=c.nome;$('bpvResultadosCliente').hidden=true;$('bpvBuscaCliente').setAttribute('aria-expanded','false');$('bpvCadastro').hidden=true;atualizarCliente();titulo.textContent='';}
  $('bpvBuscaCliente').addEventListener('input',()=>{escolhido=null;atualizarCliente();pesquisaCliente();});
  $('bpvBuscaCliente').addEventListener('focus',pesquisaCliente);
  $('bpvBuscaCliente').addEventListener('keydown', e=>{if(e.key==='Escape')$('bpvResultadosCliente').hidden=true;});
  document.addEventListener('click',e=>{if(!e.target.closest('#bpvBuscaCliente')&&!e.target.closest('#bpvResultadosCliente'))$('bpvResultadosCliente').hidden=true;});
  $('bpvCadAbrir').addEventListener('click',()=>{$('bpvCadastro').hidden=false;$('bpvCadNome').value=escolhido?.nome||'';$('bpvCadTel').value=escolhido?.telefone||'';$('bpvCadEnd').value=escolhido?.endereco||'';$('bpvCadNome').focus();});
  $('bpvCadFechar').addEventListener('click',()=>{$('bpvCadastro').hidden=true;});
  $('bpvCadSalvar').addEventListener('click',async()=>{
    if (trava) return;
    const nome=$('bpvCadNome').value.trim(), telefone=$('bpvCadTel').value.trim(), endereco=$('bpvCadEnd').value.trim(), chave=telefoneChave(telefone);
    const msg=$('bpvCadMsg');
    if (!nome || !/^[1-9]\d{9,10}$/.test(chave)){msg.textContent='Informe nome e telefone válido com DDD.';return;}
    const existente=clientes().find(c=>telefoneChave(c.telefone)===chave);
    if(existente){selecionarCliente(existente);msg.textContent='Telefone já cadastrado. Usamos o cliente existente.';return;}
    if(typeof crmGestaoCompleta==='undefined'||!crmGestaoCompleta){msg.textContent='Cadastro completo indisponível neste plano. Use o CRM autorizado ou o modo clássico.';return;}
    if(typeof obterOuCriarClienteGestaoPorNome!=='function'){msg.textContent='Cadastro de clientes indisponível.';return;}
    trava=true; $('bpvCadSalvar').disabled=true;msg.textContent='Cadastrando...';
    try {const c=await obterOuCriarClienteGestaoPorNome(nome,telefone);
      if(!c?.id) throw Error('Cadastro não confirmado.');
      if(endereco){ if(typeof db==='undefined'||!crmGestaoCompleta)throw Error('Permissão de CRM não confirmada.'); await db.ref('clientesGestao/'+c.id+'/endereco').set(endereco); }
      selecionarCliente({...c,nome,telefone,endereco:endereco||c.endereco||null});msg.textContent='Cliente cadastrado e selecionado.';
    }catch(e){msg.textContent='Não foi possível cadastrar: '+(e.message||'verifique o CRM.');}
    finally{trava=false;$('bpvCadSalvar').disabled=false;}
  });
  function catalogo(){return typeof fichaTecnica!=='undefined'&&Array.isArray(fichaTecnica)?fichaTecnica:[];}
  function filtros(){const cats=['Todos',...new Set(catalogo().map(p=>p.categoria).filter(Boolean))].slice(0,12);if(!cats.includes(categoria))categoria='Todos';$('bpvCategorias').replaceChildren();cats.forEach(c=>{const b=element('button','bpv-chip'+(categoria===c?' ativo':''),c);b.type='button';b.addEventListener('click',()=>{categoria=c;filtros();produtos();});$('bpvCategorias').append(b)});}
  function produtos(){const l=$('bpvProdutos');l.replaceChildren();const found=catalogo().filter(p=>(categoria==='Todos'||p.categoria===categoria)&&norm(p.nome).includes(norm(termo))).slice(0,80);if(!found.length){l.append(element('p','bpv-vazio','Nenhum produto disponível na ficha técnica.'));return;}found.forEach(p=>{const b=element('button','bpv-produto');b.type='button';const a=element('span','',p.nome);const preco = typeof calcularCustoFichaTecnica==='function' ? calcularCustoFichaTecnica(p).precoVenda : null;
  const v=element('strong','',Number.isFinite(Number(preco))?moeda(preco):'A conferir');b.append(a,v);b.addEventListener('click',()=>adicionar(p));l.append(b);});}
  $('bpvBuscaProduto').addEventListener('input',e=>{termo=e.target.value;produtos();});
  function adicionar(p){if(trava)return;if(typeof adicionarItemPedidoManual!=='function'){titulo.textContent='Módulo de lançamento indisponível.';return;}const sel=$('pmSelectProduto'),qtd=$('pmQtdItem');if(!sel||!qtd)return;sel.value=String(p.id);if(sel.value!==String(p.id)){if(typeof popularSelectProdutoPedidoManual==='function')popularSelectProdutoPedidoManual();sel.value=String(p.id);}if(sel.value!==String(p.id)){titulo.textContent='Produto não disponível no seletor original.';return;}qtd.value='1';adicionarItemPedidoManual();atualizarItens();}
  function atualizarItens(){ const lista=$('bpvItens');lista.replaceChildren();const itens=typeof tempItensPedidoManual!=='undefined'?tempItensPedidoManual:[];if(!itens.length)lista.append(element('p','bpv-vazio','🛒 Escolha um produto para começar.'));itens.forEach((it,i)=>{const row=element('div','bpv-item');const label=element('span','',it.nome);const val=element('strong','',moeda(Number(it.preco)*Number(it.quantidade)));const controles=element('div','bpv-controles');const menos=element('button','','−'),qt=element('b','',String(it.quantidade)),mais=element('button','','+'),rem=element('button','bpv-remover','Remover');[menos,mais,rem].forEach(x=>x.type='button');menos.addEventListener('click',()=>alterarQtd(i,-1));mais.addEventListener('click',()=>alterarQtd(i,1));rem.addEventListener('click',()=>alterarQtd(i,-Infinity));controles.append(menos,qt,mais,rem);row.append(label,val,controles);lista.append(row)});const total=somar();$('bpvSubtotal').textContent=moeda(total);$('bpvTotal').textContent=moeda(total);$('bpvItensNum').textContent=itens.length+' '+(itens.length===1?'item':'itens');troco();}
  function alterarQtd(i,delta){if(trava)return;const it=typeof tempItensPedidoManual!=='undefined'?tempItensPedidoManual[i]:null;if(!it)return;const q=Number(it.quantidade)+delta;if(q<=0){if(typeof removerItemPedidoManual==='function')removerItemPedidoManual(i);else tempItensPedidoManual.splice(i,1);}else if(Number.isFinite(q)&&q<=999){it.quantidade=q;}if(typeof renderItensPedidoManual==='function')renderItensPedidoManual();atualizarItens();}
  function troco(){const dinheiro=$('bpvPagamento').value==='Dinheiro';$('bpvDinheiro').hidden=!dinheiro;const total=Math.round(somar()*100),recebido=centavos($('bpvRecebido').value),falta=dinheiro&&(recebido===null||recebido<total);if(dinheiro){$('bpvTroco').textContent=recebido===null?'Informe quanto o cliente entregou.':recebido<total?'Faltam '+moeda((total-recebido)/100):'Troco a devolver: '+moeda((recebido-total)/100);$('bpvTroco').dataset.state=falta?'incompleto':'ok';} $('bpvSalvar').disabled=trava||!(typeof tempItensPedidoManual!=='undefined'&&tempItensPedidoManual.length)||falta;return {dinheiro,total,recebido,falta};}
  $('bpvPagamento').addEventListener('change',troco);$('bpvRecebido').addEventListener('input',troco);$('bpvExato').addEventListener('click',()=>{$('bpvRecebido').value=Number(somar()).toFixed(2).replace('.',',');troco()});
  function mostrarClassico(){sec.classList.remove('bpv-ativo');$('bpvClassico').textContent='Voltar ao PDV Premium';}
  $('bpvClassico').addEventListener('click',()=>{const ativo=sec.classList.toggle('bpv-ativo');$('bpvClassico').textContent=ativo?'Modo clássico':'Voltar ao PDV Premium';if(ativo){filtros();produtos();atualizarItens();}});
  const hist=$('listaPedidosManuais');if(hist)hist.addEventListener('click',e=>{if(e.target.closest('[title="Editar"]')) mostrarClassico();},true);
  function novo(){if(trava)return;if(typeof editingPedidoManualId!=='undefined' && editingPedidoManualId){mostrarClassico();titulo.textContent='Conclua a edição do pedido existente no modo clássico antes de iniciar outro atendimento.';return;}if((typeof tempItensPedidoManual!=='undefined'&&tempItensPedidoManual.length||$('bpvObs').value.trim())&&!window.confirm('Descartar o atendimento atual e começar outro?'))return; if(typeof tempItensPedidoManual!=='undefined')tempItensPedidoManual=[];if(typeof renderItensPedidoManual==='function')renderItensPedidoManual();escolhido=null;['bpvBuscaCliente','bpvObs','bpvRecebido','bpvBuscaProduto'].forEach(id=>$(id).value='');$('bpvPagamento').value='';$('bpvCadastro').hidden=true;titulo.textContent='';atualizarCliente();atualizarItens();}
  $('bpvNovo').addEventListener('click',novo);
  $('bpvSalvar').addEventListener('click',()=>{
    if(trava||typeof salvarPedidoManual!=='function')return;
    if(typeof editingPedidoManualId!=='undefined' && editingPedidoManualId){mostrarClassico();titulo.textContent='Há um pedido em edição. Conclua ou cancele essa edição no modo clássico antes de abrir outra venda.';return;}
    const m=troco();if(!tempItensPedidoManual.length||m.falta)return;
    if(!escolhido&&$('bpvBuscaCliente').value.trim()){titulo.textContent='Selecione um cadastro da lista ou apague a busca para cliente balcão.';return;}
    const nome=escolhido?.nome||'';
    const homonimos=clientes().filter(c=>norm(c.nome)===norm(nome));
    if(escolhido&&homonimos.length>1){titulo.textContent='Há clientes com o mesmo nome. Use o modo clássico e confira a identidade antes de salvar.';return;}
    // O cadastro selecionado precisa continuar conhecido pela lista operacional.
    if(escolhido&&!homonimos.some(c=>c.id===escolhido.id)){titulo.textContent='Aguarde a sincronização do cliente cadastrado antes de registrar.';return;}
    const forma=$('bpvPagamento').value;if(!forma){titulo.textContent='Selecione a forma de pagamento.';return;}
    const obs=$('bpvObs').value.trim();const trocoTexto=m.dinheiro?'Dinheiro recebido: '+moeda(m.recebido/100)+' · Troco: '+moeda((m.recebido-m.total)/100):'';
    $('pmCliente').value=nome;$('pmFormaPagamento').value=forma;$('pmObs').value=[obs,trocoTexto].filter(Boolean).join('\n');$('pmDesconto').value='0';$('pmFrete').value='0';$('pmStatus').value='pendente';
    // Nunca modificar estado de pagamento/estoque: usa salvarPedidoManual da Brit's.
    trava=true;titulo.textContent='Registrando pedido...';troco();
    const estado=$('msgPedidoManual');if(!estado){trava=false;troco();titulo.textContent='Formulário original indisponível.';return;}
    const obsMudanca=new MutationObserver(()=>{
      const texto=estado.textContent.trim();if(!/^(Pedido salvo!|Erro ao salvar:|Erro ao atualizar:|Cadastro do cliente não confirmado\.)/i.test(texto))return;
      obsMudanca.disconnect();trava=false;
      if(texto==='Pedido salvo!'){escolhido=null;['bpvBuscaCliente','bpvObs','bpvRecebido'].forEach(id=>$(id).value='');$('bpvPagamento').value='';atualizarCliente();atualizarItens();titulo.textContent='✓ Pedido registrado no painel.';}
      else{titulo.textContent=texto;troco();}
    });obsMudanca.observe(estado,{childList:true,subtree:true,characterData:true});
    try{salvarPedidoManual();}catch(err){obsMudanca.disconnect();trava=false;titulo.textContent='Não foi possível registrar: '+err.message;troco();}
  });
  // A escuta de ficha técnica original alimenta o PDV assim que o painel é aberto.
  sec.addEventListener('click',e=>{if(e.target.closest('[data-subtab]')){filtros();produtos();}},true);
  document.addEventListener('click',e=>{if(e.target.closest('[data-subtab="sub-pedidos-manuais"], [data-subtab-target="sub-pedidos-manuais"]'))queueMicrotask(()=>{filtros();produtos();atualizarItens();});},true);
  atualizarCliente();filtros();produtos();atualizarItens();
  window.BritsPDVPremium = Object.freeze({versao:'BALCAO-R1',atualizarCatalogo(){filtros();produtos();atualizarItens();}});
})();
