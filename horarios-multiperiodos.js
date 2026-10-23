/* PedeAki/Brit's — horários com até 3 períodos por dia.
 * Somente regras de apresentação/funcionamento: NÃO envia notificações ou pagamentos.
 * Contrato compatível: { aberto, abre, fecha, periodos?: [{abre,fecha}, ...] }.
 * Campos legados abre/fecha representam APENAS o primeiro período.
 */
(function (global) {
    'use strict';
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
    const minutos = value => HHMM.test(String(value || ''))
        ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
    function validarPeriodos(periodos) {
        if (!Array.isArray(periodos) || periodos.length < 1 || periodos.length > 3)
            throw Error('Defina entre 1 e 3 períodos.');
        let fimAnterior = -1;
        return periodos.map((p, index) => {
            const abre = String(p && p.abre || '');
            const fecha = String(p && p.fecha || '');
            const inicio = minutos(abre), fim = minutos(fecha);
            if (inicio == null || fim == null || fim <= inicio)
                throw Error(`Período ${index + 1}: informe abertura e fechamento válidos no mesmo dia.`);
            if (inicio < fimAnterior)
                throw Error('Os períodos devem estar em ordem e não podem se sobrepor.');
            fimAnterior = fim;
            return { abre, fecha };
        });
    }
    function periodosDoDia(dia) {
        if (!dia || dia.aberto === false) return [];
        // Fail closed caso a configuração multi esteja malformada.
        try {
            return validarPeriodos(Array.isArray(dia.periodos) ? dia.periodos : [{ abre: dia.abre, fecha: dia.fecha }]);
        } catch (_) { return []; }
    }
    function intervaloAtual(dia, minutosAgora) {
        return periodosDoDia(dia).find(p => minutosAgora >= minutos(p.abre) && minutosAgora < minutos(p.fecha)) || null;
    }
    function proximoIntervalo(dia, minutosAgora) {
        return periodosDoDia(dia).find(p => minutosAgora < minutos(p.abre)) || null;
    }
    function ultimaAbertura(dia, minutosAgora) {
        const candidatos = periodosDoDia(dia).filter(p => minutos(p.abre) <= minutosAgora);
        return candidatos.length ? candidatos[candidatos.length - 1].abre : null;
    }
    function ultimoFechamento(dia, minutosAgora) {
        const candidatos = periodosDoDia(dia).filter(p => minutos(p.fecha) <= minutosAgora);
        return candidatos.length ? candidatos[candidatos.length - 1].fecha : null;
    }
    function horarioParaSalvar(aberto, periodos) {
        const validados = validarPeriodos(periodos);
        return { aberto: !!aberto, abre: validados[0].abre, fecha: validados[0].fecha,
            ...(validados.length > 1 ? { periodos: validados } : {}) };
    }
    const api = Object.freeze({ minutos, validarPeriodos, periodosDoDia, intervaloAtual,
        proximoIntervalo, ultimaAbertura, ultimoFechamento, horarioParaSalvar });
    global.PedeAkiHorarios = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
