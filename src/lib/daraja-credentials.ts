import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const value = process.env.DARAJA_CREDENTIALS_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("M-Pesa credential encryption is not configured on the server.");
  }
  return Buffer.from(value, "hex");
}

export function encryptDarajaSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptDarajaSecret(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Stored M-Pesa credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[0], "hex"));
  decipher.setAuthTag(Buffer.from(parts[1], "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], "hex")),
    decipher.final(),
  ]).toString("utf8");
}
