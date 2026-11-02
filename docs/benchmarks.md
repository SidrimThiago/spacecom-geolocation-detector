# Resultados de desempenho

Comparei a poda espacial B1 com B0 e, em uma segunda campanha, a reutilização de validação temporal H1 com a versão sem H1. Os resultados fundamentaram a escolha de B1 e H1. Cada campanha isola uma mudança e mantém seu próprio método e denominador.

O [resumo numérico](benchmark-resumo.json) reúne médias, medianas, desvio padrão populacional (σpop), extremos e totais por campanha. Os agregados foram recalculados dos registros brutos e confrontados com a análise correspondente. A tradução das descrições não altera as medições e não representa uma nova campanha.

## Ambiente e método estatístico

As duas campanhas foram registradas em Windows, Node 24.11.1/V8 13.6.233.10-node.28, AMD Ryzen 7 5800H, 16 processadores lógicos e cerca de 16 GB de RAM. Cache do sistema operacional, coleta de lixo (GC), compilação JIT e interferência externa não foram integralmente controlados. RSS foi amostrado, sem representar um pico exato ou teto universal.

As estatísticas são **descritivas**. σpop usa divisor n e descreve a dispersão da série, não um intervalo de confiança populacional. Alternância e pareamento não garantem independência ou causalidade universal. O tempo agregado é a soma das médias dos sete inputs, não a média de percentuais individuais.

## Poda espacial: B0 versus B1, antes de H1 (R4)

Foram executados 5 pares por dataset, com aquecimento por arquivo/variante, ordem alternada e passagens sequenciais no mesmo processo. O tempo interno `processDataset.totalMs` inclui leitura e parsing, detecção com ordenação, serialização, escrita e publicação; **não inclui a inicialização completa da CLI**. A conferência de conteúdo fica fora do intervalo.

Uma série anterior foi afetada por suspensões do sistema e excluída integralmente da comparação, sem combinar suas amostras com a repetição completa. As tabelas abaixo usam somente essa repetição, sem remoção seletiva de valores atípicos ou subtração do tempo de suspensão.

**Milissegundos; média e σpop, n=5 em cada coluna.**

| Dataset | B0 média | B0 σpop | B1 média | B1 σpop |
|---|---:|---:|---:|---:|
|1|22,970|3,534|26,024|5,843|
|2|102,214|22,706|108,140|18,900|
|3|411,834|84,299|409,778|70,424|
|4|1.634,434|312,280|1.558,913|335,267|
|5|4.611,882|889,483|4.174,466|797,007|
|6|36.778,431|4.432,054|35.673,930|2.847,645|
|7|56.555,401|8.350,591|49.658,465|7.385,622|

Soma das médias: **B0 = 100,117166 s; B1 = 91,609715 s**, redução descritiva de **8,497494% relativa a B0**. B1 teve menor tempo nos 5/5 totais emparelhados, mas não em cada dataset ou passagem. Nos inputs 1–2, a média de B1 foi maior; a série também apresentou tendência descendente dos tempos e dispersão relevante.

A estratégia A foi executada como referência, com n = 5 apenas nos inputs 1–2 e n = 1 nos 3–7: soma das médias 167,494939 s. Com uma única amostra, σ igual a zero não indica estabilidade. Microbenchmarks auxiliares complementaram a análise, sem determinar sozinhos a escolha da estratégia.

Esta comparação **antecede H1**, portanto os tempos não descrevem a versão com a otimização temporal. A série R3, que registrou 9,2% em outro contexto de versão e execução, também não integra estes agregados.

## Validação temporal: B1 sem H1 versus B1 com H1 (R5)

Essa campanha compara somente a mudança de validação temporal, com B1 nas duas versões. Foram **84 passagens medidas + 14 aquecimentos**, seis pares por dataset, três com cada versão em primeira posição e ordem de inputs fixa 1→7. Cada passagem usa **um novo processo Node**. O aquecimento beneficia o cache do sistema operacional, não o JIT dos processos seguintes.

A métrica primária é `processDataset.totalMs`, intervalo interno até a publicação e limpeza temporária, antes de seu `finally`. A métrica externa `outerMs` inclui inicialização, imports, checagens do processo de trabalho, stdout, `finally` e encerramento. A conferência do resultado fica fora de ambos os intervalos. O resumo numérico mantém as duas métricas separadas; a redução abaixo se refere somente à interna.

**Milissegundos internos; média e σpop, n=6 em cada coluna.**

| Dataset | Sem H1 média | Sem H1 σpop | Com H1 média | Com H1 σpop |
|---|---:|---:|---:|---:|
|1|34,228|4,397|29,067|1,668|
|2|107,451|10,255|84,768|3,994|
|3|347,466|14,765|279,987|14,860|
|4|1.288,381|77,982|943,617|27,860|
|5|3.192,730|542,365|2.600,245|709,360|
|6|25.059,242|1.176,882|19.002,074|1.165,332|
|7|37.125,529|998,007|28.274,505|1.017,999|

Soma das médias internas: **67,155026 s → 51,214263 s**, redução descritiva de **23,737260% relativa à versão sem H1**. Os 42/42 pares internos e os 6/6 totais tiveram menor tempo com H1. O resultado descreve esse corpus e ambiente, sem garantir ganho universal, estimar cargas com aproximadamente um registro por timestamp distinto ou isolar causalmente todos os custos adicionais.

A análise de posição registrou reduções agregadas diferentes: aproximadamente 21,847% com a referência primeiro e 25,600% com H1 primeiro; nas duas metades da série, 24,988%/22,502%. Essas divisões não são réplicas ortogonais, e o corpus fixo limita a generalização. A passagem atípica d5/r5 foi mantida; a telemetria disponível não determina sua causa.

**Esta campanha não mede `--all`.** Os percentuais de 8,497% e 23,737% usam métodos e denominadores diferentes e não são cumulativos. A comparação direta dos tempos entre campanhas ou com outro hardware exige novas medições compatíveis.

## Reprodução funcional

As execuções funcionais registradas como R6 e R9 verificaram `--all` e a reprodução dos sete JSONs. R9 partiu de uma instalação nova, com build, 74 testes sem dados externos e 85 com os dados de referência. Esses comandos não constituem uma campanha comparativa de desempenho.

## Alternativa H3: retenção de memória

Descartei a implementação de extração por substrings após os diagnósticos sintéticos, apesar de os testes semânticos passarem no recorte avaliado. A medição de heap retido usou três coletas de lixo prévias, grupos com tempos de vida equivalentes e linhas novas de 131.136 caracteres:

| Registros no grupo | Baseline: aumento heapUsed | Candidata H3: aumento heapUsed |
|---|---:|---:|
|2|370.496 B|613.312 B|
|16|434.672 B|2.522.104 B|

Timestamps curtos podiam manter o armazenamento subjacente de cada linha enquanto os registros permaneciam no grupo. As observações finitas não demonstram vazamento global nem comportamento universal de V8. Nessa análise, `L_max` é a soma das quantidades de restrições dos registros normalizados do grupo, após deduplicação, não a quantidade de tokens brutos descartados da entrada. Os ensaios que aumentaram a quantidade de grupos já consumidos, mantendo linhas e grupos pequenos, passaram, mas não refutam o efeito combinado de largura da linha e tamanho do grupo.

Após o diagnóstico de retenção, as comparações dos 42 outputs e as 84 medições + 14 aquecimentos previstos para H3 **não foram iniciados**. Não há ganho de velocidade demonstrado para essa implementação. Perfis, ablações e calibrações exploratórias serviram à formulação de hipóteses; seus resultados não são ganhos acumuláveis de mudanças adotadas.
