# VerdeJá

Marketplace de verduras, hortaliças e produtos frescos.

## Regras já configuradas
- Todas as cidades podem cadastrar clientes, vendedores e entregadores.
- Frete grátis para pedidos acima de R$ 30,00.
- Para pedidos até R$ 30,00, o frete é calculado e limitado a R$ 10,00.
- Comissão padrão da plataforma: 10%.
- O vendedor escolhe os meios de pagamento que aceita: Pix, cartão de crédito e/ou cartão de débito.
- O vendedor pode cadastrar dados de recebimento (chave Pix ou conta bancária).
- Checkout registra o método escolhido.
- Estrutura pronta para integração de um gateway real (Mercado Pago, Stripe, Pagar.me etc.). Sem credenciais de gateway, o modo atual é de demonstração e não cobra cartão/Pix de verdade.
- PWA: pode ser instalado na tela inicial do celular.

## Rodar
1. Instale Node.js 20+.
2. `npm install`
3. Copie `.env.example` para `.env` e altere as credenciais.
4. `npm start`
5. Abra `http://localhost:3000`.

## Produção
Use HTTPS e um banco persistente (PostgreSQL recomendado) antes de operar em escala. Em hospedagens com disco efêmero, o `data/db.json` não deve ser usado como banco definitivo.

## Deploy no Render
- Crie um Web Service apontando para este projeto.
- Build Command: `npm install`
- Start Command: `npm start`
- Adicione as variáveis do `.env` no painel.
- Depois adicione `www.verdurasverdeja.com.br` em Custom Domains.
- No Registro.br, configure os DNS exatamente conforme os registros mostrados pelo Render.

## Login inicial
O administrador é criado automaticamente com:
- e-mail: valor de ADMIN_EMAIL (padrão `admin@verdeja.com.br`)
- senha: valor de ADMIN_PASSWORD (padrão `troque-esta-senha`)

Altere a senha antes de publicar.
