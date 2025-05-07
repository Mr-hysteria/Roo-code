import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import moment from "moment-timezone"

interface StatInfo {
	dialogCount: number
	recceRunCount: number
	startTime: string
	lastRecceRunTime: string
	workspacePath: string
	serviceRunStatus?: "success" | "failed" | "running" | undefined
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
	// 获取工作区路径
	const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ""

	// 初始化统计对象
	stats = {
		dialogCount: 0,
		recceRunCount: 0,
		startTime: moment().tz("Asia/Shanghai").format("YYYY-MM-DD[T]HH:mm:ss"),
		lastRecceRunTime: "",
		workspacePath,
		serviceRunStatus: "running",
	}

	// 确保日志目录存在并更新统计文件
	saveStatsToFile()
}

/**
 * 记录对话请求
 */
export function recordDialogCount(): void {
	if (!stats) return

	stats.dialogCount++
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
 * 保存统计信息到文件
 */
function saveStatsToFile(): void {
	try {
		if (!stats) return

		// 确保目录存在
		const logsDir = ensureLogsDir(stats.workspacePath)
		const filePath = path.join(logsDir, "run-stats.json")

		// 准备统计数据
		const statsData = {
			basicStats: {
				dialogCount: stats.dialogCount,
				recceRunCount: stats.recceRunCount,
				startTime: stats.startTime,
				lastRecceRunTime: stats.lastRecceRunTime || "",
				totalRunTimeSeconds: getRunDurationSeconds(),
				serviceRunStatus: stats.serviceRunStatus,
			},
		}

		// 写入文件
		fs.writeFileSync(filePath, JSON.stringify(statsData, null, 2), "utf-8")
	} catch (error) {
		console.error("保存统计信息失败:", error)
	}
}
