# Norte · site

Versão web do aplicativo de finanças pessoais, com Supabase Auth, armazenamento privado e conexão bancária opcional por Open Finance com Pluggy Connect. Base inicial vazia. Layout adaptado a celular e computador.

Backend privado: https://github.com/haker1707/fiance-backend

## Ativar o site

O workflow já contém a URL e a chave publicável do projeto `msyvyjuezujoxfeswyrx`. Não é necessário cadastrar essas duas variáveis novamente. As variáveis abaixo continuam disponíveis para trocar de projeto ou substituir a chave pública no futuro.

1. No Supabase, crie um projeto e guarde a senha do banco. Copie a **Project URL** e a **Publishable key** em Connect/API Keys. Não use `service_role` ou `sb_secret_` no frontend.
2. Neste repositório, abra **Settings → Secrets and variables → Actions → Variables**. Crie:
   - `NORTE_SUPABASE_URL`: URL HTTPS do projeto.
   - `NORTE_SUPABASE_PUBLISHABLE_KEY`: chave pública `sb_publishable_…` (ou a antiga `anon`).
3. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
4. Em **Actions → Publicar Norte → Run workflow**, publique o site.
5. Implante o backend conforme o README do repositório privado.
6. No Supabase, em **Authentication → URL Configuration**, configure Site URL e Redirect URLs com `https://haker1707.github.io/finance-site-frontend/`. Ative o provedor de e-mail. Crie seu acesso no site e confirme o e-mail. Cada cadastro confirmado possui sua própria área financeira. Configure SMTP próprio no Supabase para confirmações de usuários externos.

URL prevista: https://haker1707.github.io/finance-site-frontend/

Sem uma configuração pública no build, a publicação exibe “Configuração pendente”. O projeto atual já está configurado no workflow. Sem implantar o backend, o login pode funcionar, mas os registros não serão carregados. A URL acima só fica disponível depois que o Pages estiver ativado e o workflow concluir.

## Recursos

Lançamentos, categorias com criação dentro dos formulários, orçamento, cartões e parcelas, dívidas, contas, resumo anual, metas e aportes, reserva, patrimônio, simulador, conquistas, desejos, importação da planilha de referência, exportação CSV e backup JSON. Nenhuma planilha ou registro pessoal está neste repositório.

O site lê/grava os dados no Supabase; não funciona offline. O responsável pode autorizar consultores por e-mail em **Dados e preferências → Gerenciar consultores**. O consultor entra com seu próprio e-mail confirmado, aceita a autorização e recebe acesso somente de leitura. O responsável pode revogar o acesso. Criar um cadastro não concede acesso aos dados de outras pessoas. E-mails reais e permissões ficam somente no Supabase.

As sessões e os dados financeiros não são persistidos em localStorage, IndexedDB ou cache offline. Você precisa entrar novamente ao recarregar a página. Os dados ficam temporariamente na memória do navegador para exibição; downloads de CSV e backup continuam sendo ações explícitas. Credenciais da Pluggy ficam somente nas Edge Function Secrets do Supabase.

## Conexão bancária

No Norte, use **Conexão bancária → Conectar meu banco**, escolha a instituição e autorize o compartilhamento no banco. O usuário não precisa de conta Meu Pluggy, API ou códigos. É possível manter vários bancos, renovar ou remover vínculos e filtrar movimentações por conta/cartão.

O backend precisa de uma aplicação Pluggy habilitada para clientes reais e Open Finance, com credenciais privadas no Supabase. Novas conexões usam instituições brasileiras Open Finance disponíveis; cobertura e produtos dependem da Pluggy, do banco e do consentimento.

Se o usuário sair para o aplicativo do banco, o webhook registra a autorização pendente. Ao retornar ao Norte com a mesma conta, o servidor confere e recupera o vínculo. Pode ser necessário entrar novamente após um redirecionamento completo. O servidor não importa transações com o site fechado. As tentativas expiram em 24h ou podem ser canceladas. Conexões antigas do Meu Pluggy já vinculadas permanecem compatíveis.

Compras confirmadas no cartão e salários identificados são lançados automaticamente. Pix, transferências, pagamentos de faturas e demais créditos precisam de classificação. Estornos de despesa reduzem a despesa. Pagamentos de fatura e transferências não alteram novamente o saldo calculado. Pendências do banco aparecem na lista sem entrar nos totais. Compras manuais anteriores à conexão precisam de conciliação pelo usuário.

## Desenvolvimento

Node 22 ou superior:

```sh
npm ci --prefix web
npm run build --prefix web
```

Sirva `web/dist` por HTTP/HTTPS. As variáveis de ambiente públicas são lidas no build. Dependências ficam no lockfile. O build reutiliza `ui`, as regras de `core/finance.cjs` e a leitura de planilhas de `core/importer.cjs`.

Não foram executados testes desta versão, por solicitação do usuário. Compilar os arquivos não confirma o funcionamento de login, persistência ou conexão bancária em produção.

