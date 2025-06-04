import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import moment from "moment-timezone"
import { getApiMetrics } from "../shared/getApiMetrics"
import { ClineMessage } from "../shared/ExtensionMessage"
import { TokenUsage } from "../schemas"

// export let inputPrice = 0

interface StatInfo {
	dialogCount: number
	recceRunCount: number
	startTime: string
	lastRecceRunTime: string
	workspacePath: string
	serviceRunStatus?: "success" | "failed" | "running" | undefined
	tokenStats: TokenUsage
}

// 全局统计信息
let stats: StatInfo | null = null

/**
 * 确保日志目录存在
 */
function ensureLogsDir(workspacePath: string): string {
	const logsDir = path.join(workspacePath, "logs")
	if (!fs.existsSync(logsDir)) {
		fs.mkdirSync(logsDir, { recursive: true })
	}
	return logsDir
}

/**
 * 初始化统计信息
 */
export function initStats(): void {
	const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""

	stats = {
		dialogCount: 0,
		recceRunCount: 0,
		startTime: moment().tz("Asia/Shanghai").format("YYYY-MM-DD[T]HH:mm:ss"),
		lastRecceRunTime: "",
		workspacePath,
		serviceRunStatus: "running",
		tokenStats: {
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCost: 0,
			contextTokens: 0,
		},
	}

	saveStatsToFile()
}

/**
 * 记录对话请求
 */
export function recordDialogCount(messages: ClineMessage[]): void {
	if (!stats) return

	stats.dialogCount++
	updateTokenStats(messages)
	saveStatsToFile()
}

/**
 * 记录Recce运行次数
 */
export function recordRecceRunCount(): void {
	if (!stats) return

	stats.recceRunCount++
	stats.lastRecceRunTime = moment().tz("Asia/Shanghai").format("YYYY-MM-DD[T]HH:mm:ss")
	saveStatsToFile()
}

/**
 * 更新服务运行状态
 */
export function updateServiceRunStatus(status: "success" | "failed" | "running"): void {
	if (!stats) return

	stats.serviceRunStatus = status
	saveStatsToFile()
}

/**
 * 计算运行总时长（秒）
 */
function getRunDurationSeconds(): number {
	if (!stats?.lastRecceRunTime || !stats?.startTime) return 0

	const start = moment(stats.startTime)
	const end = stats.lastRecceRunTime ? moment(stats.lastRecceRunTime) : moment()
	return Math.floor(moment.duration(end.diff(start)).asSeconds())
}

/**
 * 更新Token统计
 */
export function updateTokenStats(messages: ClineMessage[]): void {
	if (!stats) return

	const tokenUsage: TokenUsage = getApiMetrics(messages)

	// 累加Token统计数据
	stats.tokenStats.totalTokensIn = tokenUsage.totalTokensIn
	stats.tokenStats.totalTokensOut = tokenUsage.totalTokensOut
	stats.tokenStats.totalCost = tokenUsage.totalCost
	// contextTokens使用最新值，因为它代表当前上下文大小
	stats.tokenStats.contextTokens = tokenUsage.contextTokens
}

/**
 * 保存统计信息到文件
 */
function saveStatsToFile(): void {
	try {
		if (!stats) return

		const logsDir = ensureLogsDir(stats.workspacePath)
		const filePath = path.join(logsDir, "run-stats.json")

		const statsData = {
			basicStats: {
				dialogCount: stats.dialogCount,
				recceRunCount: stats.recceRunCount,
				startTime: stats.startTime,
				lastRecceRunTime: stats.lastRecceRunTime || "",
				totalRunTimeSeconds: getRunDurationSeconds(),
				serviceRunStatus: stats.serviceRunStatus,
				tokenStats: {
					totalTokensIn: stats.tokenStats.totalTokensIn,
					totalTokensOut: stats.tokenStats.totalTokensOut,
					totalCost: stats.tokenStats.totalCost,
					contextTokens: stats.tokenStats.contextTokens,
				},
			},
		}

		fs.writeFileSync(filePath, JSON.stringify(statsData, null, 2), "utf-8")
	} catch (error) {
		console.error("保存统计信息失败:", error)
	}
}
