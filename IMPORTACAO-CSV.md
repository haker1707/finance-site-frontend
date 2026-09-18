# Importação manual de extratos e faturas

Implementação inicial: CSV Nubank de conta (`Data,Valor,Identificador,Descrição`) e cartão (`date,title,amount`), com separador vírgula ou ponto e vírgula, campos entre aspas e valores com ponto ou vírgula decimal. Outros layouts podem ser mapeados explicitamente, com uma coluna de data, descrição, valor e identificador opcional. O cabeçalho deve estar na primeira linha e os valores em uma única coluna. Não há promessa de compatibilidade universal. Limites: 2 MB e 2.000 linhas por arquivo; o documento financeiro mantém seu limite de 30.000 registros e o limite de tamanho já existente.

O navegador lê o arquivo para conferência. O arquivo e as escolhas só são enviados ao servidor quando o titular confirma. Nenhum CSV original fica armazenado como arquivo; os registros preservam a origem da linha, hash e valores originais para rastreabilidade. O histórico de importações registra nome, data e quantidade.

## Persistência e acesso

`csv-import`, `recurring-save` e `recurring-remove` passam pela autenticação e pela autorização do titular na função Norte. Consultores permanecem somente leitura. O servidor lê apenas o documento do usuário autenticado, interpreta novamente o CSV, valida as escolhas e grava todo o lote através do compare-and-swap `norte_commit`. Um erro invalida o lote inteiro. Não há alteração de tabelas, de RLS nem de documentos existentes durante a publicação.

`csvKey` usa SHA-256. Na conta, usa o identificador Nubank; no cartão, usa cartão, data original, descrição normalizada, valor com sinal e ocorrência entre linhas idênticas. O mês selecionado não altera a identidade. Reimportações de registros ainda existentes são bloqueadas, inclusive após edição. Repetições sem ID bancário e possíveis correspondências com compras manuais exigem revisão explícita. Linhas idênticas no mesmo CSV recebem números de ocorrência; sem identificador do banco, um arquivo parcial com somente uma dessas linhas pode ser indistinguível de outro. Esse limite impede garantir deduplicação universal. Excluir um lançamento permite reimportá-lo; restaurar um backup restaura os hashes que ele contém.

Categorias existentes são sugeridas pelo histórico ou por palavras-chave; nomes novos só são criados na confirmação. Pix e créditos ambíguos exigem classificação. O servidor valida categoria/natureza, vínculo ao cartão, datas e centavos inteiros. Transferências entre contas próprias e pagamentos de fatura não entram novamente em despesas. Estornos reduzem despesas. Encargos podem ser classificados como despesas na conferência. Parcelas futuras de linhas CSV são estimadas em planos separados, sem gerar despesas confirmadas.

## Crédito, débito e análise

Entradas de cartão possuem `cardId` e `invoicePeriod`; `date` conserva a data original. A projeção do livro financeiro usa o mês da fatura para os totais mensais e oferece `originalDate` para exibição. A tela do cartão mostra somente seus registros; Contas e lançamentos mostra débito/receitas e demais lançamentos sem cartão. O painel geral, orçamento, gráficos e resumo anual usam o mesmo livro, com ambos os canais. O total da tela do cartão é compras menos estornos dos registros disponíveis, não uma reconciliação automática do saldo devido ao banco.

## Recorrências

A detecção usa descrição normalizada, mesma conta/cartão, uma ocorrência por mês, intervalo de 20–40 dias e diferença de valores de até 15%. Requer ao menos dois meses consecutivos. Descrições substancialmente diferentes não são agrupadas. Entradas parceladas e compras manuais com mais de uma parcela são excluídas; compras manuais de uma parcela podem participar. A sugestão precisa ser confirmada. Nome da previsão, valor, próxima data e status são editáveis; ignorar/cancelar ou remover não modifica gastos.

Regras são armazenadas em `data.recurringRules` no documento privado e incluídas no backup JSON. Previsões aparecem separadas dos gastos realizados. Cobrança registrada com a mesma chave e competência retira a previsão pendente do mês, sem gerar nem apagar lançamentos. Cartões referenciados por regras não podem ser excluídos até remover as previsões.

## Verificação desta entrega

Revisão de código, compilação e publicação. Não foram executados testes automatizados, testes manuais, importações de exemplos nem importações dos CSVs reais. A validação em uso real permanece pendente por instrução do titular. Conexão bancária continua bloqueada com “Em breve”; e-mail não foi integrado.

## Tolerância a formatos e revisão por linha

Valores aceitam espaços após sinais, sinal menos Unicode, R$, espaços invisíveis, agrupamento de milhares válido e negativos entre parênteses. A conversão usa centavos inteiros. No modo automático, valores ambíguos como um único separador seguido de três dígitos exigem correção; no mapeamento, o usuário pode declarar o separador decimal. Separadores malformados não são removidos indiscriminadamente.

