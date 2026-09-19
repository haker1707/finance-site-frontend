# Norte Pro / Gestor Financeiro — primeira versão

## Arquitetura preservada

Identidade: Supabase Auth. Dados pessoais: norte_documents, uma linha por titular, documento JSON e revisão atômica. Relação profissional ↔ cliente: adaptação da tabela existente norte_consultant_access. Seus nomes legados e o papel consultant foram preservados para não invalidar acessos existentes. A interface e os novos serviços usam profissional, sem fixar mentor, consultor ou planejador como um único tipo obrigatório.

A relação já suporta N:N. Ativação de perfil ou papel de administrador não concede acesso a documentos alheios. Cada titular autoriza o e-mail, o destinatário aceita com sua conta confirmada, e cada leitura verifica novamente o vínculo. Só o titular concede e revoga. Não há escrita profissional nesta versão.

Não houve alteração de esquema, políticas RLS ou autenticação; não é necessária migração. O RLS continua restrito ao titular. Profissionais acessam somente pela Edge Function autenticada, que verifica consentimento no servidor. A leitura de um cliente sem documento não cria uma linha nova.

## Serviços e cálculos

professional-dashboard consulta vínculos do profissional autenticado; nomes vêm de norte_profiles apenas para acessos aceitos. Carrega até 20 documentos por página sequencialmente, sem retornar a carteira financeira completa. Revalida vínculos antes da resposta. professional-access confirma somente os clientes exibidos, a cada 15 segundos quando a tela está visível; a carteira é atualizada a cada minuto. Revogação bloqueia a próxima consulta; informação já vista não pode ser recolhida.

professional-summary.mjs é compartilhado entre frontend e backend. Usa finance.mjs, needsReview, invoiceState e installmentEstimates. selectPeriodRows também é usado pelo seletor de datas existente: débito por movimentação, crédito por vencimento. Pagamentos de fatura não viram despesas; estimativas permanecem separadas. Comparações usam intervalos de duração igual e indicam que ausência de dados não demonstra variação real.

Alertas: conferência pendente, categoria ausente, vínculo ambíguo de parcela, fatura vencida com saldo aberto confirmado, orçamento mensal de despesa excedido e meta vencida não atingida. Sem pontuação por IA, regra arbitrária de dados desatualizados ou reunião fictícia. A data de atualização é a de alteração do documento, não de sincronização bancária. Datas de referência de alertas são UTC, explicitadas na interface.

As capacidades de leitura atuais são explícitas; capacidades de escrita são falsas. A matriz é preparatória, não um editor de permissões granulares. Uma autorização atual permite leitura integral, como antes. Evolução granular deve aplicar projeção e validação no servidor antes de oferecer controles ao usuário.

## Limites da primeira versão

Indicadores de atenção/pendências/metas abrangem a página exibida (20 clientes), com rótulos explícitos. Total de clientes é geral. Busca por nome considera até 1.000 vínculos; carteiras maiores têm aviso. Não há resumo global persistido ou processamento pesado por carteira a cada consulta. Clientes sem nome têm identificação abreviada. Convites pendentes não expõem números financeiros.

Patrimônio: última posição de cada bem cadastrado até a data final. Resultado de período não é saldo bancário disponível. Próximos 30 dias mostram valores cadastrados e estimados separados; contas lembrete não são somadas novamente.

## Próximos módulos — não implementados

Planejamento: entidade vinculada ao grant/cliente/profissional, tipo aberto de objetivo, alvo, posição atual, aporte planejado, prazo, cálculo versionado e consentimento de escrita. Reaproveitar o motor e as metas existentes; nunca clonar lançamentos.

Acompanhamento: entidades próprias para reunião, nota, recomendação e tarefa, com autor, cliente, visibilidade explícita (privada do profissional ou compartilhada) e auditoria. Nada disso deve ser gravado dentro do documento pessoal acessível integralmente ao cliente. Notas privadas exigirão RLS de autoria; visibilidade compartilhada exige vínculo ainda vigente. Retenção após revogação precisa ser definida antes da implantação.

Preparar reunião: snapshot matemático versionado com período, revisão das fontes e última reunião real. IA poderá interpretar esse resultado, nunca substituir cálculos nem conceder acesso.

Organizações e empresas: adicionar no futuro um workspace de organização e associações próprias, com identificadores e escopos explícitos; não reutilizar owner_id de pessoa para representar empresa. Nenhum módulo empresarial foi criado.

## Entrega

Somente revisão de código/configurações, compilação e publicação. Sem testes automatizados ou manuais; sem movimentações, clientes ou convites fictícios; sem importação de arquivos financeiros. Validação em uso real permanece pendente.
