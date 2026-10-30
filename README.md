# rota3d

Gera um **vídeo vertical 3D (1080×1920, 30 fps)** de uma rota entre dois pontos, no estilo **maquete branca**, com dados do OpenStreetMap. Pronto para Reels/Stories/Shorts.

- pausa de 1,5 s no início com o rótulo da origem em destaque;
- linha azul se desenhando devagar (~3,4 s por km) com *ease in/out*, sempre por cima dos prédios;
- pin pulsando 1,5 s no destino com o nome do lugar;
- crédito “© OpenStreetMap contributors” no canto.

Três formas de usar: **CLI**, **interface web local** e **app desktop** (Windows/macOS/Linux, executável portátil).

## Instalação (CLI / web)

Precisa só do **Node.js 20+**. O Chromium (via Puppeteer) e o ffmpeg (via `@ffmpeg-installer/ffmpeg`) vêm como dependências npm.

```bash
npm install -g github:vitorkloy/rota3d
# ou, num clone:  git clone https://github.com/vitorkloy/rota3d && cd rota3d && npm install && npm link
```

> No npm 11+ os scripts de instalação ficam bloqueados por padrão; sem problema: na primeira execução o rota3d baixa o Chromium sozinho se ele não estiver lá.

## CLI

```bash
rota3d --de <origem> --para <destino> -o saida.mp4
```

Origem e destino aceitam:

| Entrada | Exemplo |
|---|---|
| Endereço | `"Praça Afonso Pena, São José dos Campos"` |
| Coordenadas `lat,lng` | `-23.2063551,-45.9010138` |
| Link do Google Maps | `https://www.google.com/maps/place/...` (usa `!3d…!4d…` ou `@lat,lng`) |
| Link curto | `https://maps.app.goo.gl/...` (segue o redirect) |
| Link com CID | `https://maps.google.com/?cid=123...` |

Exemplos:

```bash
rota3d --de "Praça Afonso Pena, São José dos Campos" --para "Parque Vicentina Aranha, São José dos Campos" -o praca-parque.mp4
rota3d --de -23.2063551,-45.9010138 --para "https://maps.app.goo.gl/XXXX" -o empresa.mp4
rota3d --de "Av. Paulista, 1578, São Paulo" --para "Parque Ibirapuera" --nome-para "Ibirapuera" -o sp.mp4
```

Opções: `--nome-de` / `--nome-para` (troca o rótulo), `--max-km` (limite de distância, padrão 15 km), `-h`.

A duração do vídeo é `1,5 s + 3,4 s × km + 1,5 s` (ex.: 3 km ≈ 13 s).

## Interface web local

```bash
rota3d serve            # http://localhost:3000
rota3d serve --port 8080
```

Dois campos, um botão, barra de progresso e download do MP4. Gera um vídeo por vez.

## App desktop

Interface em preto e branco (Gerar, Histórico, Definições: pasta de saída, velocidade da linha, idioma PT-BR/English). Usa o próprio Chromium do Electron para renderizar — não baixa nada extra.

Executáveis portáteis (sem instalador) são gerados pelo GitHub Actions em cada push/PR (aba **Actions → Desktop → Artifacts**):

- Windows: `rota3d-x.y.z-portable.exe`
- macOS: `rota3d-x.y.z-mac-arm64.zip` (app não assinado: clique direito → Abrir na primeira vez)
- Linux: `rota3d-x.y.z-linux-x86_64.AppImage` (`chmod +x` e execute)

Para rodar a partir do código: `npm install && npm run desktop`.

## Como funciona

1. Resolve as entradas (Nominatim para endereços e nomes; links do Google Maps são lidos localmente).
2. Calcula a rota de carro no OSRM.
3. Baixa prédios, ruas, áreas verdes/água e bairros do Overpass em caixas ao longo da rota.
4. Monta a cena Three.js e captura quadro a quadro em Chromium headless; o ffmpeg codifica em H.264.

### Uso responsável das APIs

- `User-Agent` identificado (`rota3d/<versão> (+https://github.com/vitorkloy/rota3d)`) em Nominatim, OSRM e Overpass;
- no máximo ~1 requisição/s por serviço, com retentativa e *backoff* em 429/5xx;
- cache local em `~/.cache/rota3d` (30 dias; Overpass 60 dias) — repetir uma rota não chama as APIs de novo;
- servidores próprios podem ser usados com `ROTA3D_NOMINATIM`, `ROTA3D_OSRM`, `ROTA3D_OVERPASS`.

Para uso intenso, rode suas próprias instâncias (as públicas são gratuitas e limitadas).

### Erros tratados

Endereço não encontrado, link sem coordenadas, rota não encontrada, origem = destino, rota acima do limite (`--max-km`), falha/timeout do Overpass (tenta outro servidor) e erro na cena 3D.

## Limitações

- Renderização por software (SwiftShader) na CLI: ~2–3 min para uma rota de 3 km; rotas longas demoram proporcionalmente. O app desktop usa a GPU quando disponível.
- Altura dos prédios vem de `height`/`building:levels` do OSM; sem isso, uma altura plausível é sorteada de forma determinística.
- Links do Google Maps dependem do formato atual das URLs do Google; links só com CID podem cair no nome do lugar + Nominatim.

## Créditos e licença

- Código: [MIT](LICENSE) © Vitor de Oliveira.
- Dados de mapa: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licença **ODbL**. O crédito aparece em todo vídeo; mantenha-o ao publicar.
- Rotas: [OSRM](https://project-osrm.org/). Geocodificação: [Nominatim](https://nominatim.org/). 3D: [three.js](https://threejs.org/).
