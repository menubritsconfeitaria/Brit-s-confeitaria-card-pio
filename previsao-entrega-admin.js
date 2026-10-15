/* PedeAki | Previsão simples de entrega | Candidata local | Sem escrita automática */
(() => {
  'use strict';
  const PATH = 'configuracao/loja/previsaoEntrega';
  const LIMITE = 360;
  const $ = id => document.getElementById(id);
  const ids = ['pedeakiPrazoAtivo', 'pedeakiPrazoMin', 'pedeakiPrazoMax', 'pedeakiPrazoSalvar'];
  let ref = null;
  let carregado = false;
  let original = null;
  let editando = false;
  let conflito = false;
  let salvando = false;

  // Firebase pode devolver os mesmos campos em outra ordem. Comparar estrutura,
  // não a ordem das chaves serializadas, sem perder a detecção de conflitos.
  function igual(a, b) {
    if (a === b || (a == null && b == null)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const chavesA = Object.keys(a).sort();
    const chavesB = Object.keys(b).sort();
    return chavesA.length === chavesB.length &&
      chavesA.every((chave, i) => chave === chavesB[i] && igual(a[chave], b[chave]));
  }
  const intervaloValido = (min, max) => Number.isSafeInteger(min) && Number.isSafeInteger(max)
    && min >= 5 && max >= min && max <= LIMITE;
  // Só expõe categorias técnicas conhecidas; nunca credenciais, IDs ou detalhes internos.
  function diagnosticarErro(erro, operacao) {
    const raw = typeof erro?.code === 'string' ? erro.code.toLowerCase() : '';
    const codigo = raw.replace(/^[a-z]+\//, '').replace(/-/g, '_');
    if (codigo === 'permission_denied')
      return `Firebase negou permissão (${operacao}: PERMISSION_DENIED). Nenhum salvamento confirmado; confira Auth e Rules com segurança.`;
    if (['disconnected', 'network_error', 'unavailable', 'timeout'].includes(codigo))
      return `Conexão indisponível (${operacao}: ${codigo.toUpperCase()}). Nenhum salvamento confirmado; tente recarregar quando a conexão voltar.`;
    return `Falha na ${operacao} (causa não identificada). Nenhum salvamento confirmado; não altere as Rules sem diagnóstico.`;
  }
  function previaPendente(estado) {
    const elemento = $('pedeakiPrazoPreviaEstado');
    if (elemento) elemento.textContent = estado ? 'PRÉVIA LOCAL — NÃO SALVA' : 'PRÉVIA DO CLIENTE';
  }
  function informar(texto, erro = false) {
    const el = $('pedeakiPrazoMensagem');
    if (el) { el.textContent = texto; el.dataset.estado = erro ? 'erro' : 'ok'; }
  }
  function camposHabilitados(permitir) {
    for (const id of ids) {
      const el = $(id);
      if (el) el.disabled = !permitir;
    }
  }
  function preencher(valor) {
    const c = valor && typeof valor === 'object' ? valor : {};
    $('pedeakiPrazoAtivo').checked = c.ativo === true;
    $('pedeakiPrazoMin').value = Number.isSafeInteger(c.minMinutos) ? String(c.minMinutos) : '30';
    $('pedeakiPrazoMax').value = Number.isSafeInteger(c.maxMinutos) ? String(c.maxMinutos) : '60';
    atualizarPrevia();
  }
  function lerFormulario() {
    const minTexto = $('pedeakiPrazoMin').value.trim();
    const maxTexto = $('pedeakiPrazoMax').value.trim();
    const min = /^\d+$/.test(minTexto) ? Number(minTexto) : NaN;
    const max = /^\d+$/.test(maxTexto) ? Number(maxTexto) : NaN;
    return { ativo: $('pedeakiPrazoAtivo').checked, minMinutos: min, maxMinutos: max };
  }
  function atualizarPrevia() {
    const elemento = $('pedeakiPrazoPrevia');
    if (!elemento) return;
    const dados = lerFormulario();
    elemento.textContent = !intervaloValido(dados.minMinutos, dados.maxMinutos)
      ? 'Informe um intervalo válido.'
      : dados.ativo ? `Entrega estimada: ${dados.minMinutos} a ${dados.maxMinutos} minutos`
        : 'Aviso desativado no cardápio';
  }
  function receber(snapshot) {
    const valor = snapshot.val();
    if (editando && !igual(valor, original)) {
      conflito = true;
      informar('A configuração foi alterada em outra sessão. Recarregue os valores antes de salvar.', true);
      return;
    }
    if (!editando) {
      original = valor;
      if (valor && valor.schemaVersion != null && valor.schemaVersion !== 1) {
        carregado = false;
        camposHabilitados(false);
        informar('Versão de configuração incompatível. Não foi alterada.', true);
        return;
      }
      carregado = true;
      camposHabilitados(true);
      preencher(valor);
      previaPendente(false);
      informar('Configuração carregada. Salve somente quando quiser atualizar o cardápio.');
    }
  }
  function falhouLeitura(erro) {
    carregado = false;
    camposHabilitados(false);
    previaPendente(true);
    informar(diagnosticarErro(erro, 'leitura'), true);
  }
  function desvincular() {
    if (ref) ref.off('value', receber);
    ref = null;
    carregado = false; original = null; editando = false; conflito = false;
    camposHabilitados(false);
    informar('Aguardando acesso autorizado ao painel.');
  }
  async function salvar(evento) {
    evento.preventDefault();
    if (!ref || !carregado || conflito || salvando) {
      informar('Atualize os valores ou aguarde o carregamento antes de salvar.', true);
      return;
    }
    const dados = lerFormulario();
    if (!intervaloValido(dados.minMinutos, dados.maxMinutos)) {
      informar('Informe dois números inteiros entre 5 e 360, com o mínimo menor ou igual ao máximo.', true);
      return;
    }
    if (original && original.schemaVersion != null && original.schemaVersion !== 1) {
      informar('Configuração incompatível. Nenhuma alteração realizada.', true);
      return;
    }
    const esperado = original;
    const novo = { ...(esperado || {}), schemaVersion: 1, ...dados };
    if (igual(novo, esperado)) {
      editando = false;
      informar('Os valores já estão salvos.');
      return;
    }
    salvando = true;
    $('pedeakiPrazoSalvar').disabled = true;
    informar('Tentando salvar apenas a previsão; aguarde confirmação do Firebase...');
    try {
      // Transação apenas no nó deste recurso; aborta se outra sessão alterou o estado.
      const resultado = await ref.transaction(atual => {
        if (!igual(atual, esperado)) return;
        if (atual && atual.schemaVersion != null && atual.schemaVersion !== 1) return;
        return { ...(atual || {}), schemaVersion: 1, ...dados };
      }, undefined, false);
      if (!resultado.committed) {
        conflito = true;
        informar('Outra sessão alterou a configuração. Recarregue antes de salvar.', true);
        return;
      }
      const persistido = resultado.snapshot.val();
      if (!igual(persistido, novo)) {
        conflito = true;
        informar('O retorno não corresponde ao valor esperado. Verifique antes de tentar novamente.', true);
        return;
      }
      original = persistido;
      editando = false;
      conflito = false;
      preencher(persistido);
      previaPendente(false);
      informar('Previsão salva e confirmada! O aviso é atualizado no cardápio.');
    } catch (erro) {
      previaPendente(true);
      informar(diagnosticarErro(erro, 'gravação'), true);
    } finally {
      salvando = false;
      $('pedeakiPrazoSalvar').disabled = !carregado || conflito;
    }
  }
  function iniciar() {
    if (!$('pedeakiPrazoFormulario')) return;
    camposHabilitados(false);
    $('pedeakiPrazoFormulario').addEventListener('submit', salvar);
    $('pedeakiPrazoRecarregar').addEventListener('click', () => {
      if (!ref) return;
      editando = false;
      conflito = false;
      carregado = false;
      camposHabilitados(false);
      informar('Recarregando a configuração...');
      ref.once('value').then(receber).catch(falhouLeitura);
    });
    for (const id of ['pedeakiPrazoAtivo','pedeakiPrazoMin','pedeakiPrazoMax']) {
      const el = $(id);
      el.addEventListener('input', () => { editando = true; previaPendente(true); atualizarPrevia(); });
      el.addEventListener('change', () => { editando = true; previaPendente(true); atualizarPrevia(); });
    }
    if (typeof firebase === 'undefined' || !firebase.apps?.length || !firebase.auth) {
      informar('Firebase indisponível. Nenhuma gravação será realizada.', true);
      return;
    }
    firebase.auth().onAuthStateChanged(usuario => {
      desvincular();
      if (!usuario) return;
      ref = firebase.database().ref(PATH);
      ref.on('value', receber, falhouLeitura);
    }, falhouLeitura);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
