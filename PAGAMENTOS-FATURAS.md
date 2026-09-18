# Parcelas e pagamentos de faturas

O cronograma completo mostra parcelas históricas apenas como informação; não cria despesas anteriores. Confirmações históricas são explícitas e ficam inválidas se os parâmetros da compra mudarem.

Metadados privados do documento do usuário: invoiceStatements, invoicePayments, purchaseHistory e invoiceAutoIgnored. Não há nova tabela nem alteração de RLS. O servidor exige proprietário autenticado, valida valores e vínculos e grava via revisão atômica existente. Backup e restauração incluem os novos campos. Nenhuma migração de dados financeiros é necessária.

O total oficial da fatura precisa ser confirmado pelo titular. A fotografia das cobranças invalida a quitação se lançamentos mudarem. Pagamentos parciais reduzem o saldo, sem quitar parcelas individualmente. Desfazer uma confirmação mantém o lançamento original. Pagamentos nunca são convertidos em novas despesas.

Conciliação automática é opcional por fatura. Exige total confirmado, nenhuma confirmação manual que possa duplicar pagamentos, mesmo cartão, origem CSV e referência explícita na descrição no formato fatura MM/AAAA. O mês do arquivo, a data ou a coincidência de valor isoladamente não bastam. CSVs sem referência explícita exigem vínculo manual. Dados ausentes não comprovam atraso; vermelho exige declaração de saldo realmente aberto e vencimento passado. Configuração do dia do vencimento é necessária para datas de planos importados.

Validação de entrega: revisão de código e compilação. Não foram executados testes automatizados ou manuais nem importados dados de clientes. A validação em uso real permanece pendente.
