#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { generate, DEFAULT_MAX_KM } from '../src/index.js';

const HELP = `rota3d — vídeo vertical 3D (1080x1920, 30fps) de uma rota sobre maquete branca do OpenStreetMap

Uso:
  rota3d --de <origem> --para <destino> [-o saida.mp4] [opções]
  rota3d serve [--port 3000]

Origem/destino aceitam:
  endereço             "Av. Paulista, 1578, São Paulo"
  coordenadas          "-23.5614,-46.6559"
  link do Google Maps  https://maps.app.goo.gl/...  ou  https://www.google.com/maps/place/...

Opções:
  -o, --out <arquivo>     arquivo de saída (padrão: rota.mp4)
      --nome-de <texto>   rótulo da origem (padrão: nome do lugar)
      --nome-para <texto> rótulo do destino (padrão: nome do lugar)
      --max-km <n>        distância máxima da rota (padrão: ${DEFAULT_MAX_KM})
  -h, --help
`;

// coordenadas negativas ("-23.5,-46.6") seriam lidas como opção: junta como --de=valor
const argv = [];
for (const a of process.argv.slice(2)) {
  const prev = argv.at(-1);
  if (/^--(de|para|nome-de|nome-para)$/.test(prev ?? '') && /^-\d/.test(a)) argv[argv.length - 1] = `${prev}=${a}`;
  else argv.push(a);
}

const { values, positionals } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: {
    de: { type: 'string' }, para: { type: 'string' }, out: { type: 'string', short: 'o', default: 'rota.mp4' },
    'nome-de': { type: 'string' }, 'nome-para': { type: 'string' }, 'max-km': { type: 'string' },
    port: { type: 'string', default: '3000' }, help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) { process.stdout.write(HELP); process.exit(0); }
if (positionals[0] === 'serve') {
  const { serve } = await import('../src/server.js');
  serve(+values.port);
} else {
  if (!values.de || !values.para) { process.stderr.write(HELP); process.exit(2); }
  let lastPct = -1;
  try {
    await generate({
      de: values.de, para: values.para, out: values.out,
      maxKm: values['max-km'] ? +values['max-km'] : DEFAULT_MAX_KM,
      nomeDe: values['nome-de'], nomePara: values['nome-para'],
      log: (m) => process.stderr.write(m + '\n'),
      onProgress: ({ frame, total }) => {
        const pct = Math.floor((frame / total) * 100);
        if (pct !== lastPct && (pct % 10 === 0 || frame === total)) { lastPct = pct; process.stderr.write(`  ${pct}% (${frame}/${total} quadros)\n`); }
      },
    });
  } catch (e) {
    process.stderr.write(`erro: ${e.message}\n`);
    process.exit(1);
  }
}
