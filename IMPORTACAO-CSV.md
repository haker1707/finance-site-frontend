# Importação manual de extratos e faturas

Implementação inicial: CSV Nubank de conta (`Data,Valor,Identificador,Descrição`) e cartão (`date,title,amount`), com separador vírgula ou ponto e vírgula, campos entre aspas e valores com ponto ou vírgula decimal. Outros layouts são recusados com orientação. Limites: 2 MB e 2.000 linhas por arquivo; o documento financeiro mantém seu limite de 30.000 registros e o limite de tamanho já existente.

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
