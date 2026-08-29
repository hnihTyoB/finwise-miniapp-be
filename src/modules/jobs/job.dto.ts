import { AsyncJobStatus } from '@prisma/client';

export interface CreateAsyncJobDto {
  type: string;
  input?: Record<string, any>;
}

export interface AsyncJobResponseDto {
  id: string;
  userId: string;
  type: string;
  status: AsyncJobStatus;
  input: any;
  result: any;
  error: string | null;
  attempt: number;
  maxAttempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
