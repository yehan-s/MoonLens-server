import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ReviewTask {
  id: string;
  userId: string;
  projectId: string;
  mrIid: string;
  status: TaskStatus;
  progress: number; // 0-100
  currentFile?: string;
  totalFiles: number;
  processedFiles: number;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskUpdateData {
  status?: TaskStatus;
  progress?: number;
  currentFile?: string;
  processedFiles?: number;
  result?: any;
  error?: string;
}

/**
 * 内存任务队列服务
 * 简单、可靠、零依赖
 */
@Injectable()
export class ReviewTaskQueueService {
  private readonly logger = new Logger(ReviewTaskQueueService.name);
  private tasks = new Map<string, ReviewTask>();
  private readonly maxTaskAge = 24 * 60 * 60 * 1000; // 24小时后清理
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每小时清理一次过期任务
    this.cleanupInterval = setInterval(() => this.cleanupOldTasks(), 60 * 60 * 1000);
  }

  /**
   * 创建新任务
   */
  createTask(
    userId: string,
    projectId: string,
    mrIid: string,
    totalFiles: number,
  ): ReviewTask {
    const task: ReviewTask = {
      id: randomUUID(),
      userId,
      projectId,
      mrIid,
      status: 'pending',
      progress: 0,
      totalFiles,
      processedFiles: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.logger.log(`创建任务: ${task.id} (项目=${projectId}, MR=${mrIid})`);
    
    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): ReviewTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 更新任务
   */
  updateTask(taskId: string, data: TaskUpdateData): ReviewTask | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`);
      return null;
    }

    // 更新字段
    if (data.status !== undefined) task.status = data.status;
    if (data.progress !== undefined) task.progress = data.progress;
    if (data.currentFile !== undefined) task.currentFile = data.currentFile;
    if (data.processedFiles !== undefined) task.processedFiles = data.processedFiles;
    if (data.result !== undefined) task.result = data.result;
    if (data.error !== undefined) task.error = data.error;
    
    task.updatedAt = new Date();
    
    if (data.status === 'completed' || data.status === 'failed') {
      task.completedAt = new Date();
      task.progress = 100;
    }

    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * 获取用户的任务列表
   */
  getUserTasks(userId: string, limit = 20): ReviewTask[] {
    const userTasks = Array.from(this.tasks.values())
      .filter(task => task.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    
    return userTasks;
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * 清理旧任务
   */
  private cleanupOldTasks(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const age = now - task.createdAt.getTime();
      
      // 删除超过24小时的已完成/失败任务
      if (age > this.maxTaskAge && (task.status === 'completed' || task.status === 'failed')) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`清理了 ${cleanedCount} 个过期任务`);
    }
  }

  /**
   * 获取队列统计
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      processing: tasks.filter(t => t.status === 'processing').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  /**
   * 清理资源
   */
  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
