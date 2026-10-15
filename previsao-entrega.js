/* PedeAki | Cartão público de previsão aproximada, somente leitura. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let intervalo = null;
  function validar(valor) {
    if (!valor || valor.schemaVersion !== 1 || valor.ativo !== true) return null;
    const min = valor.minMinutos;
    const max = valor.maxMinutos;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 5 || max < min || max > 360) return null;
    return { min, max };
  }
  function lojaAtendendo() {
    const status = $('statusLojaBanner');
    return Boolean(status && status.classList.contains('loja-aberta')
      && !status.classList.contains('loja-pausada')
      && (typeof modoDemoAtivo === 'undefined' || !modoDemoAtivo));
  }
  function renderizar() {
    const vitrine = $('pedeakiPrevisaoVitrine');
    const checkout = $('pedeakiPrevisaoCheckout');
    if (!vitrine || !checkout) return;
    const disponivel = Boolean(intervalo && lojaAtendendo());
    const agendado = typeof dataEncomendaEscolhida !== 'undefined' && !!dataEncomendaEscolhida;
    vitrine.hidden = !disponivel || agendado;
    const area = $('areaEntrega');
    const entregaEscolhida = area && area.style.display !== 'none'
      && (typeof tipoEntregaAtual === 'undefined' || tipoEntregaAtual === 'entrega');
    checkout.hidden = !(disponivel && entregaEscolhida && !agendado);
    if (intervalo) {
      const frase = `${intervalo.min} a ${intervalo.max} minutos`;
      $('pedeakiPrevisaoVitrineTempo').textContent = frase;
      $('pedeakiPrevisaoCheckoutTempo').textContent = frase;
    }
  }
  function iniciar() {
    if (!$('pedeakiPrevisaoVitrine') || !$('pedeakiPrevisaoCheckout')) return;
    if (typeof firebase === 'undefined' || !firebase.apps?.length) return;
    const ref = firebase.database().ref('configuracao/loja/previsaoEntrega');
    ref.on('value', snapshot => { intervalo = validar(snapshot.val()); renderizar(); }, () => {
      intervalo = null; renderizar();
    });
    const status = $('statusLojaBanner');
    if (status && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(renderizar);
      obs.observe(status, { attributes: true, attributeFilter: ['class'] });
    }
    // A escolha entrega/retirada já é gerenciada pelo checkout aprovado.
    document.addEventListener('click', renderizar);
    document.addEventListener('change', renderizar);
    renderizar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
