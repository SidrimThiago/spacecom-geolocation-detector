# Arquitetura

Optei por separar formato, domínio, detecção espacial e publicação para comparar estratégias sem redefinir a regra de encontro.

## Responsabilidades

| Módulo | Responsabilidade |
|---|---|
|`src/model.ts`|Tipos de registro/evento e contadores |
|`src/parser.ts`|CSV, tipos, calendário, duplicatas e agrupamento T1 |
|`src/domain.ts`|Papéis, Haversine, limiar e payload canônico |
|`src/detect.ts`|A/B0/B1 sobre um grupo já normalizado |
|`src/io.ts`|Decodificação, backpressure, temporário e publicação exclusiva |
|`src/cli.ts`|Argumentos, entradas, diretório de execução, lote e manifesto |
|`scripts/verify.ts`|Verificação de esquema, vínculo com entrada e comparação com gabaritos conhecidos |
|`scripts/benchmark.ts`|Ferramenta separada de comparação instrumentada |

## Fluxo e estado

1. A CLI reserva um diretório novo em `OutPuts/gerados/`.
2. `readLines` decodifica UTF-8 estritamente, preserva a separação por LF/CRLF e recusa bytes inválidos.
3. O parser valida a linha inteira e produz campos tipados; listas viram conjuntos.
4. Um mapa por ID funde duplicatas iguais ou rejeita conflitos no timestamp corrente.
5. Ao avançar o timestamp, o grupo completo é entregue ao detector, sem manter um mapa dos instantes passados.
6. A estratégia espacial seleciona candidatos; domínio e Haversine continuam comuns.
7. Eventos são serializados incrementalmente, respeitando a pressão do destino.
8. Só após concluir o input/JSON/fechamento, um hardlink exclusivo publica o arquivo completo.

O agrupador pode ficar suspenso enquanto o consumidor processa um grupo, já com leitura antecipada do seguinte. A memória retida depende do grupo em processamento, das referências de restrição, da maior linha e dos buffers; o processamento incremental não elimina esse estado. O tamanho do grupo e da maior linha não têm teto artificial.

## Interfaces e limites

`detectGroup` recebe um grupo com timestamp único, IDs normalizados e ticks coerentes produzidos pelo parser. A referência pequena usada nos testes aceita registros sem a precondição temporal, mas não implementa ordenação externa para a CLI.

Em H1, a igualdade do **timestamp já decodificado e validado** permite reutilizar uma validação positiva consecutiva no mesmo iterador. O reaproveitamento é restrito ao timestamp; atributos das pessoas e demais campos são sempre validados. A API pública também valida o timestamp em cada chamada, sem cache de falhas ou estado global.

## Publicação e falhas

O temporário é criado de forma exclusiva, no mesmo diretório pai do destino. Um destino existente, inclusive concorrente, não é substituído; não há `--force` ou alternativa que sobrescreva arquivos. O código rejeita redirecionamentos preexistentes por junction no percurso verificado da raiz de saída.

Se a limpeza do temporário falhar depois de publicar, o resultado completo permanece e o manifesto registra aviso. Um lote com erro retorna falha, mas resultados anteriores completos não são apagados; o lote não é uma transação atômica dos sete arquivos.

Essas garantias cobrem o produtor e o cancelador usados pela CLI. Há restrições para iteradores customizados, trocas maliciosas concorrentes dos diretórios ancestrais, filesystems/UNC e durabilidade após queda de energia. [Limitações](autoria-e-limites.md).
