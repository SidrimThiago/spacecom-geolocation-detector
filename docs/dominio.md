# Regras de domínio e contrato implementado

Separei as regras de encontro das convenções adicionais de parsing e ordenação implementadas para tornar a entrada e a saída determinísticas. As extensões estão identificadas abaixo.

## Papéis e classificação

`medidaProtetiva=false` significa monitorado M; `true`, vítima V.

| Par simultâneo | Condição | Tipo |
|---|---|---|
|M/M|Mesma facção preenchida|`faccao`|
|M/M|Demais casos|`generico`|
|V/M ou M/V|ID de M está na lista de V|`protetiva`|
|V/M ou M/V|Sem vínculo na lista de V|Não emite|
|V/V|Qualquer lista/facção|Não emite|

A lista consultada é sempre a da vítima; a ordem numérica dos IDs não altera essa direção. Facção zero é preenchida; vazio não é facção. Listas são conjuntos, inclusive quando há repetições ou múltiplos alvos. Campos inativos não mudam o papel, mas continuam validados e comparados em duplicatas.

## Distância e identidade

O par precisa ter o **mesmo timestamp textual** e distância Haversine **estritamente menor que 20 m**, sem interpolação, janela de tempo, cadência obrigatória de cinco segundos, arredondamento ou epsilon no teste.

Uso raio 6371000 m, diferenças em graus antes da conversão `(x*Math.PI)/180`, `asin` e clamp somente depois de verificar finitude. A convenção numérica foi confrontada com os dois gabaritos locais; não identifica o comparador externo da avaliação.

Os dois IDs são canônicos e distintos; posições continuam associadas aos IDs correspondentes. Um mesmo par pode aparecer em timestamps diferentes, mas não duplicado no mesmo instante. A ordem determinística dos eventos varia entre estratégias sem alterar seu conteúdo.

## Entrada e perfil T1

Cabeçalho obrigatório:

```text
idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida
```

São sete colunas separadas por `;`, com aspas e escape CSV em um registro físico e lista interna por vírgulas. O parser aceita UTF-8 estrito, BOM inicial único, LF/CRLF e último registro sem newline. Não remove espaços silenciosamente, não aceita CSV multilinha ou CR isolado e não ignora linhas inválidas. Uma entrada apenas com cabeçalho gera `[]`; entrada vazia falha.

Como extensões de engenharia, o parser aceita inteiros decimais seguros com sinais e zeros à esquerda, coordenadas decimais completas com expoente e calendário proléptico 0000–9999. Booleanos são literais; valores não finitos, coordenadas fora dos limites e datas impossíveis falham. Essas convenções adicionais descrevem a implementação, não requisitos atribuídos ao enunciado.

Duplicatas `(ID,timestamp)` são fundidas apenas quando todos os campos tipados coincidem, com igualdade de conjuntos e `-0=0`. Conflitos abortam, em vez de escolher o primeiro ou o último registro. Atributos podem mudar entre instantes.

**T1 exige timestamps globalmente não decrescentes**. A igualdade é necessária ao grupo; uma regressão é rejeitada depois da validação completa da linha. Ordenar uma entrada embaralhada está fora do perfil da CLI atual; essa precondição é uma escolha da implementação.

## Saída

Array JSON, inclusive vazio, com exatamente cinco propriedades por evento:

| Propriedade | Forma |
|---|---|
|`tipo`|`generico`, `faccao` ou `protetiva`|
|`monitoradosEncontro`|Dois IDs inteiros seguros, distintos e canônicos|
|`timestamp`|String temporal validada e preservada|
|`posicoes`|Somente as duas chaves ID; cada posição contém `lat`/`lon` finitas|
|`distanciaMetros`|Número finito, não negativo e menor que 20|

O [exemplo incluído](../examples/encontros.txt) e seu [JSON esperado](../examples/encontros.expected.json) são inteiramente sintéticos. Os gabaritos oficiais são referências externas de teste e não são distribuídos com o código.
