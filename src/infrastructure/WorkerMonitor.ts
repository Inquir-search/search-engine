import EventEmitter from 'events';

// Value Objects
export class MonitoringConfig {
    constructor(
        public readonly healthCheckInterval: number,
        public readonly performanceInterval: number,
        public readonly alertThresholds: AlertThresholds,
        public readonly historySize: number
    ) { }

    static create(options: Partial<MonitoringOptions> = {}): MonitoringConfig {
        return new MonitoringConfig(
            options.healthCheckInterval || 10000, // 10 seconds
            options.performanceInterval || 30000, // 30 seconds
            {
                queueLength: options.queueLength || 100,
                avgResponseTime: options.avgResponseTime || 5000, // 5 seconds
                failureRate: options.failureRate || 0.1, // 10%
                workerUtilization: options.workerUtilization || 0.9 // 90%
            },
            options.historySize || 100
        );
    }
}

export class HealthStatus {
    constructor(
        public readonly overall: HealthState,
        public readonly workers: Map<string, WorkerHealth>,
        public readonly lastCheck: number | null,
        public readonly issues: HealthIssue[]
    ) { }

    static healthy(): HealthStatus {
        return new HealthStatus('healthy', new Map(), null, []);
    }

    isHealthy(): boolean {
        return this.overall === 'healthy';
    }

    isCritical(): boolean {
        return this.overall === 'critical';
    }

    hasWarnings(): boolean {
        return this.overall === 'warning';
    }
}

export class PerformanceMetrics {
    constructor(
        public readonly averageResponseTime: number,
        public readonly throughput: number,
        public readonly errorRate: number,
        public readonly queueUtilization: number,
        public readonly workerUtilization: number
    ) { }

    static zero(): PerformanceMetrics {
        return new PerformanceMetrics(0, 0, 0, 0, 0);
    }

    isWithinThresholds(thresholds: AlertThresholds): boolean {
        return this.averageResponseTime <= thresholds.avgResponseTime &&
            this.errorRate <= thresholds.failureRate &&
            this.workerUtilization <= thresholds.workerUtilization;
    }
}

export class Alert {
    constructor(
        public readonly id: string,
        public readonly timestamp: number,
        public readonly type: string,
        public readonly severity: Severity,
        public readonly message: string,
        public readonly issue: HealthIssue
    ) { }

    static create(issue: HealthIssue): Alert {
        return new Alert(
            `alert-${Date.now()}-${Math.random()}`,
            Date.now(),
            issue.type,
            issue.severity,
            AlertMessageFormatter.format(issue),
            issue
        );
    }
}

// Domain Services
export class WorkerHealthAssessmentService {
    static assessWorkerHealth(workerStats: WorkerStats): WorkerHealth {
        const health: WorkerHealth = {
            status: 'healthy',
            issue: null,
            severity: 'info'
        };

        // For SharedMemoryWorkerPool, we have simpler health checks
        // since currentTask is just an ID, not an object with timing info
        if (!workerStats.isAvailable && workerStats.currentTask) {
            // We can only check if a worker has a task but no timing information
            // In a real implementation, we'd need to track task start times separately
            health.status = 'busy';
            health.issue = `Worker is processing task ${workerStats.currentTask}`;
            health.severity = 'info';
        }

        return health;
    }
}

export class QueueHealthAssessmentService {
    static assessQueueHealth(stats: WorkerPoolStats, thresholds: AlertThresholds): HealthAssessmentResult {
        const issues: HealthIssue[] = [];

        // Check queue lengths for SharedMemoryWorkerPool
        if (stats.queuedTasks > thresholds.queueLength) {
            issues.push({
                type: 'queue_length',
                queue: 'tasks',
                current: stats.queuedTasks,
                threshold: thresholds.queueLength,
                severity: 'warning'
            });
        }

        // Check pending tasks
        if (stats.queuedTasks > thresholds.queueLength * 2) {
            issues.push({
                type: 'pending_tasks',
                current: stats.queuedTasks,
                threshold: thresholds.queueLength * 2,
                severity: 'critical'
            });
        }

        return { issues };
    }
}

