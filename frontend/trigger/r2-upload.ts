import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getR2Client() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID").trim(),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY").trim(),
    },
  });
}

export async function uploadTaskAudio({
  buffer,
  key,
  contentType = "audio/wav",
}: {
  buffer: Buffer;
  key: string;
  contentType?: string;
}) {
  const bucket = requireEnv("R2_BUCKET_NAME");
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}
