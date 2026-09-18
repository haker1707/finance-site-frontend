# Importação manual de extratos e faturas

Implementação inicial: CSV Nubank de conta (`Data,Valor,Identificador,Descrição`) e cartão (`date,title,amount`), com separador vírgula ou ponto e vírgula, campos entre aspas e valores com ponto ou vírgula decimal. Outros layouts podem ser mapeados explicitamente, com uma coluna de data, descrição, valor e identificador opcional. O cabeçalho deve estar na primeira linha e os valores em uma única coluna. Não há promessa de compatibilidade universal. Limites: 2 MB e 2.000 linhas por arquivo; o documento financeiro mantém seu limite de 30.000 registros e o limite de tamanho já existente.

O navegador lê o arquivo para conferência. O arquivo e as escolhas só são enviados ao servidor quando o titular confirma. Nenhum CSV original fica armazenado como arquivo; os registros preservam a origem da linha, hash e valores originais para rastreabilidade. O histórico de importações registra nome, data e quantidade.

## Persistência e acesso

`csv-import`, `recurring-save` e `recurring-remove` passam pela autenticação e pela autorização do titular na função Norte. Consultores permanecem somente leitura. O servidor lê apenas o documento do usuário autenticado, interpreta novamente o CSV, valida as escolhas e grava todo o lote através do compare-and-swap `norte_commit`. Um erro invalida o lote inteiro. Não há alteração de tabelas, de RLS nem de documentos existentes durante a publicação.

`csvKey` usa SHA-256. Na conta, usa o identificador Nubank; no cartão, usa cartão, data original, descrição normalizada, valor com sinal e ocorrência entre linhas idênticas. O mês selecionado não altera a identidade. Reimportações de registros ainda existentes são bloqueadas, inclusive após edição. Repetições sem ID bancário e possíveis correspondências com compras manuais exigem revisão explícita. Linhas idênticas no mesmo CSV recebem números de ocorrência; sem identificador do banco, um arquivo parcial com somente uma dessas linhas pode ser indistinguível de outro. Esse limite impede garantir deduplicação universal. Excluir um lançamento permite reimportá-lo; restaurar um backup restaura os hashes que ele contém.

Categorias existentes são sugeridas pelo histórico ou por palavras-chave; nomes novos só são criados na confirmação. Pix e créditos ambíguos exigem classificação. O servidor valida categoria/natureza, vínculo ao cartão, datas e centavos inteiros. Transferências entre contas próprias e pagamentos de fatura não entram novamente em despesas. Estornos reduzem despesas. Encargos podem ser classificados como despesas na conferência. Não são geradas parcelas futuras de linhas CSV.

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