export class PerformanceHealthAssessmentService {
    static assessPerformanceHealth(stats: WorkerPoolStats, thresholds: AlertThresholds): HealthAssessmentResult {
        const issues: HealthIssue[] = [];

        // Check average response time
        if (stats.avgResponseTime > thresholds.avgResponseTime) {
            issues.push({
                type: 'response_time',
                current: stats.avgResponseTime,
                threshold: thresholds.avgResponseTime,
                severity: 'warning'
            });
        }

        // Check failure rate
        const failureRate = stats.totalTasks > 0 ? stats.failedTasks / stats.totalTasks : 0;
        if (failureRate > thresholds.failureRate) {
            issues.push({
                type: 'failure_rate',
                current: failureRate,
                threshold: thresholds.failureRate,
                severity: 'warning'
            });
        }

        // Check worker utilization for SharedMemoryWorkerPool
        const availableWorkers = stats.availableWorkers;
        const totalWorkers = stats.workers;
        const utilization = totalWorkers > 0 ? 1 - (availableWorkers / totalWorkers) : 0;
        if (utilization > thresholds.workerUtilization) {
            issues.push({
                type: 'worker_utilization',
                current: utilization,
                threshold: thresholds.workerUtilization,
                severity: 'warning'
            });
        }

        return { issues };
    }
}

export class AlertMessageFormatter {
    static format(issue: HealthIssue): string {
        switch (issue.type) {
            case 'worker_health':
                return `Worker ${(issue as any).workerId} is unhealthy: ${(issue as any).issue}`;
            case 'queue_length':
                return `${(issue as any).queue} queue is overloaded: ${issue.current} tasks (threshold: ${issue.threshold})`;
            case 'pending_tasks':
                return `Too many pending tasks: ${issue.current} (threshold: ${issue.threshold})`;
            case 'response_time':
                return `High response time: ${issue.current.toFixed(2)}ms (threshold: ${issue.threshold}ms)`;
            case 'failure_rate':
                return `High failure rate: ${(issue.current * 100).toFixed(1)}% (threshold: ${(issue.threshold * 100).toFixed(1)}%)`;
            case 'worker_utilization':
                return `High worker utilization: ${(issue.current * 100).toFixed(1)}% (threshold: ${(issue.threshold * 100).toFixed(1)}%)`;
            default:
                return `Unknown issue: ${issue.type}`;
        }
    }
}

export class RecommendationService {
    static generateRecommendations(stats: WorkerPoolStats, metrics: PerformanceMetrics, thresholds: AlertThresholds): Recommendation[] {
        const recommendations: Recommendation[] = [];

        // Queue recommendations
        if (stats.queuedTasks > stats.activeWorkers * 3) {
            recommendations.push({
                type: 'scaling',
                priority: 'medium',
                message: 'Consider adding more workers - queued tasks are much larger than active workers'
            });
        }

        if (stats.activeWorkers > thresholds.workerUtilization * 2) {
            recommendations.push({
                type: 'scaling',
                priority: 'high',
                message: 'Consider adding more workers - active workers are growing'
            });
        }

        // Performance recommendations
        if (metrics.averageResponseTime > 1000) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                message: 'Response time is high - consider optimizing search operations or adding more workers'
            });
        }

        if (metrics.errorRate > 0.05) {
            recommendations.push({
                type: 'reliability',
                priority: 'high',
                message: 'Error rate is elevated - investigate worker errors and system stability'
            });
        }

        return recommendations;
    }
}

// Main Monitor Class
export default class WorkerMonitor extends EventEmitter {
    private readonly config: MonitoringConfig;
    private readonly performanceHistory: PerformanceHistoryEntry[] = [];
    private readonly alertHistory: Alert[] = [];
    private healthStatus: HealthStatus;
    private performanceMetrics: PerformanceMetrics;
    private healthCheckInterval: NodeJS.Timer | null = null;
    private performanceInterval: NodeJS.Timer | null = null;

    constructor(
        private readonly workerPool: IWorkerPool,
        options: Partial<MonitoringOptions> = {}
    ) {
        super();

        this.config = MonitoringConfig.create(options);
        this.healthStatus = HealthStatus.healthy();
        this.performanceMetrics = PerformanceMetrics.zero();

        }

