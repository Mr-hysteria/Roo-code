import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import moment from "moment-timezone"
import { updateServiceRunStatus, recordRecceRunCount, saveStatsToFile } from "./statusControl"

/**
 * 监控指定命令的执行情况，对于成功和失败情况进行处理
 * @param command 需要监控的命令
 * @param output 命令的输出文本
 * @param userInput 用户的原始输入
 * @returns 如果命令出错返回true，否则返回false
 */
export function monitorCommand(command: string, output: string): boolean {
	// 判断是否是相关命令
	const isRelevantCommand = command.includes("recce run") || command.includes("npm run")

	if (!isRelevantCommand) {
		return false
	}
	// 检查是否有错误
	const hasError = checkForErrors(output)

	// 处理错误情况
	if (hasError) {
		// 记录错误信息到MD文件
		errorToMarkdown(command, output)

		recordRecceRunCount()
		// 更新服务运行状态为失败
		updateServiceRunStatus("failed")
		saveStatsToFile()
		return false
	}

	// 检查是否成功启动服务
	const isSuccess = checkForSuccess(output)

	// 如果服务成功启动
	if (isSuccess) {
		recordRecceRunCount()
		updateServiceRunStatus("success")
		saveStatsToFile()
		// 显示服务成功启动的通知
		vscode.window.showInformationMessage(`服务已成功启动，run-stats 已更新`)
		return true
	}

	return false
}

/**
 * 检查输出中是否包含错误信息
 * @param output 命令的输出
 * @returns 是否包含错误信息
 */
function checkForErrors(output: string): boolean {
	// 检查输出中是否包含错误信息的关键词
	const errorKeywords = ["error", "Error", "ERROR"]

	// 使用正则表达式匹配完整的错误单词
	return errorKeywords.some((keyword) => {
		const regex = new RegExp(`\\b${keyword}\\b`, "g")
		return regex.test(output)
	})
}

/**
 * 检查命令是否成功启动服务
 * @param output 命令的输出
 * @returns 是否成功启动服务
 */
function checkForSuccess(output: string): boolean {
	// 检查输出是否包含服务启动成功的标志
	const successMarkers = [
		"server started",
		"server running",
		"listening on port",
		"started at",
		"running at",
		"development server",
		"app listening",
		"application started",
		"启动成功",
		"服务已启动",
		"服务运行在",
		"监听端口",
		"启动本地服务",
		"启动socket服务",
		"如未安装 hdc, 可通过鸿蒙官网进行安装",
		"localhost:",
		"打包完成",
		"ws://",
	]

	const hasSuccessMarker = successMarkers.some((marker) => output.toLowerCase().includes(marker.toLowerCase()))

	// 服务启动通常会输出监听的端口号
	const portRegex = /(?:listening|running|started|available|localhost|服务).*?(?:at|on|:).*?(?:port |:)(\d+)/i
	const portMatch = output.match(portRegex)

	// 如果输出包含成功标志或端口号，则认为是成功启动的服务
	return hasSuccessMarker || !!portMatch
}

/**
 * 将命令执行错误记录到Markdown文件
 * @param command 执行的命令
 * @param output 命令的输出
 */
/**
 * 将命令执行错误记录到Markdown文件
 * @param command 执行的命令
 * @param output 命令的输出
 * @param userInput 用户的原始输入
 */
