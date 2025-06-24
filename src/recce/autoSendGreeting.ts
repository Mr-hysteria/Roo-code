import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import * as fs from "fs"
import * as path from "path"

import { ClineProvider } from "../core/webview/ClineProvider"

type AutoSendOptions = {
	provider: ClineProvider
}

/**
 * 打开对话面板并自动发送问候消息
 * 在VSCode启动后自动执行
 *
 * @param options 自动发送消息的选项
 * @returns 操作是否成功的结果对象
 */
export const autoSendGreeting = async ({ provider }: AutoSendOptions) => {
	try {
		// 1. 确保侧边栏面板显示
		await vscode.commands.executeCommand("roo-cline.SidebarProvider.focus")

		// 2. 等待面板完全加载
		// 面板加载完成后会设置isViewLaunched为true
		await pWaitFor(() => provider.isViewLaunched, { timeout: 10000 })

		// 3. 等待一小段时间确保UI完全就绪
		await new Promise((resolve) => setTimeout(resolve, 10000))

		// 4. 从testCase.json文件中读取输入内容
		let userInput = "没有testCase.json文件，请你新建" // 默认值
		try {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			if (workspaceRoot) {
				const testCasePath = path.join(workspaceRoot, "testCase.json")
				if (fs.existsSync(testCasePath)) {
					const testCaseContent = fs.readFileSync(testCasePath, "utf-8")
					const testCase = JSON.parse(testCaseContent)
					if (testCase.input) {
						userInput = testCase.input
					}
				}
			}
		} catch (error) {
			console.error("读取testCase.json失败:", error)
		}

		await provider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text: userInput })

		return { success: true }
	} catch (e) {
		console.error("自动发送问候消息失败:", e)
		return { success: false }
	}
}
