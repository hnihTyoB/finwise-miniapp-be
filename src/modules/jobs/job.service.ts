import { JobRepository } from './job.repository';
import { CreateAsyncJobDto, AsyncJobResponseDto } from './job.dto';
import { webhookService } from '../webhooks/webhook.service';
import { AsyncJobStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class JobService {
  private readonly repository = new JobRepository();

  async createJob(userId: string, data: CreateAsyncJobDto): Promise<AsyncJobResponseDto> {
    const job = await this.repository.create({
      userId,
      type: data.type,
      input: data.input,
    });

    // Process job asynchronously (e.g. simulation, report export, bulk import)
    setImmediate(() => {
      this.executeJob(job.id, userId, data.type, data.input).catch((err) => {
        console.error(`[JobService] Background job execution error for ${job.id}:`, err);
      });
    });

    return {
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: job.status,
      input: job.input,
      result: job.result,
      error: job.error,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getJob(userId: string, id: string): Promise<AsyncJobResponseDto> {
    const job = await this.repository.findByIdAndUserId(id, userId);
    if (!job) {
      throw new AppError('Job not found', 404, ERROR_CODE.JOB_NOT_FOUND);
    }

    return {
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: job.status,
      input: job.input,
      result: job.result,
      error: job.error,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async listJobs(userId: string): Promise<AsyncJobResponseDto[]> {
    const jobs = await this.repository.findByUserId(userId);
    return jobs.map((job) => ({
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: job.status,
      input: job.input,
      result: job.result,
      error: job.error,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  }

  /**
   * Thực thi job và phát callback qua Webhook khi hoàn thành.
   */
  private async executeJob(jobId: string, userId: string, type: string, input: any): Promise<void> {
    const startedAt = new Date();
    await this.repository.updateStatus(jobId, AsyncJobStatus.PROCESSING, { startedAt });

    try {
      // Simulate task workload based on job type
      let result: any = {
        summary: `Job ${type} completed successfully`,
        processedAt: new Date().toISOString(),
      };

      if (type === 'REPORT_EXPORT') {
        result = {
          ...result,
          exportFormat: input?.format || 'PDF',
          downloadUrl: `https://storage.finwise.app/exports/${jobId}.${(input?.format || 'pdf').toLowerCase()}`,
          recordCount: 150,
        };
      } else if (type === 'AI_DEEP_ANALYSIS') {
        result = {
          ...result,
          insightsCount: 5,
          score: 85,
          recommendations: ['Tăng tỷ lệ tiết kiệm', 'Giảm chi phí ăn ngoài'],
        };
      }

      const completedAt = new Date();
      const updatedJob = await this.repository.updateStatus(jobId, AsyncJobStatus.COMPLETED, {
        result,
        completedAt,
      });

      // Dispatch Webhook event `job.completed` to all registered user endpoints!
      await webhookService.dispatchEventToUser(userId, 'job.completed', {
        jobId: updatedJob.id,
        type: updatedJob.type,
        status: 'COMPLETED',
        startedAt: updatedJob.startedAt,
        completedAt: updatedJob.completedAt,
        result: updatedJob.result,
      });
    } catch (err: any) {
      const completedAt = new Date();
      const updatedJob = await this.repository.updateStatus(jobId, AsyncJobStatus.FAILED, {
        error: err?.message || 'Job execution failed',
        completedAt,
      });

      // Dispatch Webhook event `job.failed` to all registered user endpoints!
      await webhookService.dispatchEventToUser(userId, 'job.failed', {
        jobId: updatedJob.id,
        type: updatedJob.type,
        status: 'FAILED',
        error: updatedJob.error,
        completedAt: updatedJob.completedAt,
      });
    }
  }
}

export const jobService = new JobService();
