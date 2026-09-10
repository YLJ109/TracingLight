/**
 * 上传存储抽象：本地磁盘（默认）或 S3 兼容对象存储（可选）。
 *
 * 用法：本地零配置；要切对象存储时设置环境变量 STORAGE_DRIVER=s3 并提供 S3_*：
 *   STORAGE_DRIVER=s3
 *   S3_ENDPOINT=https://<bucket>.<region>.aliyuncs.com  或 https://minio.local:9000
 *   S3_REGION=us-east-1
 *   S3_ACCESS_KEY / S3_SECRET_KEY
 *   S3_BUCKET=<bucket>
 *   S3_PUBLIC_URL=https://<cdn域名>       （可选，用于生成对外可访问的 URL，默认用 endpoint）
 *
 * 说明：
 * - 兼容 AWS S3 / MinIO / 腾讯云 COS / Cloudflare R2 / Ceph 等 S3 协议端点。
 * - 阿里云 OSS 原生 not-effective 于 AWS SigV4，建议用 OSS 官方 SDK 或改用上述 S3 兼容端点。
 * - 返回值 url：本地为相对路径(/uploads/...)，S3 为绝对公网 URL，前端的 <img>/<video> 均直接可用。
 */
import { createHmac, createHash } from 'crypto';

export interface SaveResult {
  key: string;
  url: string;
  localAbsPath: string | null;
  kind: 'local' | 's3';
}

export function storageDriver(): 'local' | 's3' {
  return process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
}

interface S3Config {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicBase: string;
}

function s3Config(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || '',
    publicBase: process.env.S3_PUBLIC_URL || '',
  };
}

/**
 * 保存上传文件。
 * @param category 子目录：'avatars' | 'materials' | ...
 * @param filename 随机生成的文件名（含扩展名）
 * @param data     文件二进制
 * @param contentType MIME 类型
 */
export async function saveUpload(
  category: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<SaveResult> {
  const key = `${category}/${filename}`;
  if (storageDriver() === 's3') {
    return s3PutObject(key, data, contentType);
  }
  const { writeFile, mkdir } = await import('fs/promises');
  const { resolve, join } = await import('path');
  const uploadsDir = resolve(process.cwd(), 'public', 'uploads');
  const dir = join(uploadsDir, category);
  await mkdir(dir, { recursive: true });
  const abs = join(dir, filename);
  await writeFile(abs, data);
  return { key, url: `/uploads/${key}`, localAbsPath: abs, kind: 'local' };
}

export async function deleteUploadLocal(localAbsPath: string | null): Promise<void> {
  if (!localAbsPath) return;
  try {
    const { existsSync, unlinkSync } = await import('fs');
    if (existsSync(localAbsPath)) unlinkSync(localAbsPath);
  } catch {
    /* 删除失败不影响主流程 */
  }
}

/* ==================== S3 (SigV4) PUT ==================== */

function sh256(buf: string | Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function hmac(key: string | Buffer, str: string): Buffer {
  return createHmac('sha256', key).update(str).digest();
}

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

async function s3PutObject(key: string, data: Buffer, contentType: string): Promise<SaveResult> {
  const cfg = s3Config();
  if (!cfg.endpoint || !cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
    throw new Error('S3 配置不完整（需要 S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY）');
  }
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 's3';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const host = (() => {
    const u = new URL(cfg.endpoint);
    return u.host;
  })();
  const encodePath = key.split('/').map(encodeURIComponent).join('/');
  // 虚拟主机式 path-style：POST /bucket/key
  const canonicalUri = `/${cfg.bucket}/${encodePath}`;

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sh256(canonicalRequest),
  ].join('\n');

  const signature = hmac(
    signingKey(cfg.secretKey, dateStamp, cfg.region, service),
    stringToSign,
  ).toString('hex');

  const authorization =
    `${algorithm} Credential=${cfg.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const putRes = await fetch(`${cfg.endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: new Uint8Array(data),
  });

  if (!putRes.ok) {
    throw new Error(`S3 上传失败: ${putRes.status} ${await putRes.text().catch(() => '')}`);
  }

  const base = (cfg.publicBase || cfg.endpoint).replace(/\/$/, '');
  return { key, url: `${base}/${cfg.bucket}/${encodePath}`, localAbsPath: null, kind: 's3' };
}