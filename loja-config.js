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
 */
const LOJA_CONFIG = {
    // Nome completo da loja, como aparece no cabeçalho, título da aba e mensagens
    nome: "Brit's Confeitaria",

    // Versão curta do nome, usada em lugares menores (ex: "Clube Brit's")
    nomeCurto: "Brit's",

    // Frase que aparece embaixo do nome, no cabeçalho
    subtitulo: "Entrega ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos. (Provérbios 16:3) A Brit's Confeitaria nasceu assim: entregando cada sonho, cada receita e cada cliente nas mãos de Deus. Obrigada por fazer parte dessa história! 🙏🍰",

    // Cidade/região atendida pelo delivery — aparece no cabeçalho, ajuda o cliente
    // a confirmar rapidinho que está no lugar certo (deixe "" pra não mostrar)
    cidade: "COLATINA/ES",

    // Arquivo da logo (precisa estar na mesma pasta do index.html)
    logo: "logopng.png",

    // WhatsApp que recebe os PEDIDOS dos clientes (só números, com DDI 55 + DDD)
    whatsappPedidos: "5527997633871",

    // Link completo do Instagram da loja (deixe "" pra não mostrar o ícone)
    instagramUrl: "https://www.instagram.com/brites.doces/",

    // URL onde esse cardápio fica publicado (usada nas tags de compartilhamento)
    urlCardapio: "https://britsconfeitaria.com.br/",

    // Cores da marca (aceita qualquer cor CSS válida, ex: "#a0522d" ou "rgb(160,82,45)")
    corPrimaria: "#a0522d",
    corAccent: "#c9974c",

    // Ano mostrado no rodapé, junto com o nome da loja
    anoCopyright: "2026"
};
