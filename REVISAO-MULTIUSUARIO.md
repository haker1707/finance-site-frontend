# Revisão do Norte — 17/09/2026

Escopo: leitura de código, configuração do Supabase e fonte implantada da função `norte` (versão 4). Sem testes manuais/automatizados, login simulado, dados de exemplo ou importação de planilhas.

## Configuração confirmada

- RLS ativo nas quatro tabelas `norte_documents`, `norte_connections`, `norte_consultant_access` e `norte_bank_attempts`.
- `anon` não possui SELECT nessas tabelas. `authenticated` não possui INSERT, UPDATE ou DELETE.
- SELECT autenticado de documentos/conexões exige `auth.uid() = user_id`; autorizações de consultoria exigem `auth.uid() = owner_id`. Tentativas bancárias são exclusivas do servidor.
- `norte_commit` é SECURITY INVOKER, sem EXECUTE para anon/authenticated; as gravações passam pelo backend.
- O backend implantado valida `auth.getUser`, e-mail confirmado e propriedade da conta em cada requisição. O administrador da plataforma não recebe acesso geral às finanças.
- Consultoria exige autorização do titular, e-mail correspondente, aceite e ID do consultor; permite somente leitura. A revogação é conferida nas próximas requisições.
- Registros, configurações e importações ficam no documento Supabase do usuário. A interface só carrega o aplicativo financeiro após autenticação e seleção de conta. O código estático do GitHub Pages é público; os dados não estão nele.
- Sessões e dados financeiros ficam temporariamente na memória do navegador, sem persistência local; exportações explícitas continuam disponíveis.

## Melhorias publicadas nesta revisão

- Descarte de respostas de requisições iniciadas antes de sair ou trocar de conta.
- Limpeza de estado, arquivos selecionados, prévias de importação, filtros e diálogos na troca de conta/saída.
- Temas mármore preto/dourado claro e mármore branco/dourado escuro, com alternância também no login, controles de foco e regras responsivas.
- Aba bancária permanece bloqueada com Em breve e controles inertes. O bloqueio desta aba é de interface, não a remoção das APIs de integração.

## Limites da confirmação

Compilação e publicação não validam fluxos reais, aparência renderizada em dispositivos ou isolamento por execução. Nenhum desses testes foi realizado por instrução do titular. O SMTP para cadastros externos e a habilitação comercial da Pluggy continuam dependendo de configuração externa. Dados financeiros existentes não foram consultados ou modificados nesta revisão.
