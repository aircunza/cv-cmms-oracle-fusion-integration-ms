import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { envs } from '../../config';

export class GeneralEncryption {
  private static key: Uint8Array = new TextEncoder().encode(
    envs.oracleEncryptionKey,
  );

  public static encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, new Uint8Array(iv));

    const inputData = new TextEncoder().encode(text);
    const encryptedUpdate = cipher.update(inputData);
    const encryptedFinal = cipher.final();

    const cipherText = new Uint8Array(
      encryptedUpdate.length + encryptedFinal.length,
    );
    cipherText.set(encryptedUpdate, 0);
    cipherText.set(encryptedFinal, encryptedUpdate.length);

    const tag = cipher.getAuthTag();

    const combined = new Uint8Array(iv.length + tag.length + cipherText.length);
    combined.set(iv, 0);
    combined.set(tag, iv.length);
    combined.set(cipherText, iv.length + tag.length);

    return Buffer.from(combined).toString('base64');
  }

  public static decrypt(data: string): string {
    const combined = Buffer.from(data, 'base64');

    const iv = new Uint8Array(combined.slice(0, 12));
    const tag = new Uint8Array(combined.slice(12, 28));
    const cipherText = new Uint8Array(combined.slice(28));

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    const decryptedUpdate = decipher.update(cipherText);
    const decryptedFinal = decipher.final();

    const decrypted = new Uint8Array(
      decryptedUpdate.length + decryptedFinal.length,
    );
    decrypted.set(decryptedUpdate, 0);
    decrypted.set(decryptedFinal, decryptedUpdate.length);

    return new TextDecoder().decode(decrypted);
  }
}
