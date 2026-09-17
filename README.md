# Norte · site

Versão web do aplicativo de finanças pessoais, com Supabase Auth, armazenamento privado e conexão bancária opcional pelo Meu Pluggy. Base inicial vazia. Layout adaptado a celular e computador.

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
6. No Supabase, em **Authentication → URL Configuration**, configure Site URL e Redirect URLs com `https://haker1707.github.io/finance-site-frontend/`. Ative o provedor de e-mail. Crie seu acesso no site e confirme o e-mail. Use o mesmo endereço configurado em `NORTE_OWNER_EMAIL` no backend. Após criar sua conta, você pode desativar novos cadastros no Supabase.

URL prevista: https://haker1707.github.io/finance-site-frontend/

Sem uma configuração pública no build, a publicação exibe “Configuração pendente”. O projeto atual já está configurado no workflow. Sem implantar o backend, o login pode funcionar, mas os registros não serão carregados. A URL acima só fica disponível depois que o Pages estiver ativado e o workflow concluir.

## Recursos

Lançamentos, categorias com criação dentro dos formulários, orçamento, cartões e parcelas, dívidas, contas, resumo anual, metas e aportes, reserva, patrimônio, simulador, conquistas, desejos, importação da planilha de referência, exportação CSV e backup JSON. Nenhuma planilha ou registro pessoal está neste repositório.

O site lê/grava os dados no Supabase; não funciona offline. Os registros são privados por usuário. Esta implantação é limitada ao e-mail do proprietário no servidor. Credenciais da Pluggy ficam somente nas Edge Function Secrets do Supabase.

## Conexão bancária

Conecte o Nubank no Meu Pluggy primeiro. Depois use **Conexão bancária → Conectar Meu Pluggy**. O servidor precisa das credenciais de uma aplicação Development com conector 200 habilitado. Leia os passos completos no backend.

Compras confirmadas no cartão e salários identificados são lançados automaticamente. Pix, transferências, pagamentos de faturas e demais créditos precisam de classificação. Estornos de despesa reduzem a despesa. Pagamentos de fatura e transferências não alteram novamente o saldo calculado. Pendências do banco aparecem na lista sem entrar nos totais. Compras manuais anteriores à conexão precisam de conciliação pelo usuário.

## Desenvolvimento

Node 22 ou superior:

```sh
npm ci --prefix web
npm run build --prefix web
```

Sirva `web/dist` por HTTP/HTTPS. As variáveis de ambiente públicas são lidas no build. Dependências ficam no lockfile. O build reutiliza `ui`, as regras de `core/finance.cjs` e a leitura de planilhas de `core/importer.cjs`.

Não foram executados testes desta versão, por solicitação do usuário. Compilar os arquivos não confirma o funcionamento de login, persistência ou conexão bancária em produção.