Nubank mantém reconhecimento automático e identidades de duplicidade anteriores para registros válidos. Outros CSVs exigem identificação de colunas, banco, formato de data e separador decimal. A natureza permanece para escolha explícita, evitando presumir a convenção de sinais do banco. Vírgula, ponto e vírgula e tabulação são detectados fora das aspas do cabeçalho.

Erros recuperáveis de data, valor, descrição, identificador ou quantidade de colunas aparecem no registro, com valores originais. O usuário pode corrigir os campos e confirmar a correção, ou deixar o registro desmarcado e autorizar sua exclusão do lote. O servidor repete a interpretação, valida as correções e exige a autorização para pular linhas problemáticas. Linhas excluídas por erro ficam registradas no histórico da importação. Aspas sem fechamento e falhas estruturais que impedem delimitar registros continuam bloqueando o arquivo com mensagem específica.

Nenhuma importação real ou execução de testes foi realizada nesta correção. Compilação e revisão não substituem validação em uso real.

## Importação em lote e assinaturas

A seleção aceita até 30 CSVs, com até 2 MB e 2.000 registros por arquivo, 8 MB e 5.000 registros por lote. O usuário confirma a conta ou o mês da fatura de cada arquivo; datas no nome do arquivo só sugerem o mês. Cada CSV desconhecido possui seu próprio mapeamento. O lote é conferido junto, com nome do arquivo e competência ao lado das linhas.

Duplicidades são verificadas contra o histórico e entre arquivos. Repetições exatas do lote ficam bloqueadas na ocorrência posterior. O histórico combinado serve para sugerir a categoria Assinaturas em cobranças mensais semelhantes, excluindo parcelas; a categoria é editável e a previsão recorrente ainda exige confirmação própria. Filtros separam assinaturas sugeridas, demais categorias e itens pendentes, sem alterar a seleção.

A ação autenticada csv-batch processa os arquivos na memória do servidor e grava uma única revisão ao final. Um erro cancela todo o lote, sem importar apenas parte dele. Limites e validação por linha são repetidos no servidor. Arquivos sem lançamentos selecionados são anotados no histórico; linhas problemáticas excluídas exigem autorização.

Categorias solicitadas pelo titular foram acrescentadas somente à sua conta, sem alterar lançamentos nem criar categorias para outros usuários. Sem testes automatizados ou manuais e sem importação dos CSVs anexados.

## Categorização, histórico mensal e estimativas de parcelas

O módulo intelligence.mjs centraliza reconhecimento de estabelecimento, marcador de parcela, identidade de regras de categoria e conciliação. Sua cópia no frontend usa as mesmas regras do serviço. Despesas não reconhecidas sugerem Outros, mantendo naturezas distintas. Mercado Livre sugere Compras online; Mercado Pago é reconhecido como intermediário distinto. Estabelecimento não substitui a categoria. Regras explícitas do usuário têm precedência sobre sugestões automáticas e são armazenadas no documento privado em categoryRules.

A conferência permite aplicar uma categoria aos semelhantes do lote e salvar uma regra para importações futuras. Nos lançamentos, Categoria e regra permite mudar somente o item atual, confirmar a recategorização de itens semelhantes existentes e/ou salvar uma regra futura. O editor comum oferece essas opções depois de uma mudança de categoria. Nenhuma regra recategoriza retroativamente sem confirmação. A página Categorias permite remover regras sem mudar lançamentos.

Cartões exibem meses expansíveis, mantendo a data original. Os planos installmentPlans e installmentIgnored pertencem ao mesmo documento protegido e são incluídos no backup. A leitura calcula projeções sem gravar despesas nem mudar categorias existentes; importações e ajustes persistem os planos. A geração considera somente entradas reais de despesa com cardId, invoicePeriod e marcador explícito x/y ou Parcela x de y (2 a 120 parcelas). Cronogramas de compras cadastradas manualmente continuam com as regras existentes. A projeção avança a partir do mês da fatura observada e usa o vencimento configurado no cartão para a data estimada. Parcelas anteriores à primeira observada não são inventadas.

A conciliação automática exige uma única compra compatível no mesmo cartão, mesma descrição-base/estabelecimento, total de parcelas, número ainda não vinculado, mês esperado e valor exato em centavos. Só a cobrança real integra o livro financeiro; a estimativa vinculada deixa de aparecer. Divergências ou múltiplas compras compatíveis exigem confirmação na página do cartão. A ausência no CSV não cancela estimativas. O usuário pode vincular, declarar outra compra, manter só a cobrança real, ajustar uma previsão ou cancelar/reativar previsões. Alterações de previsões preservam as cobranças reais.

Totais mensais mostram confirmado/cadastrado, estimado e compromisso previsto. Diante de correspondências pendentes, o total combinado aguarda conferência para não apresentar uma soma potencialmente duplicada. Gráficos, orçamento e resumo anual existentes continuam usando apenas lançamentos e cronogramas cadastrados, sem incluir estas novas estimativas. Previsões de assinaturas são separadas.

