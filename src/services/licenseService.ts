import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface LicenseData {
  startDate: string;
  endDate: string;
  licensee: string;
  signature?: string;
}

interface LicenseInfo {
  startDate: string;
  endDate: string;
  licensee: string;
  isValid: boolean;
  daysRemaining?: number;
}

class LicenseService {
  private licenseDir: string;
  private licensePath: string;
  private secret?: string;

  constructor(secret?: string) {
    // Use mounted volume path for license storage
    this.licenseDir = 'licenses';
    this.licensePath = path.join(this.licenseDir, 'license.json');
    this.secret = secret;

    // Ensure license directory exists
    this.ensureDirectoryExists();
  }

  /**
   * Generate a secure license token for the provided UTC date window.
   * Token format: XXXX-XXXX-XXXX-XXXX (Base32, 16 chars grouped by 4 with dashes)
   */
  public generateLicenseToken(
    start: string | Date,
    end: string | Date
  ): string {
    if (!this.secret || !this.secret.trim()) {
      throw new Error('Secret is required to generate a license token');
    }
    const startDate = this.normalizeToDate(start);
    const endDate = this.normalizeToDate(end);
    if (!startDate || !endDate) {
      throw new Error('Invalid start/end date');
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new Error('Start date must be before or equal to end date');
    }

    const payload = this.packPayload(startDate, endDate);
    const mac = this.computeMac(payload, this.secret);
    const tokenBytes = Buffer.concat([payload, mac]); // 10 bytes
    const code = this.base32EncodeNoPad(tokenBytes);
    return this.toDashed(code);
  }

  private toDashed(code16: string): string {
    return `${code16.slice(0, 4)}-${code16.slice(4, 8)}-${code16.slice(
      8,
      12
    )}-${code16.slice(12, 16)}`;
  }

