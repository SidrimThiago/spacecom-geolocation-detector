# Guia de testes e reprodução

A validação combina compilação, testes de regras com exemplos sintéticos, comparação integral de resultados e verificação do vínculo dos eventos com a entrada. Há dois modos de execução: 74 testes sem dados oficiais e a suíte completa de 85 testes com dados de referência externos.

## Testes sem dados oficiais

Na raiz, depois de instalar as dependências de desenvolvimento e compilar:

```powershell
npm.cmd ci --include=dev
npm.cmd run build
npm.cmd run typecheck
node --test --test-reporter=tap dist/tests/benchmark.test.js dist/tests/detect.test.js dist/tests/domain.test.js dist/tests/io-memory.test.js dist/tests/io.test.js dist/tests/parser.test.js dist/tests/rodada04-adversarial.test.js dist/tests/rodada05-h1.test.js dist/tests/verify.test.js
```

O comando executa **74 testes em 9 arquivos**, com dados sintéticos incluídos no código. Abrange papéis e restrições, fronteiras geométricas, parsing e calendário, retorno à estratégia de referência, duplicatas, T1, validação temporal pública/H1, falhas de I/O, proteção contra sobrescrita, processamento incremental e comparação do conteúdo completo.

Os arquivos `cli.test.js`, `integration.test.js` e `rodada04-tools.test.js` dependem dos datasets originais 1–2 e/ou dos gabaritos e ficam fora desse comando. O exemplo sintético do README permite exercitar a CLI e o verificador sem esses dados, mas não substitui todos os testes excluídos.

Os testes criam seus próprios diretórios temporários. Execute-os em uma cópia de trabalho que possa receber arquivos gerados e mantenha os diretórios pais `OutPuts/` e `OutPuts/gerados/`.

## Suíte completa com dados de referência

`npm.cmd test` compila e executa todos os arquivos de teste. Ela requer:

| Papel | Arquivos externos |
|---|---|
|Inputs de integração/CLI/ferramentas|`DataSets/dataset1.txt`, `dataset2.txt`|
|Oráculos de comparação integral|`OutPuts/output1.json`, `output2.json`|

Os arquivos originais devem ser obtidos pelos meios autorizados e colocados nos caminhos indicados. Os dois JSONs são gabaritos externos, não resultados produzidos pelo detector, e não são distribuídos com o código.

Na reprodução local registrada com esses dados, a automação executou **85 testes sem falhas ou testes ignorados**, com build e typecheck concluídos. Sem os quatro arquivos externos, execute o subconjunto de 74 testes.

## Validação dos resultados

A reprodução funcional registrada partiu de uma instalação limpa com `--include=dev`, cache npm inicialmente vazio e downloads HTTP. O código recompilado coincidiu em hashes com a versão usada para produzir os resultados.

Com os sete datasets e os dois gabaritos disponíveis em uma cópia isolada, a automação executou `--all` e comparou integralmente os sete JSONs, em bytes e conteúdo, com os resultados anteriores. O verificador reprocessou as entradas, e os resultados foram reabertos e conferidos por hash após a verificação.

Os gabaritos 1–2 tiveram FP 0 / FN 0 / nenhuma divergência de payload. Para 3–7, igualdade histórica e vínculo dos emitidos não são prova independente de completude nem score oficial. Essa reprodução funcional não é uma campanha de desempenho.

## Integração contínua

O [workflow](../.github/workflows/ci.yml) usa Windows e Node 24.11.1, instala as dependências de desenvolvimento e executa build, typecheck, os 74 testes e o exemplo sintético com verificação integral. Não requer datasets, gabaritos privados ou segredos e não inclui implantação ou upload de artefatos.

O token tem permissão de leitura de conteúdo; o checkout não persiste credenciais, e as actions estão fixadas por commit. Os comandos foram exercitados localmente, mas o workflow **ainda não foi executado no GitHub Actions**. A execução local não verifica os passos remotos de checkout e configuração do runner.

A `.gitignore` exclui dependências, compilações, dados externos e resultados locais. A conferência do conteúdo a distribuir continua necessária, especialmente porque os manifestos de execução podem conter caminhos absolutos.

## Benchmark opcional

`scripts/benchmark.ts` executa uma campanha de comparação separada dos testes. Requer os sete arquivos de entrada completos, `OutPuts/gerados/`, **o diretório pai `Relatorios/evidencias/` previamente criado** e um novo ID de execução.

O script não cria esse diretório pai. Antes de executar:

```powershell
node --input-type=module -e "import fs from 'node:fs'; fs.mkdirSync('Relatorios/evidencias', {recursive:true});"
npm.cmd run bench -- 5 benchmark-local-novo-01
```

Esse comando usa passagens no mesmo processo e uma metodologia diferente da campanha de H1, que iniciou um processo novo por passagem. [Métodos e resultados](benchmarks.md).
