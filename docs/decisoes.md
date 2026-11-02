# Decisões técnicas e alternativas

Escolhi as estratégias abaixo considerando correção, custo de processamento e evidência experimental. Mantive as alternativas de referência para comparar o efeito de cada otimização.

## A, B0 e B1

Mantenho as três estratégias usando o mesmo classificador e Haversine:

| Estratégia | Trabalho espacial por grupo | Motivo de manter |
|---|---|---|
|A|Visita todos os pares|Referência sem poda, comparação diferencial e fallback|
|B0|Visita todos os pares, rejeita distantes em latitude antes da matemática|Isola o efeito da poda barata|
|B1|Ordena latitude/ID e interrompe a janela quando já pode descartar os seguintes|Reduz visitas no corpus, incluindo o custo da ordenação|

Para N registros, n_t IDs únicos por instante e K encontros, A/B0 mantêm custo quadrático espacial no pior caso. B1 tem `O(Σ n_t log n_t + C_lat + K)` no modelo de custo esperado, em que `C_lat` conta as comparações na janela de latitude. Grupos densos ou na mesma latitude podem tornar esse termo quadrático. Leitura, parsing e escrita dependem dos bytes e das referências, não apenas do número de pares.

Optei por B1 pelo menor tempo agregado na comparação completa com B0. O ganho não ocorreu em todos os arquivos ou passagens, e os tempos variaram ao longo da série. Mantive uma estratégia padrão, sem alternância adaptativa para entradas pequenas, pois não houve ganho fim a fim demonstrado para essa mudança. [Benchmarks](benchmarks.md).

### Fundamento da janela conservadora

A poda usa ticks somente quando **todas** as latitudes do grupo têm a forma decimal de cinco casas reconhecida exatamente. Outro formato desativa a poda do grupo e volta a A, sem arredondar a entrada.

Em reais, para latitudes válidas, a Haversine satisfaz `d ≥ R*|ΔlatitudeRad|`. O primeiro afastamento descartado é 19 ticks de 10^-5 grau: arco meridional de aproximadamente **21,127 m**, superior a 20 m. Retenho 18 ticks como candidatos, mesmo que o arco meridional correspondente já seja aproximadamente 20,015 m. A poda não decide o encontro: Haversine e `<20` continuam sendo aplicados.

Essa justificativa em números reais é complementada por testes de fronteira. O cálculo em ponto flutuante mantém a convenção Haversine e o teste estrito, sem epsilon; a justificativa não prova universalmente todas as aproximações de `Math` em qualquer motor.

## Validação temporal — H1

O perfil de execução mostrou custo relevante na validação repetida de timestamps. A mudança reutiliza apenas a validação positiva do timestamp **decodificado**, textual e consecutivamente igual no iterador privado. Os demais campos são sempre validados, T1 permanece ativo e a API pública valida o timestamp em cada chamada.

Adotei H1 com base em testes isolados e comparações com a versão anterior. O reaproveitamento não usa cache global, cache de erros, perfil imutável entre instantes ou igualdade aproximada. A campanha usou processos novos por dataset: não é benchmark de `--all`, e seu percentual não é cumulativo com o ganho B0/B1 anterior.

## Alternativa de parsing descartada — H3

Avaliei em cópia isolada uma extração de campos entre aspas com `indexOf`/`slice`, mantendo o scanner anterior como alternativa. Os testes semânticos passaram no recorte avaliado, mas os diagnósticos de memória mostraram retenção de linhas largas por timestamps curtos que permaneciam nos registros do grupo.

No cenário sintético de 16 registros, o aumento observado de heap foi **434.672 B** na versão de referência e **2.522.104 B** na implementação H3, com linhas novas de 131.136 caracteres e restrições deduplicadas. Interpretei a diferença como regressão material no runtime observado e **descartei essa implementação**.

O resultado é específico da implementação, do runtime e do cenário medidos; não demonstra vazamento global nem impossibilidade de otimizar outros analisadores. Nessa análise, `L_max` designa a soma das quantidades de restrições dos registros normalizados do grupo, após deduplicação, e não a quantidade de tokens brutos descartados da entrada. A regressão de retenção observada é finita e material independentemente dessa interpretação. Os ensaios com quantidades crescentes de grupos já consumidos, mantendo linhas e grupos pequenos, passaram, mas não refutam o efeito combinado de largura da linha e tamanho do grupo.

Após esse resultado, as comparações dos 42 outputs e as 84 medições + 14 aquecimentos previstos para H3 **não foram iniciados**. Não há ganho de velocidade demonstrado para essa implementação, que não integra o código atual.

## Publicação exclusiva de resultados

Preferi falhar explicitamente a sobrescrever resultados: cada execução reserva um diretório e um temporário exclusivos, e a publicação usa hardlink no mesmo sistema de arquivos. Os testes exercitam colisões de nomes, isolamento dos temporários e falhas de processo, distinguindo saída normal de timeout. Os limites dessa garantia estão em [Autoria e limitações](autoria-e-limites.md).