  private normalizeToDate(input: string | Date): Date | null {
    if (input instanceof Date) return input;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (/^\d{8}$/.test(trimmed)) {
        const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(
          4,
          6
        )}-${trimmed.slice(6, 8)}`;
        const d = new Date(`${iso}T00:00:00.000Z`);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private daysSinceEpoch(date: Date): number {
    const ms = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    );
    return Math.floor(ms / 86400000);
  }

  private packPayload(startDate: Date, endDate: Date): Buffer {
    const startDays = this.daysSinceEpoch(startDate) >>> 0;
    const endDays = this.daysSinceEpoch(endDate) >>> 0;
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(startDays, 0);
    buf.writeUInt32BE(endDays, 4);
    return buf;
  }

  private computeMac(payloadBuf: Buffer, secret: string): Buffer {
    const macFull = crypto
      .createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(payloadBuf)
      .digest();
    return macFull.subarray(0, 2);
  }

  private unpackPayload(buf: Buffer): { startDate: Date; endDate: Date } {
    const startDays = buf.readUInt32BE(0);
    const endDays = buf.readUInt32BE(4);
    return {
      startDate: this.dateFromDays(startDays),
      endDate: this.dateFromDays(endDays),
    };
  }

  private dateFromDays(days: number): Date {
    const ms = days * 86400000;
    return new Date(ms);
  }

  private base32DecodeNoPad(str: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const idx = alphabet.indexOf(ch);
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

  private stripFormatting(input: string): string {
    return String(input)
      .replace(/[\s-]+/g, '')
      .toUpperCase();
  }

  private timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  private formatUtcYyyyMmDd(date: Date): string {
    const y = date.getUTCFullYear();
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private base32EncodeNoPad(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    // 10 input bytes should map to exactly 16 Base32 chars
    if (output.length !== 16) {
      output = output.slice(0, 16).padEnd(16, 'A');
    }
    return output;
  }

  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.licenseDir)) {
        fs.mkdirSync(this.licenseDir, { recursive: true });
      }
    } catch (error) {
      console.error('Error creating license directory:', error);
      throw new Error('Failed to create license directory');
    }
  }

  private generateSignature(data: Omit<LicenseData, 'signature'>): string {
    if (!this.secret) {
      throw new Error('Secret is required for license signature generation');
    }

    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto
      .createHmac('sha256', this.secret)
      .update(dataString)
      .digest('hex');
  }

  private verifySignature(license: LicenseData): boolean {
    if (!this.secret || !license.signature) {
      return false;
    }

    const { signature, ...dataForSignature } = license;
    const expectedSignature = this.generateSignature(dataForSignature);
    return signature === expectedSignature;
  }

  private decryptLicense(encryptedLicense: string): LicenseData {
    if (!this.secret || !this.secret.trim()) {
      throw new Error('Secret is required for license decryption');
    }

    // Support secure Base32 token (16 chars, optional dashes)
    const trimmed = this.stripFormatting(encryptedLicense);
    if (/^[A-Z2-7]{16}$/.test(trimmed)) {
      let bytes: Buffer;
      try {
        bytes = this.base32DecodeNoPad(trimmed);
      } catch (e) {
        throw new Error('Invalid token encoding');
      }
      if (bytes.length !== 10) {
        throw new Error('Invalid token length');
      }
      const payload = bytes.subarray(0, 8);
      const mac = bytes.subarray(8, 10);
      const expected = this.computeMac(payload, this.secret);
      if (!this.timingSafeEqual(mac, expected)) {
        throw new Error('Invalid token signature');
      }
      const { startDate, endDate } = this.unpackPayload(payload);
      return {
        startDate: this.formatUtcYyyyMmDd(startDate),
        endDate: this.formatUtcYyyyMmDd(endDate),
        licensee: 'token',
      };
    }

    // Fallback legacy: base64(AES-256-CBC(JSON))
    try {
      const encrypted = Buffer.from(encryptedLicense, 'base64');
      const iv = encrypted.subarray(0, 16);
      const encryptedData = encrypted.subarray(16);
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        Buffer.from(this.secret.padEnd(32, '0').substring(0, 32)),
        iv
      );
      let decrypted = decipher.update(encryptedData, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      const licenseData = JSON.parse(decrypted);
      if (
        !licenseData.startDate ||
        !licenseData.endDate ||
        !licenseData.licensee
      ) {
        throw new Error('Invalid license data: missing required fields');
      }
      return licenseData;
    } catch (error) {
      console.error('License decryption failed:', error);
      throw new Error(
        'Failed to decrypt license. Invalid license or wrong secret.'
      );
    }
  }

  async saveLicense(
    licenseData: Omit<LicenseData, 'signature'>
  ): Promise<void> {
    try {
      // Generate signature if secret is provided
      const license: LicenseData = {
        ...licenseData,
        ...(this.secret && { signature: this.generateSignature(licenseData) }),
      };

      await fs.promises.writeFile(
        this.licensePath,
        JSON.stringify(license, null, 2)
      );
    } catch (error) {
      console.error('Error saving license:', error);
      throw new Error('Failed to save license');
    }
  }

  async saveEncryptedLicense(encryptedLicense: string): Promise<void> {
    try {
      // Decrypt and validate the license
      const licenseData = this.decryptLicense(encryptedLicense);

      // Save the decrypted license
      await this.saveLicense(licenseData);
    } catch (error) {
      console.error('Error processing encrypted license:', error);
      throw error;
    }
  }

  async getLicenseInfo(): Promise<LicenseInfo> {
    try {
      if (!fs.existsSync(this.licensePath)) {
        return {
          startDate: '',
          endDate: '',
          licensee: '',
          isValid: false,
          daysRemaining: 0,
        };
      }

      const licenseContent = await fs.promises.readFile(
        this.licensePath,
        'utf8'
      );

      // Check if file is empty or contains only whitespace
      if (!licenseContent || licenseContent.trim() === '') {
        console.log('License file is empty');
        return {
          startDate: '',
          endDate: '',
          licensee: '',
          isValid: false,
          daysRemaining: 0,
        };
      }

      let license: LicenseData;
      try {
        license = JSON.parse(licenseContent);
      } catch (parseError) {
        console.log('Invalid JSON in license file:', parseError);
        return {
          startDate: '',
          endDate: '',
          licensee: '',
          isValid: false,
          daysRemaining: 0,
        };
      }

      // Check if required fields exist
      if (!license.startDate || !license.endDate || !license.licensee) {
        console.log('License file missing required fields');
        return {
          startDate: '',
          endDate: '',
          licensee: '',
          isValid: false,
          daysRemaining: 0,
        };
      }

      // Verify signature if secret is available
      const isSignatureValid = this.secret
        ? this.verifySignature(license)
        : true;

      // Check date validity
      const now = new Date();
      const startDate = new Date(license.startDate);
      const endDate = new Date(license.endDate);

      const isDateValid = now >= startDate && now <= endDate;
      const isValid = isSignatureValid && isDateValid;

      // Calculate days remaining
      const daysRemaining = isValid
        ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

      return {
        startDate: license.startDate,
        endDate: license.endDate,
        licensee: license.licensee,
        isValid,
        daysRemaining,
      };
    } catch (error) {
      console.error('Error reading license:', error);
      // Return invalid license info instead of throwing
      return {
        startDate: '',
        endDate: '',
        licensee: '',
        isValid: false,
        daysRemaining: 0,
      };
    }
  }

  async isLicenseValid(): Promise<boolean> {
    try {
      const licenseInfo = await this.getLicenseInfo();
      return licenseInfo.isValid;
    } catch (error) {
      console.error('Error checking license validity:', error);
      return false;
    }
  }

  /**
   * Check if a received license key is valid, not expired, and not already installed
   * @param receivedKey - The license key to check (can be with or without dashes)
   * @returns { isValid: boolean, isExpired: boolean, startDate: string, endDate: string, error?: string }
   */
  async checkReceivedLicense(receivedKey: string) {
    try {
      // 1. Decrypt the received license key
      const receivedLicense = this.decryptLicense(receivedKey);

      // 2. Check if the received license is expired
      const now = new Date();
      const endDate = new Date(receivedLicense.endDate);
      if (now > endDate) {
        return {
          isValid: false,
          isExpired: true,
          startDate: receivedLicense.startDate,
          endDate: receivedLicense.endDate,
          error: 'Received license has expired',
        };
      }

      // 3. Check if a license file already exists
      if (fs.existsSync(this.licensePath)) {
        const content = fs.readFileSync(this.licensePath, 'utf8').trim();

        if (content.length > 0) {
          let existingLicense;
          try {
            existingLicense = JSON.parse(content);
          } catch {
            return {
              isValid: false,
              isExpired: false,
              startDate: receivedLicense.startDate,
              endDate: receivedLicense.endDate,
              error:
                'Existing license file is corrupted. Please remove it before installing a new one.',
            };
          }

          // 🔑 Compare the new license with the existing one
          const sameLicense =
            existingLicense.startDate === receivedLicense.startDate &&
            existingLicense.endDate === receivedLicense.endDate &&
            existingLicense.licensee === receivedLicense.licensee;

          if (sameLicense) {
            return {
              isValid: false,
              isExpired: false,
              startDate: receivedLicense.startDate,
              endDate: receivedLicense.endDate,
              error: 'This license is already installed.',
            };
          }

        }
      }

      // 4. If valid → save the license to file
      await this.saveLicense(receivedLicense);

      return {
        isValid: true,
        isExpired: false,
        startDate: receivedLicense.startDate,
        endDate: receivedLicense.endDate,
      };
    } catch (error) {
      console.error('Error checking received license:', error);
      return {
        isValid: false,
        isExpired: false,
        startDate: '',
        endDate: '',
        error: error instanceof Error ? error.message : 'Invalid license key',
      };
    }
  }
}

export default LicenseService;