    start(): void {
        // Start health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
        if (typeof (this.healthCheckInterval as any).unref === 'function') {
            (this.healthCheckInterval as any).unref();
        }

        // Start performance monitoring
        this.performanceInterval = setInterval(() => {
            this.collectPerformanceMetrics();
        }, this.config.performanceInterval);
        if (typeof (this.performanceInterval as any).unref === 'function') {
            (this.performanceInterval as any).unref();
        }

        // Listen to worker pool events
        this.workerPool.on('taskSubmitted', (task: TaskEvent) => {
            this.recordTaskSubmitted(task);
        });

        }

    stop(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
            this.performanceInterval = null;
        }

        }

    private performHealthCheck(): void {
        const now = Date.now();
        const stats = this.workerPool.getStats();
        const issues: HealthIssue[] = [];

        // Check individual worker health
        const workerHealth = new Map<string, WorkerHealth>();
        for (const worker of this.workerPool.workers) {
            // For SharedMemoryWorkerPool, we'll use basic worker status
            const workerStats: WorkerStats = {
                workerId: worker.workerId,
                isAvailable: worker.isAvailable,
                currentTask: worker.currentTask
            };
            const health = WorkerHealthAssessmentService.assessWorkerHealth(workerStats);
            workerHealth.set(worker.workerId, health);

            if (health.status !== 'healthy') {
                issues.push({
                    type: 'worker_health',
                    workerId: worker.workerId,
                    issue: health.issue,
                    severity: health.severity,
                    current: 0,
                    threshold: 0
                });
            }
        }

        // Check queue health
        const queueHealth = QueueHealthAssessmentService.assessQueueHealth(stats, this.config.alertThresholds);
        if (queueHealth.issues.length > 0) {
            issues.push(...queueHealth.issues);
        }

        // Check performance health
        const performanceHealth = PerformanceHealthAssessmentService.assessPerformanceHealth(stats, this.config.alertThresholds);
        if (performanceHealth.issues.length > 0) {
            issues.push(...performanceHealth.issues);
        }

        // Update health status
        const overall: HealthState = issues.length === 0 ? 'healthy' :
            issues.some(i => i.severity === 'critical') ? 'critical' : 'warning';

        this.healthStatus = new HealthStatus(overall, workerHealth, now, issues);

        // Emit health check event
        this.emit('healthCheck', this.healthStatus);

        // Trigger alerts if needed
        if (issues.length > 0) {
            this.triggerAlerts(issues);
        }
    }

    private collectPerformanceMetrics(): void {
        const stats = this.workerPool.getStats();
        const now = Date.now();

        // Calculate throughput (tasks per second)
        const lastMetrics = this.performanceHistory[this.performanceHistory.length - 1];
        let throughput = 0;

        if (lastMetrics) {
            const timeDiff = (now - lastMetrics.timestamp) / 1000; // seconds
            const taskDiff = stats.completedTasks - lastMetrics.completedTasks;
            throughput = taskDiff / timeDiff;
        }

        // Calculate error rate
        const errorRate = stats.totalTasks > 0 ? stats.failedTasks / stats.totalTasks : 0;

        // Calculate queue utilization for SharedMemoryWorkerPool
        const totalQueueCapacity = this.config.alertThresholds.queueLength;
        const currentQueueLoad = stats.queuedTasks;
        const queueUtilization = currentQueueLoad / totalQueueCapacity;

        // Calculate worker utilization for SharedMemoryWorkerPool
        const availableWorkers = stats.availableWorkers;
        const totalWorkers = stats.workers;
        const workerUtilization = totalWorkers > 0 ? 1 - (availableWorkers / totalWorkers) : 0;

        // Update metrics
        this.performanceMetrics = new PerformanceMetrics(
            stats.avgResponseTime,
            throughput,
            errorRate,
            queueUtilization,
            workerUtilization
        );

        // Add to history
        const metrics: PerformanceHistoryEntry = {
            timestamp: now,
            averageResponseTime: this.performanceMetrics.averageResponseTime,
            throughput: this.performanceMetrics.throughput,
            errorRate: this.performanceMetrics.errorRate,
            queueUtilization: this.performanceMetrics.queueUtilization,
            workerUtilization: this.performanceMetrics.workerUtilization,
            totalTasks: stats.totalTasks,
            completedTasks: stats.completedTasks,
            failedTasks: stats.failedTasks,
            queuedTasks: stats.queuedTasks,
            activeWorkers: stats.activeWorkers
        };

        this.performanceHistory.push(metrics);

        // Limit history size
        if (this.performanceHistory.length > this.config.historySize) {
            this.performanceHistory.shift();
        }

        // Emit performance metrics event
        this.emit('performanceMetrics', metrics);
    }

    private recordTaskSubmitted(task: TaskEvent): void {
        // This can be used for real-time monitoring
        this.emit('taskSubmitted', {
            taskId: task.id,
            operationType: task.operation.type,
            timestamp: task.createdAt
        });
    }

    private triggerAlerts(issues: HealthIssue[]): void {
        for (const issue of issues) {
            const alert = Alert.create(issue);

            this.alertHistory.push(alert);

            // Limit alert history
            if (this.alertHistory.length > this.config.historySize) {
                this.alertHistory.shift();
            }

            // Emit alert
            this.emit('alert', alert);

            // Log alert
            const logLevel = issue.severity === 'critical' ? 'error' : 'warn';
            console[logLevel](`🚨 Worker Pool Alert (${issue.severity}): ${alert.message}`);
        }
    }

    // Public API
    getHealthStatus(): HealthStatus {
        return this.healthStatus;
    }

    getPerformanceMetrics(): PerformanceMetrics {
        return this.performanceMetrics;
    }

    getPerformanceHistory(): PerformanceHistoryEntry[] {
        return [...this.performanceHistory];
    }

    getAlertHistory(): Alert[] {
        return [...this.alertHistory];
    }

    getMonitoringReport(): MonitoringReport {
        return {
            healthStatus: this.healthStatus,
            performanceMetrics: this.performanceMetrics,
            performanceHistory: this.performanceHistory.slice(-10), // Last 10 entries
            alertHistory: this.alertHistory.slice(-10), // Last 10 alerts
            workerPoolStats: this.workerPool.getStats(),
            monitoringConfig: this.config
        };
    }

    getRecommendations(): Recommendation[] {
        const stats = this.workerPool.getStats();
        return RecommendationService.generateRecommendations(stats, this.performanceMetrics, this.config.alertThresholds);
    }
}

