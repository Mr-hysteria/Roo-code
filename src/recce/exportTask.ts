import * as path from "path"
import * as fs from "fs/promises"
import { ClineProvider } from "../core/webview/ClineProvider"
import { getWorkspacePath } from "../utils/path"

/**
 * 导出任务相关的错误类型
 */
export class ExportTaskError extends Error {
	override name = "ExportTaskError"
	override cause?: unknown

	constructor(message: string, cause?: unknown) {
		super(message)
		this.cause = cause
	}
}

/**
 * 导出任务到指定路径
 * @param taskId 任务ID
 * @param savePath 保存路径，如果不提供则使用默认路径（项目根目录下的logs/chatHistory）
 * @param provider ClineProvider实例，用于获取任务历史
 * @returns 返回保存的文件路径
 * @throws {ExportTaskError} 当导出过程中发生错误时
 */
export async function exportTask(
	taskId: string,
	savePath: string | undefined,
	provider: ClineProvider,
): Promise<string> {
	try {
		if (!taskId) {
			throw new ExportTaskError("任务ID不能为空")
		}

		if (!provider) {
			throw new ExportTaskError("provider 不能为空")
		}

		// 获取任务历史
		const { historyItem, apiConversationHistory } = await provider.getTaskWithId(taskId).catch((error) => {
			throw new ExportTaskError(`获取任务历史失败: ${error.message}`, error)
		})

		if (!historyItem || !apiConversationHistory) {
			throw new ExportTaskError("无法获取任务历史数据")
		}

		// 生成文件名
		const fileName = `roo_task_${taskId}.md`

		// 生成 markdown 内容
		const markdownContent = apiConversationHistory
			.map((message) => {
				try {
					const role = message.role === "user" ? "**User:**" : "**Assistant:**"
					const content = Array.isArray(message.content)
						? message.content.map((block) => formatContentBlockToMarkdown(block)).join("\n")
						: message.content
					return `${role}\n\n${content}\n\n`
				} catch (error) {
					console.warn(`格式化消息时出错: ${error}`)
					return "" // 跳过错误的消息
				}
			})
			.filter(Boolean) // 移除空字符串
			.join("---\n\n")

		if (!markdownContent.trim()) {
			throw new ExportTaskError("生成的 Markdown 内容为空")
		}

		// 确定最终的保存路径
		let finalSavePath: string

		if (!savePath) {
			// 使用默认路径：项目根目录/logs/chatHistory
			const workspacePath = getWorkspacePath()
			if (!workspacePath) {
				throw new ExportTaskError("无法获取工作区路径")
			}
			const defaultSaveDir = path.join(workspacePath, "logs", "chatHistory")
			// 确保目录存在
			await fs.mkdir(defaultSaveDir, { recursive: true }).catch((error) => {
				throw new ExportTaskError(`创建目录失败: ${error.message}`, error)
			})
			finalSavePath = path.join(defaultSaveDir, fileName)
		} else {
			try {
				const stats = await fs.stat(savePath).catch(() => null)
				if (stats?.isDirectory()) {
					// 如果提供的是目录路径，使用自动生成的文件名
					finalSavePath = path.join(savePath, fileName)
				} else {
					// 如果提供的是文件路径，直接使用
					finalSavePath = savePath
				}
			} catch (error) {
				throw new ExportTaskError(`检查保存路径失败: ${error.message}`, error)
			}
		}

		// 确保目标目录存在
		await fs.mkdir(path.dirname(finalSavePath), { recursive: true }).catch((error) => {
			throw new ExportTaskError(`创建目标目录失败: ${error.message}`, error)
		})

		// 写入文件
		await fs.writeFile(finalSavePath, markdownContent).catch((error) => {
			throw new ExportTaskError(`写入文件失败: ${error.message}`, error)
		})

		return finalSavePath
	} catch (error) {
		if (error instanceof ExportTaskError) {
			throw error
		}
		throw new ExportTaskError("导出任务时发生未知错误", error)
	}
}

/**
 * 格式化内容块为 Markdown
 * @param block 内容块
 * @returns 格式化后的 Markdown 字符串
 * @throws {Error} 当格式化失败时
 */
function formatContentBlockToMarkdown(block: any): string {
	try {
		if (typeof block === "string") {
			return block
		}

		switch (block.type) {
			case "text":
				return block.text
			case "image":
				return `[Image]`
			case "tool_use":
				let input: string
				if (typeof block.input === "object" && block.input !== null) {
					input = Object.entries(block.input)
						.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
						.join("\n")
				} else {
					input = String(block.input)
				}
				return `[Tool Use: ${block.name}]\n${input}`
			case "tool_result":
				const toolName = "Tool"
				if (typeof block.content === "string") {
					return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`
				} else if (Array.isArray(block.content)) {
					return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
						.map((contentBlock: any) => formatContentBlockToMarkdown(contentBlock))
						.join("\n")}`
				} else {
					return `[${toolName}${block.is_error ? " (Error)" : ""}]`
				}
			default:
				return "[Unexpected content type]"
		}
	} catch (error) {
		throw new Error(`格式化内容块失败: ${error.message}`)
	}
}
