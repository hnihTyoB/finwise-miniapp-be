import { ReminderFrequency, ReminderType } from '@prisma/client';

export interface ReminderQueryDto {
  type?: ReminderType;
  isActive?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
  page: number;
  limit: number;
}

export interface CreateReminderDto {
  type: ReminderType;
  title: string;
  message?: string | null;
  remindAt: Date;
  frequency: ReminderFrequency;
  repeatInterval: number;
  endAt?: Date | null;
  actionUrl?: string | null;
  isActive: boolean;
}

export interface UpdateReminderDto {
  type?: ReminderType;
  title?: string;
  message?: string | null;
  remindAt?: Date;
  frequency?: ReminderFrequency;
  repeatInterval?: number;
  endAt?: Date | null;
  actionUrl?: string | null;
  isActive?: boolean;
}

export interface PersistReminderDto {
  type: ReminderType;
  title: string;
  message: string | null;
  remindAt: Date;
  frequency: ReminderFrequency;
  repeatInterval: number;
  endAt: Date | null;
  nextTriggerAt: Date | null;
  actionUrl: string | null;
  isActive: boolean;
}
