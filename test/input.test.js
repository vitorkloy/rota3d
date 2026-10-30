import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoords, parseGoogleMapsUrl, isShortGoogleUrl, scrapeGoogleHtml } from '../src/input.js';
import { drawFramesFor, durationFor } from '../src/render.js';
import { routeBoxes } from '../src/geo.js';
import { buildScene } from '../src/scene.js';

test('coordenadas lat,lng', () => {
  assert.deepEqual(parseCoords('-23.2063551,-45.9010138'), { lat: -23.2063551, lng: -45.9010138 });
  assert.deepEqual(parseCoords(' -23.5 , -46.6 '), { lat: -23.5, lng: -46.6 });
  assert.deepEqual(parseCoords('-23.5 -46.6'), { lat: -23.5, lng: -46.6 });
  assert.equal(parseCoords('Rua 1, 23'), null);
  assert.equal(parseCoords('95,10'), null);
  assert.equal(parseCoords('10,190'), null);
});

test('link do Google Maps: !3d!4d tem prioridade sobre @', () => {
  const u = 'https://www.google.com/maps/place/Globalpac/@-23.2060000,-45.9020000,17z/data=!3m1!4b1!4m6!3m5!1s0x94cc4a:0x1a2b!8m2!3d-23.2063551!4d-45.9010138!16s';
  const r = parseGoogleMapsUrl(u);
  assert.equal(r.lat, -23.2063551); assert.equal(r.lng, -45.9010138); assert.equal(r.name, 'Globalpac');
});

test('link do Google Maps: só @lat,lng é marcado como aproximado', () => {
  const r = parseGoogleMapsUrl('https://www.google.com/maps/@-23.55,-46.63,15z');
  assert.equal(r.lat, -23.55); assert.equal(r.approx, true);
});

test('link do Google Maps: q= com coordenadas e com texto', () => {
  assert.deepEqual(parseGoogleMapsUrl('https://maps.google.com/?q=-23.1,-45.8'), { lat: -23.1, lng: -45.8 });
  assert.equal(parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=Parque+Ibirapuera').query, 'Parque Ibirapuera');
});

test('link do Google Maps: nome com + e acentos', () => {
  assert.equal(parseGoogleMapsUrl('https://www.google.com/maps/place/Pra%C3%A7a+Afonso+Pena/').name, 'Praça Afonso Pena');
});

test('CID: ?cid= e ftid hex', () => {
  assert.equal(parseGoogleMapsUrl('https://maps.google.com/?cid=1234567890').cid, '1234567890');
  assert.equal(parseGoogleMapsUrl('https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x94cc4a8:0xff').cid, '255');
});

test('links curtos', () => {
  assert.ok(isShortGoogleUrl('https://maps.app.goo.gl/abc123'));
  assert.ok(isShortGoogleUrl('https://goo.gl/maps/abc'));
  assert.ok(!isShortGoogleUrl('https://www.google.com/maps'));
});

test('HTML do Maps: ignora centro de zoom baixo', () => {
  const h = '<meta content="Globalpac · Rua X" itemprop="name"><meta content="https://maps.google.com/maps/api/staticmap?center=-23.18%2C-45.82&amp;zoom=12">';
  assert.deepEqual(scrapeGoogleHtml(h), { name: 'Globalpac' });
});

test('duração: 1,5 s + 3,4 s/km + 1,5 s', () => {
  assert.equal(drawFramesFor(1000), 102);
  assert.ok(Math.abs(durationFor(3572) - (3 + 3.572 * 3.4)) < 0.05);
});

test('bbox por trechos e cena', () => {
  const coords = [[-45.89, -23.19], [-45.88, -23.19]];
  assert.ok(routeBoxes(coords).length >= 1);
  const s = buildScene({ coords, from: { name: 'A' }, to: { name: 'B' }, osm: { elements: [
    { type: 'way', id: 1, tags: { building: 'yes', 'building:levels': '3' }, geometry: [{ lon: -45.885, lat: -23.1901 }, { lon: -45.8849, lat: -23.1901 }, { lon: -45.8849, lat: -23.1902 }, { lon: -45.885, lat: -23.1901 }] },
    { type: 'way', id: 2, tags: { building: 'yes' }, geometry: [{ lon: -45.7, lat: -23.3 }, { lon: -45.71, lat: -23.3 }, { lon: -45.71, lat: -23.31 }] },
  ] } });
  assert.equal(s.b.length, 1); assert.equal(s.b[0].h, 10.6); assert.equal(s.from, 'A');
});