function errorToMarkdown(command: string, output: string) {
	try {
		// 创建logs目录（如果不存在）
		const logsDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || "", "logs")
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true })
		}

		// 解析命令输出
		const parsedOutputList = parseCommandOutput(output)

		// 使用moment-timezone创建北京时间时间戳
		const beijingTime = moment().tz("Asia/Shanghai")
		const timestamp = beijingTime.format("YYYY-MM-DD[T]HH-mm-ss")
		const fileName = `error-${timestamp}.md`
		const filePath = path.join(logsDir, fileName)

		// 创建Markdown内容
		let markdownContent = `# recce run命令行执行错误日志\n\n`
		markdownContent += `## 执行时间\n${timestamp}\n\n`
		// 遍历错误列表，将错误信息和错误文件路径写入，错误信息和路径作为一条内容，如 error in xxx，不用写文件内容
		for (let i = 0; i < parsedOutputList.length; i++) {
			const error = parsedOutputList[i]
			markdownContent += `## 错误信息 ${i + 1}\n${error.error}\n\n错误位置：${error.filePath}:${error.line}:${error.column}\n\n`
		}
		// 把parsedOutputList中的文件路径去重，最后添加到markdownContent中
		const uniqueFilePaths = [...new Set(parsedOutputList.map((error) => error.filePath))]
		markdownContent += `## 本轮recce run编译出错文件列表\n${uniqueFilePaths.join("\n")}\n\n`
		// 使用readFileContent函数读取文件内容，并添加到markdownContent中，需要备注文件路径在开头
		for (let i = 0; i < uniqueFilePaths.length; i++) {
			const filePath = uniqueFilePaths[i]
			markdownContent += `## 文件内容 ${i + 1}\n\`\`\`\n文件路径：${filePath}\n\n${readFileContent(filePath)}\n\`\`\`\n\n`
		}
		// 添加完整的命令行输出，去除ANSI转义字符
		const ansiRegex = /\x1b\[[0-9;]*m|\x1b\[K/g
		const cleanOutput = output.replace(ansiRegex, "")
		markdownContent += `## 本轮recce run完整输出\n\`\`\`\n${cleanOutput}\n\`\`\`\n\n`
		// 写入文件
		fs.writeFileSync(filePath, markdownContent, "utf-8")

		// 显示通知
		vscode.window.showInformationMessage(`错误日志已记录到 ${fileName}`)
	} catch (error) {
		console.error("记录错误日志失败:", error)
	}
}

function parseCommandOutput(output: string) {
	const errorList = []
	// 匹配所有的error为开头的行
	const errorMatch = output.match(/^error.*/gm)
	if (errorMatch) {
		let lastIndex = 0 // 添加一个变量来追踪上一次查找的位置
		for (let i = 0; i < errorMatch.length; i++) {
			// 从lastIndex开始查找当前error文本
			const currentErrorIndex = output.indexOf(errorMatch[i], lastIndex)
			// 更新lastIndex为当前找到的位置之后
			lastIndex = currentErrorIndex + 1

			// 从当前error位置开始查找对应的文件路径
			let filePathMatch = output.slice(currentErrorIndex).match(/^\s*-->\s+(.+):\d+:\d+/m)
			if (filePathMatch) {
				const lineColMatch = filePathMatch[0].match(/--> [^:]+:(\d+):(\d+)/)
				errorList.push({
					error: errorMatch[i],
					filePath: filePathMatch[0].match(/--> ([^:]+):\d+:\d+/)?.[1] || "",
					line: lineColMatch ? parseInt(lineColMatch[1]) : undefined,
					column: lineColMatch ? parseInt(lineColMatch[2]) : undefined,
				})
			}
		}
	}
	// 提取文件路径（匹配第一个文件路径）
	return errorList
}

// 读取文件内容
function readFileContent(filePath: string) {
	// 尝试读取文件内容
	if (filePath) {
		try {
			const absolutePath = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || "", filePath)
			return fs.readFileSync(absolutePath, "utf-8")
		} catch (error) {
			console.error(error)
		}
	}
	return ""
}

// 防抖函数实现
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | undefined
	return function (this: any, ...args: Parameters<T>) {
		if (timeoutId) clearTimeout(timeoutId)
		timeoutId = setTimeout(() => {
			fn.apply(this, args)
		}, delay)
	}
}

// 导出带有防抖功能的 monitorCommand，避免短时间内多次触发命令监控，延迟2000ms执行，适用于频繁命令触发场景
export const debouncedMonitorCommand = debounce(monitorCommand, 2000)
