#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable */

/**
 * Simple 16-digit license generator and validator.
 *
 * Secure token with embedded validity window and HMAC integrity.
 *
 * Payload: startDays(4 bytes) | endDays(4 bytes)  => 8 bytes
 * MAC: HMAC-SHA256(payload, secret) -> take first 2 bytes => 2 bytes
 * Total: 10 bytes = 80 bits -> Base32 (RFC4648) => 16 chars
 *
 * Token display format: XXXX-XXXX-XXXX-XXXX (Base32 alphabet A-Z2-7)
 * - Secret is required to generate and verify. Provide via env LICENSE_SECRET or CLI --secret.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const crypto = require('crypto');

function toDashed(code16) {
  // Assumes 16 digits
  return `${code16.slice(0, 4)}-${code16.slice(4, 8)}-${code16.slice(8, 12)}-${code16.slice(12, 16)}`;
}

function stripFormatting(input) {
  // Remove spaces and dashes
  return String(input).replace(/[\s-]+/g, '').toUpperCase();
}

function pad(number, length) {
  const str = String(number);
  return str.length >= length ? str : '0'.repeat(length - str.length) + str;
}

function toUtcYyyyMmDd(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  const d = date.getUTCDate();
  return `${pad(y, 4)}${pad(m, 2)}${pad(d, 2)}`;
}

// removed legacy parseYyyyMmDd; token is now HMAC-signed Base32

function generateLicense(startDateInput, endDateInput) {
  const startDate = normalizeToDate(startDateInput);
  const endDate = normalizeToDate(endDateInput);
  if (!startDate || !endDate) {
    throw new Error('Invalid date(s). Use Date objects or ISO strings like 2025-09-12.');
  }
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('Start date must be before or equal to end date.');
  }
  const secret = resolveSecret();
  const payload = packPayload(startDate, endDate);
  const mac = computeMac(payload, secret);
  const tokenBytes = Buffer.concat([payload, mac]); // 10 bytes
  const code = base32EncodeNoPad(tokenBytes);
  return toDashed(code);
}

function decodeLicense(code) {
  if (typeof code !== 'string') return { ok: false, error: 'Code must be a string.' };
  const trimmed = stripFormatting(code);
  if (!/^[A-Z2-7]{16}$/.test(trimmed)) {
    return { ok: false, error: 'Code must be 16 Base32 chars (A-Z2-7).' };
  }
  let bytes;
  try {
    bytes = base32DecodeNoPad(trimmed);
  } catch (e) {
    return { ok: false, error: 'Invalid Base32 encoding.' };
  }
  if (bytes.length !== 10) {
    return { ok: false, error: 'Invalid token length.' };
  }
  const payload = bytes.subarray(0, 8);
  const mac = bytes.subarray(8, 10);
  const secret = resolveSecret();
  const expectedMac = computeMac(payload, secret);
  if (!timingSafeEqual(mac, expectedMac)) {
    return { ok: false, error: 'Signature verification failed.' };
  }
  const { startDate, endDate } = unpackPayload(payload);
  if (startDate.getTime() > endDate.getTime()) {
    return { ok: false, error: 'Start date is after end date.' };
  }
  return { ok: true, startDate, endDate };
}

function validateLicense(code, nowDate) {
  const decoded = decodeLicense(code);
  if (!decoded.ok) {
    return { valid: false, reason: decoded.error };
  }
  const now = nowDate ? normalizeToDate(nowDate) : new Date();
  if (!now) {
    return { valid: false, reason: 'Invalid current date.' };
  }
  // Compare using UTC day granularity
  const nowStr = toUtcYyyyMmDd(now);
  const startStr = toUtcYyyyMmDd(decoded.startDate);
  const endStr = toUtcYyyyMmDd(decoded.endDate);
  const within = startStr <= nowStr && nowStr <= endStr;
  return {
    valid: within,
    reason: within ? 'OK' : `Out of range: ${startStr}..${endStr}, now=${nowStr}`,
    startDate: decoded.startDate,
    endDate: decoded.endDate,
    now: now
  };
}

function normalizeToDate(input) {
  if (input instanceof Date) return input;
  if (typeof input === 'string') {
    // Accept YYYY-MM-DD or YYYY/MM/DD or YYYYMMDD
    const cleaned = input.trim();
    let date;
    if (/^\d{8}$/.test(cleaned)) {
      const iso = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
      date = new Date(`${iso}T00:00:00.000Z`);
    } else {
      // Let Date parse ISO-like strings
      date = new Date(cleaned);
    }
    if (isNaN(date.getTime())) return null;
    return date;
  }
  return null;
}

function resolveSecret() {
  // const fromEnv = process.env.LICENSE_SECRET;
  const fromEnv = 'my-secret-123';
  if (fromEnv && fromEnv.trim()) return fromEnv;
  // For CLI, allow --secret=... as a fallback
  const arg = (process.argv || []).find(a => a.startsWith('--secret='));
  if (arg) return arg.slice('--secret='.length);
  throw new Error('Missing LICENSE_SECRET. Set env LICENSE_SECRET or use --secret=...');
}

function daysSinceEpoch(date) {
  // Use UTC midnight
  const ms = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor(ms / 86400000); // 24*60*60*1000
}

function dateFromDays(days) {
  const ms = days * 86400000;
  return new Date(ms);
}

function packPayload(startDate, endDate) {
  const startDays = daysSinceEpoch(startDate) >>> 0;
  const endDays = daysSinceEpoch(endDate) >>> 0;
  const buf = Buffer.allocUnsafe(8);
  buf.writeUInt32BE(startDays, 0);
  buf.writeUInt32BE(endDays, 4);
  return buf;
}

function unpackPayload(buf) {
  const startDays = buf.readUInt32BE(0);
  const endDays = buf.readUInt32BE(4);
  return { startDate: dateFromDays(startDays), endDate: dateFromDays(endDays) };
}

function computeMac(payloadBuf, secret) {
  const macFull = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(payloadBuf).digest();
  return macFull.subarray(0, 2); // first 16 bits
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function base32EncodeNoPad(buffer) {
  // RFC4648 Base32 alphabet without padding; returns uppercase
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  // Ensure fixed length 16 for 10 input bytes
  if (output.length !== 16) {
    // Adjust if implementation detail diverges
    output = output.slice(0, 16).padEnd(16, 'A');
  }
  return output;
}

function base32DecodeNoPad(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid Base32 char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// CLI usage
// Examples:
//  node scripts/generateLicense.js generate 2025-09-12 2025-12-31
//  LICENSE_SECRET=your-secret node scripts/generateLicense.js generate 2025-09-12 2025-12-31
//  LICENSE_SECRET=your-secret node scripts/generateLicense.js validate XXXX-XXXX-XXXX-XXXX
function runCli(argv) {
  const [,, command, ...args] = argv;
  switch ((command || '').toLowerCase()) {
    case 'generate': {
      const [startArg, endArg] = args;
      if (!startArg || !endArg) {
        console.error('Usage: generate <start:YYYY-MM-DD|YYYYMMDD> <end:YYYY-MM-DD|YYYYMMDD>');
        process.exit(2);
      }
      try {
        const code = generateLicense(startArg, endArg);
        console.log(code);
      } catch (err) {
        console.error(String(err.message || err));
        process.exit(1);
      }
      break;
    }
    case 'validate': {
      const [code] = args;
      if (!code) {
        console.error('Usage: validate <code: 16 digits or XXXX-XXXX-XXXX-XXXX>');
        process.exit(2);
      }
      const result = validateLicense(code);
      if (result.valid) {
        console.log('VALID');
        console.log(`start=${toUtcYyyyMmDd(result.startDate)}, end=${toUtcYyyyMmDd(result.endDate)}, now=${toUtcYyyyMmDd(result.now)}`);
        process.exit(0);
      } else {
        console.log('INVALID');
        console.log(result.reason);
        process.exit(1);
      }
      break;
    }
    default: {
      if (!command) return;
      console.error('Unknown command. Use one of: generate, validate');
      process.exit(2);
    }
  }
}

if (require.main === module) {
  runCli(process.argv);
}

module.exports = {
  generateLicense,
  validateLicense,
  decodeLicense
};