Limitações: descrições substancialmente diferentes podem formar compras distintas; nenhuma heurística garante identificar todas as compras de todos os bancos. Itens sem marcador explícito não geram parcelas. Projeções além do calendário suportado não são geradas. A validação em uso real permanece pendente, pois esta entrega utiliza somente revisão, compilação e acompanhamento da publicação, sem testes ou importação dos anexos.


## Conferência compacta e posterior

A seleção de arquivos é agrupada por mês/ano, sem preencher silenciosamente meses desconhecidos. Crédito usa o mês da fatura; débito usa a data da movimentação. Arquivos de débito com vários meses aparecem referenciados nos respectivos grupos, com uma única configuração e uma única importação.

A conferência exibe listas mensais compactas, filtros, seleção por mês e paginação. O formulário completo abre por lançamento. Os avisos vinculados a registros abrem o mês e a página corretos, destacam a linha em dourado e focam o campo quando conhecido. A localização usa o índice do arquivo no lote e o índice do registro, inclusive quando nomes de arquivos se repetem. Erros gerais continuam sem um destino de linha.

“Importar agora e conferir depois” salva registros válidos com `reviewStatus: pending`. O fluxo com conferência salva `reviewStatus: reviewed` e `reviewedAt` gerado no servidor. Ambos entram no financeiro como cobranças reais; previsões continuam separadas. Editar preserva o estado de conferência. A ação explícita `review-entries` confere até 5.000 registros por requisição, somente do titular, em uma gravação com controle de revisão. Registros anteriores sem metadados aparecem como “Sem conferência registrada”, sem alteração retroativa.

Novas importações guardam `csvFile` e `csvRow`, além dos valores originais já existentes. Esses metadados e a conferência não podem ser sobrescritos pelo formulário comum. A restauração de backup valida os novos campos. A importação mantém validação no servidor, conferência explícita de correções/duplicidades, proteção de reimportação e atomicidade do lote. Desmarcar registros problemáticos exige autorização explícita para prosseguir; a conferência posterior não ignora erros.

As telas de cartões e de contas mantêm listas por mês, edição, detalhes de origem e conferência individual ou em seleção. Consultores autorizados continuam somente com leitura; a conexão bancária permanece bloqueada.

Entrega verificada por revisão de código, análise de sintaxe e compilação. Não foram executados testes automatizados ou manuais, nem importados arquivos financeiros ou dados de exemplo. Validação em uso real permanece pendente.


## Confirmação sobreposta e reinício financeiro

O rodapé da importação contém somente contador e “Continuar importação”. Esse botão encaminha à primeira linha selecionada com problema ou abre um diálogo final. Somente “Confirmar e importar” / “Importar e conferir depois” envia o lote. O diálogo conserva as escolhas ao voltar, apresenta autorização de exclusão de linhas problemáticas apenas quando necessária e adapta-se a painel inferior no celular.

Minha conta inclui “Zerar dados financeiros” para o titular da conta selecionada. A operação exige senha atual, confirmação textual ZERAR MEUS DADOS e reconhecimento explícito. O servidor reautentica com limitação de tentativas, recusa consultores/contas de terceiros e substitui atomicamente o documento financeiro vazio com controle de revisão. Preserva perfil, login, prazo de acesso e compartilhamentos; limpa registros, categorias, importações, regras, previsões e configurações financeiras. Conexões bancárias existentes ou pendentes bloqueiam o reinício até desvinculação para evitar repovoamento. Contas com autenticação adicional seguem a restrição de reautenticação já existente. Nenhum dado real foi zerado durante esta implementação. Revisão e compilação sem testes; validação em uso real pendente.


## Controle de compras parceladas

Dentro de cada cartão, Faturas e Compras parceladas passam a ser abas separadas. A aba de parcelamentos exibe compras agrupadas, parcelas registradas, previsões separadas e valores observados. Parcelamentos cadastrados manualmente mantêm seu cronograma e ficam identificados separadamente. Cobranças sem vínculo seguro ficam registradas, com opção de identificar a compra; a regra de conciliação conservadora foi preservada.

Parcelas explícitas elegíveis de crédito dispensam conferência individual. Novas importações guardam reviewStatus=automatic, sem inventar uma data de conferência humana. A regra compartilhada também retira parcelas existentes da contagem de pendências individuais, sem regravar valores ou históricos. Dados inválidos, correções de origem e possíveis duplicidades continuam bloqueados até resolução. Editar uma parcela automática para um lançamento que não atende mais à regra a torna pendente. Parcelas registradas não são tratadas como pagas; as estimativas continuam fora das despesas confirmadas. Nenhum dado financeiro foi importado ou alterado durante o desenvolvimento. Revisão, sintaxe, compilação e publicação não substituem validação em uso real; não foram executados testes.
