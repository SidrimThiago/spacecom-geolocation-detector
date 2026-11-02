# Autoria, uso de IA e limitações

## Autoria e uso de IA

Conduzi a análise do problema, a escolha da abordagem e a interpretação dos resultados. Utilizei ferramentas de IA no apoio à implementação, à investigação de desempenho, aos testes e à documentação, e revisei as decisões técnicas sob minha responsabilidade. Comandos, testes, perfis e verificações foram executados por automação com scripts e ferramentas de IA.

## Limites funcionais e numéricos

- **T1:** timestamps devem ser globalmente não decrescentes. A CLI rejeita retorno temporal; não ordena arbitrariamente o arquivo. A referência pequena sem essa precondição é ferramenta de teste, não um modo de execução escalável.
- **Completude e score:** há gabaritos apenas para os datasets 1–2. O vínculo dos eventos emitidos, a equivalência entre variantes e a reprodução de bytes não provam, isoladamente, ausência de omissões. Não há score oficial disponível para os datasets 3–7.
- **Ponto flutuante:** a convenção Haversine mantém o teste estrito, sem epsilon. A justificativa em números reais e os testes de fronteira não identificam o comparador externo nem garantem todas as aproximações de `Math`.
- **Complexidade:** B1 pode voltar ao quadrático em grupos densos ou na mesma latitude. A memória depende do maior grupo, das listas e referências, da maior linha e dos buffers, sem teto defensivo universal para entradas adversariais ilimitadas.
- **Estado:** H1 reutiliza apenas validação temporal positiva e consecutiva; a API pública continua validando. A implementação H3 descartada não integra as fontes.

## I/O e ferramentas auxiliares

A publicação exclusiva dos resultados depende de hardlinks no sistema de arquivos local. Não há garantia universal de suporte a UNC/filesystems, durabilidade contra queda de energia ou proteção contra troca maliciosa concorrente dos diretórios ancestrais. O lote não é uma transação atômica; resultados completos anteriores sobrevivem a uma falha posterior.

As garantias de cancelamento referem-se ao produtor assíncrono e ao cancelador síncrono usados pela CLI. Iteráveis customizados cuja fábrica ou `return` lança, callbacks de cancelamento assíncronos e `throw undefined` têm limitações. Em UTF-8 inválido, a linha indicada pode ser o início do bloco de leitura que falhou.

`validateEvents` isolado valida o formato temporal, não todo o calendário. A verificação completa depende do vínculo com uma entrada validada. Seu decodificador permissivo e o parsing JSON padrão não oferecem proteção geral contra artefatos externos malformados ou chaves duplicadas.

O benchmark auxiliar exige os diretórios e os sete inputs descritos em [Testes](testes.md). Sua metodologia não reproduz a campanha de processos novos de H1, e os tempos históricos dependem do corpus e do ambiente medidos.

## Dados e exemplos

Os exemplos incluídos são sintéticos. Os datasets do desafio, os gabaritos e os sete resultados detalhados derivados deles não são distribuídos com este código. A documentação de desempenho apresenta estatísticas agregadas e métodos, sem reproduzir linhas dos datasets.
