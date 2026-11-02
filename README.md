# Spacecom 2027 — detecção de encontros

Este projeto implementa um detector de encontros por geolocalização em **TypeScript e Node.js**. Os registros são processados incrementalmente por timestamp, e os encontros são classificados como genéricos, entre integrantes da mesma facção ou relacionados a medidas protetivas, sempre com distância Haversine estritamente menor que 20 metros.

Comparei três estratégias de detecção espacial e escolhi uma varredura ordenada por latitude, apoiada em testes diferenciais e benchmarks. A documentação apresenta a arquitetura, as decisões de engenharia, os resultados medidos e as limitações da solução.

## Visão geral

```text
UTF-8 → CSV/tipos → grupos por timestamp → candidatos espaciais → domínio/Haversine → JSON
```

- Sem dependências de execução; TypeScript e tipos Node são dependências de desenvolvimento.
- Leitura e escrita incrementais, sem carregar o arquivo inteiro nem acumular todos os eventos.
- Perfil **T1: timestamps globalmente não decrescentes**, com igualdade permitida. Não implemento ordenação externa de entradas embaralhadas.
- Diretórios e temporários exclusivos: uma execução não sobrescreve a anterior.
- Variantes **A**, **B0** e **B1** disponíveis por `--variant`; B1 é o padrão. A validação temporal reutiliza timestamps consecutivos já validados, otimização identificada como **H1**.

### Documentação

| Tema | Conteúdo |
|---|---|
| [Arquitetura](docs/arquitetura.md) | Módulos, fluxo, estado e publicação da saída |
| [Regras de domínio](docs/dominio.md) | Papéis, distância, parsing, duplicatas e esquema |
| [Decisões técnicas](docs/decisoes.md) | Estratégias espaciais, validação temporal e alternativa descartada |
| [Testes](docs/testes.md) | 74 testes sem insumos privados; 85 com suporte externo |
| [Benchmarks](docs/benchmarks.md) | Campanhas separadas, metodologia, tabelas e incertezas |
| [Autoria e limitações](docs/autoria-e-limites.md) | Uso de IA, limites técnicos, dados e exemplos |

## Instalar e executar

Requisitos: **Node 24.11.1 ou posterior**, npm e sistema de arquivos com suporte a hardlink no diretório de saída. O ambiente de reprodução local é Windows com Node 24.11.1.

```powershell
npm.cmd ci --include=dev
npm.cmd run build
npm.cmd run typecheck
node dist/src/cli.js --help
node dist/src/cli.js --input examples/encontros.txt --run-id exemplo-01
```

No Windows/PowerShell, use `npm.cmd`; nos demais terminais, use `npm`. Execute os comandos na raiz e mantenha `OutPuts/` e `OutPuts/gerados/`, preservados pelos documentos incluídos.

O [exemplo é sintético](examples/encontros.txt): dois monitorados da mesma facção, na mesma posição e instante. O resultado completo é:

```json
[{"tipo":"faccao","monitoradosEncontro":[3,20],"timestamp":"2024-01-01 00:00:00","posicoes":{"3":{"lat":0,"lon":0},"20":{"lat":0,"lon":0}},"distanciaMetros":0}]
```

Ele será gravado em `OutPuts/gerados/exemplo-01/1-encontros.json`; [o JSON esperado está incluído](examples/encontros.expected.json). Progresso e diagnósticos usam stderr; o processamento deixa stdout vazio. Para repetir a execução, escolha um novo ID.

Para verificar essa execução:

```powershell
node dist/scripts/verify.js OutPuts/gerados/exemplo-01
```

O verificador produz um relatório exclusivo e vincula os eventos emitidos aos registros de origem. Sem gabarito, essa verificação não comprova a ausência de eventos omitidos.

### Outras entradas

```powershell
node dist/src/cli.js --input caminho/entrada.txt --variant B1 --run-id outra-execucao-01
```

Caminhos absolutos também são aceitos. `--dataset N` e `--all` usam entradas em `DataSets/datasetN.txt`; `--all` requer os sete arquivos completos. Os datasets do desafio, seus gabaritos e os sete resultados detalhados derivados deles não são distribuídos aqui. Use os arquivos originais obtidos pelos meios autorizados ou uma entrada própria com `--input`.

## Testar sem dados oficiais

Após o build, execute o subconjunto documentado:

```powershell
node --test --test-reporter=tap dist/tests/benchmark.test.js dist/tests/detect.test.js dist/tests/domain.test.js dist/tests/io-memory.test.js dist/tests/io.test.js dist/tests/parser.test.js dist/tests/rodada04-adversarial.test.js dist/tests/rodada05-h1.test.js dist/tests/verify.test.js
```

São **74 testes em 9 arquivos**, sem input ou gabarito oficial. Os arquivos `cli.test.ts`, `integration.test.ts` e `rodada04-tools.test.ts` permanecem nos fontes, mas dependem de insumos externos e estão excluídos desse comando.

**`npm test` executa a suíte completa de 85 testes** e requer os datasets originais 1–2 e os dois gabaritos externos. Com esses dados, a reprodução automatizada registrada passou nos 85 testes; sem eles, use o comando de 74 testes acima. [Guia de testes](docs/testes.md).

O workflow de CI usa os 74 testes e o exemplo sintético. Seus comandos foram exercitados localmente; ainda não há execução no GitHub Actions.

## Resultados de desempenho

| Evidência | Resultado observado | Limite |
|---|---|---|
| B0 versus B1, versão anterior a H1 | 100,117 s → 91,610 s na soma das médias internas; 8,497% menos tempo relativo a B0 | 5 pares/dataset; variação ao longo da série e dispersão; versão sem H1 |
| B1 sem H1 versus B1 com H1 | 67,155 s → 51,214 s na soma das médias internas; 23,737% menos tempo relativo à versão sem H1 | 6 pares/dataset, processo novo por passagem; **não `--all`** |
| Regeneração funcional dos sete datasets | 4/6/10/15/21/27/35 eventos; conteúdo integral preservado | Sem novo benchmark; score oficial 3–7 desconhecido |

As campanhas têm métodos e denominadores diferentes; os percentuais não são cumulativos. Os tempos são métricas internas de processamento, não a duração completa da CLI, e descrevem o ambiente medido. [Métodos, dispersão e dados agregados](docs/benchmarks.md).

## Limitações

T1 exige ordem temporal não decrescente; a poda mantém o pior caso quadrático em grupos densos. Não há score oficial nem prova independente de completude para os datasets 3–7. A publicação exclusiva dos resultados depende do sistema de arquivos e não garante durabilidade contra queda de energia. Uma alternativa de parsing, **H3**, foi descartada por retenção adicional de memória e não integra o código. [Limitações técnicas](docs/autoria-e-limites.md).

## Uso de IA

Utilizei ferramentas de IA para apoiar implementação, investigação de desempenho, testes e documentação. Conduzi e revisei as decisões técnicas e a interpretação dos resultados; as execuções de testes e medições foram automatizadas. [Autoria e uso de IA](docs/autoria-e-limites.md).
