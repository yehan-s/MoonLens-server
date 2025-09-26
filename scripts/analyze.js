#!/usr/bin/env node
/**
 * 代码分析工作器脚本
 * 在隔离容器中执行代码分析，确保零持久化
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class CodeAnalyzer {
  constructor() {
    this.workDir = '/tmp/work';
    this.maxTime = parseInt(process.env.MAX_ANALYSIS_TIME || '600000');
    this.memoryLimit = parseInt(process.env.MEMORY_LIMIT || '2048');
    this.startTime = Date.now();
  }

  /**
   * 验证容器环境
   */
  validateEnvironment() {
    // 确保在 tmpfs 中工作
    const mountInfo = fs.readFileSync('/proc/mounts', 'utf8');
    if (!mountInfo.includes('tmpfs /tmp')) {
      throw new Error('Security violation: /tmp is not mounted as tmpfs');
    }

    // 确保根文件系统是只读的
    try {
      fs.writeFileSync('/test.txt', 'test');
      throw new Error('Security violation: Root filesystem is writable');
    } catch (error) {
      if (error.code !== 'EROFS' && !error.message.includes('Read-only file system')) {
        if (!error.message.includes('Security violation')) {
          throw new Error('Security check failed: ' + error.message);
        }
        throw error;
      }
    }

    // 确保以非 root 用户运行
    if (process.getuid() === 0) {
      throw new Error('Security violation: Running as root user');
    }

    console.log('✓ Environment validation passed');
  }

  /**
   * 创建临时工作空间
   */
  createWorkspace() {
    const workspaceId = crypto.randomBytes(16).toString('hex');
    const workspacePath = path.join(this.workDir, workspaceId);
    
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    
    return workspacePath;
  }

  /**
   * 克隆仓库（浅克隆）
   */
  cloneRepository(repoUrl, token, workspace) {
    try {
      // 构建认证 URL（注意：不记录含 token 的 URL）
      const authUrl = repoUrl.replace('https://', `https://oauth2:${token}@`);
      
      // 浅克隆，仅获取最新提交
      execSync(
        `git clone --depth 1 --single-branch "${authUrl}" "${workspace}/repo"`,
        {
          stdio: 'pipe',
          timeout: 60000
        }
      );
      
      console.log('✓ Repository cloned successfully');
      return path.join(workspace, 'repo');
    } catch (error) {
      throw new Error('Failed to clone repository: ' + error.message.replace(token, '***'));
    }
  }

  /**
   * 获取变更文件
   */
  getChangedFiles(repoPath, baseBranch = 'main') {
    try {
      const result = execSync(
        `cd "${repoPath}" && git diff --name-only ${baseBranch}...HEAD`,
        { stdio: 'pipe' }
      );
      
      return result.toString().trim().split('\n').filter(Boolean);
    } catch (error) {
      // 如果无法获取 diff，返回所有文件
      const result = execSync(
        `cd "${repoPath}" && git ls-files`,
        { stdio: 'pipe' }
      );
      
      return result.toString().trim().split('\n').filter(Boolean);
    }
  }

  /**
   * 执行代码分析
   */
  analyzeCode(repoPath, changedFiles) {
    const issues = [];
    
    // 示例：运行 ESLint
    changedFiles.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        try {
          const filePath = path.join(repoPath, file);
          if (fs.existsSync(filePath)) {
            // 这里仅示例，实际应调用真实的分析工具
            const stats = fs.statSync(filePath);
            
            issues.push({
              file: file,
              line: 1,
              severity: 'info',
              message: `File size: ${stats.size} bytes`,
              type: 'metrics'
            });
          }
        } catch (error) {
          console.error(`Failed to analyze ${file}:`, error.message);
        }
      }
    });
    
    return {
      filesAnalyzed: changedFiles.length,
      issues: issues,
      metrics: {
        totalFiles: changedFiles.length,
        analyzedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 清理工作空间（确保代码完全销毁）
   */
  cleanupWorkspace(workspace) {
    try {
      // 覆写文件内容（安全删除）
      const overwriteFiles = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            overwriteFiles(filePath);
          } else {
            // 用随机数据覆写文件
            const size = stat.size;
            const randomData = crypto.randomBytes(Math.min(size, 1024));
            fs.writeFileSync(filePath, randomData);
          }
        });
      };
      
      if (fs.existsSync(workspace)) {
        overwriteFiles(workspace);
        
        // 删除所有文件
        execSync(`rm -rf "${workspace}"`, { stdio: 'pipe' });
      }
      
      console.log('✓ Workspace cleaned successfully');
    } catch (error) {
      console.error('Cleanup error:', error.message);
      // 强制删除
      try {
        execSync(`rm -rf "${workspace}"`, { stdio: 'pipe' });
      } catch (e) {
        // 忽略错误，容器将被销毁
      }
    }
  }

  /**
   * 主执行流程
   */
  async run() {
    let workspace = null;
    
    try {
      // 1. 验证环境
      this.validateEnvironment();
      
      // 2. 获取任务参数
      const taskData = JSON.parse(process.env.TASK_DATA || '{}');
      const { repoUrl, token, projectId, mergeRequestId } = taskData;
      
      if (!repoUrl || !token) {
        throw new Error('Missing required task parameters');
      }
      
      // 3. 创建工作空间
      workspace = this.createWorkspace();
      console.log('✓ Workspace created');
      
      // 4. 克隆仓库
      const repoPath = this.cloneRepository(repoUrl, token, workspace);
      
      // 5. 获取变更文件
      const changedFiles = this.getChangedFiles(repoPath);
      console.log(`✓ Found ${changedFiles.length} changed files`);
      
      // 6. 执行分析
      const results = this.analyzeCode(repoPath, changedFiles);
      console.log(`✓ Analysis completed: ${results.issues.length} issues found`);
      
      // 7. 输出结果（不含源代码）
      console.log(JSON.stringify({
        success: true,
        projectId,
        mergeRequestId,
        results: {
          filesAnalyzed: results.filesAnalyzed,
          issueCount: results.issues.length,
          issues: results.issues.map(issue => ({
            ...issue,
            // 确保不输出源代码
            snippet: issue.snippet ? '[REDACTED]' : undefined
          })),
          metrics: results.metrics
        }
      }));
      
    } catch (error) {
      console.error(JSON.stringify({
        success: false,
        error: error.message.replace(/token=[\w-]+/gi, 'token=***')
      }));
      process.exit(1);
    } finally {
      // 8. 清理工作空间（无论成功或失败都执行）
      if (workspace) {
        this.cleanupWorkspace(workspace);
      }
      
      // 9. 检查超时
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.maxTime) {
        console.error('Analysis timeout exceeded');
        process.exit(1);
      }
    }
  }
}

// 处理信号，确保清理
let analyzer = null;
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  if (analyzer && analyzer.workspace) {
    analyzer.cleanupWorkspace(analyzer.workspace);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  if (analyzer && analyzer.workspace) {
    analyzer.cleanupWorkspace(analyzer.workspace);
  }
  process.exit(0);
});

// 主程序
if (require.main === module) {
  analyzer = new CodeAnalyzer();
  analyzer.run().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}