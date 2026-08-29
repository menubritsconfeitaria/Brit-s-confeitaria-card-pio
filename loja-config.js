/**
 * CONFIGURAÇÃO DA LOJA
 * ====================
 * Esse é o ÚNICO arquivo que precisa mudar pra usar esse cardápio com outra loja.
 * Troque os valores abaixo pelos dados do cliente novo, salve, e o site inteiro
 * (cabeçalho, rodapé, redes sociais, mensagens de pedido, cores) se ajusta sozinho.
 *
 * O que NÃO muda aqui (precisa ser feito à parte, uma vez só, na hora de configurar
 * o cliente novo):
 *   - Criar um projeto novo no Firebase e colar a config dele em firebase-config.js
 *   - Publicar as regras de segurança do Firebase (Realtime Database)
 *   - Cadastrar os produtos, categorias e horários no painel admin
 *   - Se for usar notificação push: gerar uma VAPID_KEY nova (em script.js) e
 *     publicar a Cloud Function (functions/index.js) nesse projeto Firebase novo
 *   - Se for usar pagamento online: configurar a InfiniteTag em functions/loja-config.js
 */
const LOJA_CONFIG = {
    nome: "NOME DA LOJA AQUI",
    nomeCurto: "NOME CURTO AQUI",
    subtitulo: "Frase curta que aparece embaixo do nome, no cabeçalho.",
    cidade: "CIDADE-DO-CLIENTE/UF",
    logo: "logopng.png",
    whatsappPedidos: "55DDDNUMERO",
    instagramUrl: "",
    urlCardapio: "https://URL-DO-CARDAPIO-DESSE-CLIENTE/",
    corPrimaria: "#a0522d",
    corAccent: "#c9974c",
    anoCopyright: "2026"
};
