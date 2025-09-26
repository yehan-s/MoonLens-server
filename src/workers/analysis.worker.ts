import type { Job } from 'bull';
import { Logger, Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

interface AnalysisJobData {
  projectId: string;
  projectPath: string;
  mergeRequestId: number;
  mergeRequestIid: number;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  url: string;
  repoUrl: string;
  lastCommit: {
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  };
  author: {
    name: string;
    username: string;
    email: string;
  };
  timestamp: string;
}

@Injectable()
export class AnalysisWorker {
  private readonly logger = new Logger(AnalysisWorker.name);

  constructor(private configService: ConfigService) {}

  /**
   * 处理 MR 分析任务
   */
  async handleAnalyzeMR(job: Job<AnalysisJobData>) {
    this.logger.log(`Processing MR analysis job ${job.id} for MR ${job.data.mergeRequestIid}`);
    const startTime = Date.now();
    
    let containerId: string | null = null;
    
    try {
      // 1. 生成唯一的任务 ID
      const taskId = crypto.randomBytes(16).toString('hex');
      
      // 2. 准备 Docker 容器环境变量
      const taskData = {
        taskId,
        projectId: job.data.projectId,
        projectPath: job.data.projectPath,
        mergeRequestId: job.data.mergeRequestId,
        mergeRequestIid: job.data.mergeRequestIid,
        repoUrl: job.data.repoUrl,
        sourceBranch: job.data.sourceBranch,
        targetBranch: job.data.targetBranch,
        token: await this.getProjectToken(job.data.projectId),
      };

      // 3. 启动 Docker 容器执行分析
      containerId = await this.runAnalysisContainer(taskData);
      
      // 4. 等待容器执行完成
      const analysisResult = await this.waitForContainer(containerId);
      
      // 5. 处理分析结果
      const processedResult = this.processAnalysisResult(analysisResult);
      
      // 6. 报告进度
      await job.progress(100);
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Job ${job.id} completed in ${processingTime}ms`);
      
      return {
        success: true,
        taskId,
        projectId: job.data.projectId,
        mergeRequestIid: job.data.mergeRequestIid,
        ...processedResult,
        processingTime,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      this.logger.error(`Analysis job ${job.id} failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      // 7. 确保清理容器（无论成功或失败）
      if (containerId) {
        await this.cleanupContainer(containerId);
      }
    }
  }

  /**
   * 获取项目访问令牌
   */
  private async getProjectToken(projectId: string): Promise<string> {
    // TODO: 从数据库或配置中获取项目的访问令牌
    // 这里暂时使用环境变量中的通用令牌
    return this.configService.get<string>('GITLAB_ACCESS_TOKEN', '');
  }

  /**
   * 运行分析容器
   */
  private async runAnalysisContainer(taskData: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const dockerArgs = [
        'run',
        '--rm', // 容器退出后自动删除
        '-d', // 后台运行
        '--name', `analysis-${taskData.taskId}`,
        '--read-only', // 只读根文件系统
        '--tmpfs', '/tmp:size=1G,mode=1770', // 内存文件系统
        '--memory', '2g', // 内存限制 2GB
        '--cpus', '1.0', // CPU 限制 1 核
        '--network', 'isolated_network', // 隔离网络
        '--user', '1000:1000', // 非 root 用户
        '--security-opt', 'no-new-privileges:true', // 禁止提权
        '--cap-drop', 'ALL', // 移除所有权限
        '--cap-add', 'CHOWN', // 仅允许必要权限
        '--cap-add', 'SETUID',
        '--cap-add', 'SETGID',
        '-e', `TASK_DATA=${JSON.stringify(taskData)}`,
        '-e', 'NODE_ENV=production',
        '-e', 'MAX_ANALYSIS_TIME=600000',
        '-e', 'MEMORY_LIMIT=2048',
        'moonlens/worker:latest',
      ];

      const docker = spawn('docker', dockerArgs);
      let containerId = '';
      let errorOutput = '';

      docker.stdout.on('data', (data) => {
        containerId += data.toString().trim();
      });

      docker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      docker.on('close', (code) => {
        if (code === 0 && containerId) {
          this.logger.log(`Started container: ${containerId.substring(0, 12)}`);
          resolve(containerId);
        } else {
          reject(new Error(`Failed to start container: ${errorOutput}`));
        }
      });

      docker.on('error', (error) => {
        reject(new Error(`Docker spawn error: ${error.message}`));
      });
    });
  }

  /**
   * 等待容器执行完成并获取结果
   */
  private async waitForContainer(containerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Analysis timeout exceeded'));
      }, 600000); // 10分钟超时

      // 等待容器完成
      const wait = spawn('docker', ['wait', containerId]);
      
      wait.on('close', (exitCode) => {
        clearTimeout(timeout);
        
        // 获取容器日志（分析结果）
        const logs = spawn('docker', ['logs', containerId]);
        let output = '';
        let errorOutput = '';

        logs.stdout.on('data', (data) => {
          output += data.toString();
        });

        logs.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        logs.on('close', () => {
          try {
            // 解析最后一行 JSON 输出
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            
            if (lastLine && lastLine.startsWith('{')) {
              const result = JSON.parse(lastLine);
              if (result.success) {
                resolve(result);
              } else {
                reject(new Error(result.error || 'Analysis failed'));
              }
            } else {
              // 如果没有 JSON 输出，检查错误
              reject(new Error(`No valid output from container: ${errorOutput}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse container output: ${error.message}`));
          }
        });
      });

      wait.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Docker wait error: ${error.message}`));
      });
    });
  }

  /**
   * 处理分析结果
   */
  private processAnalysisResult(result: any): any {
    // 确保不包含源代码
    if (result.results && result.results.issues) {
      result.results.issues = result.results.issues.map((issue: any) => ({
        ...issue,
        // 过滤掉任何可能的源代码
        snippet: undefined,
        code: undefined,
        sourceCode: undefined,
      }));
    }

    return {
      filesAnalyzed: result.results?.filesAnalyzed || 0,
      issuesFound: result.results?.issueCount || 0,
      issues: result.results?.issues || [],
      metrics: result.results?.metrics || {},
    };
  }

  /**
   * 清理容器
   */
  private async cleanupContainer(containerId: string): Promise<void> {
    return new Promise((resolve) => {
      // 强制停止并删除容器
      const stop = spawn('docker', ['stop', '-t', '0', containerId]);
      
      stop.on('close', () => {
        // 容器已经使用 --rm 标志，会自动删除
        this.logger.log(`Cleaned up container: ${containerId.substring(0, 12)}`);
        resolve();
      });

      stop.on('error', (error) => {
        this.logger.error(`Failed to stop container: ${error.message}`);
        // 即使失败也继续，容器会被系统清理
        resolve();
      });

      // 设置清理超时
      setTimeout(() => {
        this.logger.warn('Container cleanup timeout, forcing resolution');
        resolve();
      }, 5000);
    });
  }

  /**
   * 处理简单分析任务（向后兼容）
   */
  async handleAnalysis(job: Job) {
    // 转换为 MR 分析格式
    const mrData: AnalysisJobData = {
      projectId: job.data.projectId,
      projectPath: job.data.projectPath || '',
      mergeRequestId: job.data.mergeRequestId || 0,
      mergeRequestIid: job.data.mergeRequestIid || 0,
      sourceBranch: job.data.sourceBranch || 'main',
      targetBranch: job.data.targetBranch || 'main',
      title: job.data.title || 'Analysis',
      description: job.data.description || '',
      url: job.data.url || '',
      repoUrl: job.data.repoUrl,
      lastCommit: job.data.lastCommit || {
        id: '',
        message: '',
        timestamp: new Date().toISOString(),
        author: { name: '', email: '' },
      },
      author: job.data.author || {
        name: '',
        username: '',
        email: '',
      },
      timestamp: job.data.timestamp || new Date().toISOString(),
    };

    // 使用相同的处理逻辑
    return this.handleAnalyzeMR({ ...job, data: mrData } as Job<AnalysisJobData>);
  }
}