// Type Definitions
export interface MonitoringOptions {
    healthCheckInterval?: number;
    performanceInterval?: number;
    queueLength?: number;
    avgResponseTime?: number;
    failureRate?: number;
    workerUtilization?: number;
    historySize?: number;
}

export interface AlertThresholds {
    queueLength: number;
    avgResponseTime: number;
    failureRate: number;
    workerUtilization: number;
}

export type HealthState = 'healthy' | 'warning' | 'critical';
export type Severity = 'info' | 'warning' | 'critical';

export interface WorkerHealth {
    status: string;
    issue: string | null;
    severity: Severity;
}

export interface HealthIssue {
    type: string;
    current: number;
    threshold: number;
    severity: Severity;
    workerId?: string;
    queue?: string;
    issue?: string;
}

export interface HealthAssessmentResult {
    issues: HealthIssue[];
}

export interface PerformanceHistoryEntry {
    timestamp: number;
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    queueUtilization: number;
    workerUtilization: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    queuedTasks: number;
    activeWorkers: number;
}

export interface Recommendation {
    type: string;
    priority: 'low' | 'medium' | 'high';
    message: string;
}

export interface MonitoringReport {
    healthStatus: HealthStatus;
    performanceMetrics: PerformanceMetrics;
    performanceHistory: PerformanceHistoryEntry[];
    alertHistory: Alert[];
    workerPoolStats: WorkerPoolStats;
    monitoringConfig: MonitoringConfig;
}

export interface WorkerStats {
    workerId: string;
    isAvailable: boolean;
    currentTask: string | null;
}

export interface WorkerPoolStats {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    queuedTasks: number;
    activeWorkers: number;
    availableWorkers: number;
    workers: number;
    avgResponseTime: number;
}

export interface TaskEvent {
    id: string;
    operation: {
        type: string;
    };
    createdAt: number;
}

export interface IWorkerPool {
    workers: Array<{
        workerId: string;
        isAvailable: boolean;
        currentTask: string | null;
    }>;
    getStats(): WorkerPoolStats;
    on(event: string, listener: Function): void;
}