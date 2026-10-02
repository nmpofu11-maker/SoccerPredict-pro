/**
 * Manual Data Service
 * 
 * Handles parsing of raw fixture data (e.g., from CSV/text copy-paste)
 * and normalizes it to the internal MatchFixture format.
 */

import { MatchFixture, TeamStats } from '../types/soccer';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { isIP } from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';

export interface RawFixture {
  time: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string; // YYYY-MM-DD
}

export function mapRawToMatchFixture(raw: RawFixture): MatchFixture {
  const safeDate = String(raw.date || '').trim();
  const safeTime = String(raw.time || '').trim();
  const kickoffTime = safeDate && safeTime ? `${safeDate}T${safeTime}:00` : null;

  const makeUnknownTeamStats = (name: string): TeamStats => ({
    id: name,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    leagueRank: null,
    points: null,
    form: [],
    avgPossession: null,
    avgShotsOnTarget: null,
    isHomeDominant: false,
    hasTopTierAwayForm: false,
  });

  return {
    id: `manual_${safeDate}_${safeTime}_${raw.homeTeam}_${raw.awayTeam}`.replace(/[^a-zA-Z0-9_-]+/g, '_'),
    kickoffTime,
    league: raw.league,
    venue: `${raw.homeTeam} Stadium`,
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: makeUnknownTeamStats(raw.homeTeam),
    awayTeam: makeUnknownTeamStats(raw.awayTeam),
    h2h: null,
  };
}

export function parseRawFixtures(rawLines: string[]): MatchFixture[] {
  return rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length < 5 || parts.slice(0, 5).some((part) => !part)) {
        throw new Error(`Invalid fixture row at line ${index + 1}: expected time|home|away|league|date`);
      }
      const [time, home, away, league, date] = parts;
      return mapRawToMatchFixture({ time, homeTeam: home, awayTeam: away, league, date });
    });
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * True when an IP literal points at a loopback, private, link-local, unique-local,
 * carrier-grade NAT, multicast, reserved or otherwise non-public destination.
 * Handles IPv4, IPv6 and IPv4-mapped IPv6 (::ffff:a.b.c.d).
 */
export function isBlockedAddress(address: string): boolean {
  let ip = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);

  const version = isIP(ip);
  if (version === 0) return true; // not a valid literal: fail closed

  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||                          // "this" network
      a === 10 ||                         // private
      a === 127 ||                        // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) ||         // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||  // private
      (a === 192 && b === 168) ||         // private
      (a === 192 && b === 0) ||           // IETF protocol assignments / TEST-NET-1
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224                            // multicast, reserved, broadcast
    );
  }

  // IPv6
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === '::' || ip === '::1') return true;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    ip.startsWith('64:ff9b:') ||   // NAT64 (can embed private IPv4)
    ip.startsWith('2001:db8:')     // documentation
  );
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.google.internal'
  );
}

/**
 * DNS lookup that refuses to hand back any non-public address. Because the
 * validated address is the one the socket connects to, a hostname that
 * resolves to a private IP (or rebinds between check and use) cannot slip through.
 */
const publicOnlyLookup = ((hostname: string, options: any, callback: any) => {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as unknown as dns.LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      return cb(new Error('Scrape URL resolves to a private or local address.'));
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}) as any;

export async function scrapeUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid scrape URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) scrape URLs are allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Scrape URLs may not contain credentials.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Scrape URL port is not allowed.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) {
    throw new Error('Scrape URL targets a private or local address.');
  }
  // Literal IPs are checked directly; hostnames are checked at connect time below.
  if (isIP(hostname) !== 0 && isBlockedAddress(hostname)) {
    throw new Error('Scrape URL targets a private or local address.');
  }

  const { data } = await axios.get(url, {
    timeout: 10000,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
    maxRedirects: 0,
    responseType: 'text',
    httpAgent: new http.Agent({ lookup: publicOnlyLookup }),
    httpsAgent: new https.Agent({ lookup: publicOnlyLookup }),
  });
  const $ = cheerio.load(data);
  // Basic scraping - returning the fetched page body as text; redirects are deliberately disabled.
  return $('body').text();
}
