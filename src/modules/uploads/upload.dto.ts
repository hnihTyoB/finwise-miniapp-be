export const UPLOAD_PURPOSES = ['avatar'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const AVATAR_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

export interface CreatePresignedUploadDto {
  purpose: UploadPurpose;
  fileName: string;
  contentType: AvatarContentType;
  fileSize: number;
}

export interface PresignedUploadDto {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresIn: number;
  requiredHeaders: {
    'Content-Type': AvatarContentType;
  };
}
