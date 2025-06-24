import * as path from "path"
import fs from "fs/promises"

import * as vscode from "vscode"
import { z } from "zod"

import { globalSettingsSchema } from "@roo-code/types"

import { ProviderSettingsManager, providerProfilesSchema } from "../core/config/ProviderSettingsManager"
import { ContextProxy } from "../core/config/ContextProxy"
import { CustomModesManager } from "../core/config/CustomModesManager"

type ImportOptions = {
	providerSettingsManager: ProviderSettingsManager
	contextProxy: ContextProxy
	customModesManager: CustomModesManager
}

export const importSettings = async ({ providerSettingsManager, contextProxy, customModesManager }: ImportOptions) => {
	const filePath = await getSettingsFilePath()

	if (!filePath) {
		return { success: false }
	}

	const schema = z.object({
		providerProfiles: providerProfilesSchema,
		globalSettings: globalSettingsSchema.optional(),
	})

	try {
		const previousProviderProfiles = await providerSettingsManager.export()

		const { providerProfiles: newProviderProfiles, globalSettings = {} } = schema.parse(
			JSON.parse(await fs.readFile(filePath, "utf-8")),
		)

		const providerProfiles = {
			currentApiConfigName: newProviderProfiles.currentApiConfigName,
			apiConfigs: {
				...previousProviderProfiles.apiConfigs,
				...newProviderProfiles.apiConfigs,
			},
			modeApiConfigs: {
				...previousProviderProfiles.modeApiConfigs,
				...newProviderProfiles.modeApiConfigs,
			},
		}

		await Promise.all(
			(globalSettings.customModes ?? []).map((mode) => customModesManager.updateCustomMode(mode.slug, mode)),
		)

		await providerSettingsManager.import(newProviderProfiles)
		await contextProxy.setValues(globalSettings)

		// Set the current provider.
		const currentProviderName = providerProfiles.currentApiConfigName
		const currentProvider = providerProfiles.apiConfigs[currentProviderName]
		contextProxy.setValue("currentApiConfigName", currentProviderName)

		// TODO: It seems like we don't need to have the provider settings in
		// the proxy; we can just use providerSettingsManager as the source of
		// truth.
		if (currentProvider) {
			contextProxy.setProviderSettings(currentProvider)
		}

		contextProxy.setValue("listApiConfigMeta", await providerSettingsManager.listConfig())

		return { providerProfiles, globalSettings, success: true }
	} catch (e) {
		return { success: false }
	}
}

/**
 * 尝试获取设置文件路径
 * 优先从工作区根目录读取userSetting.json
 * 如果不存在，则弹出文件选择对话框
 * @returns 设置文件路径或undefined（如果用户取消）
 */
export async function getSettingsFilePath(): Promise<string | undefined> {
	// 尝试从根目录读取userSetting.json
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders && workspaceFolders.length > 0) {
			const rootPath = workspaceFolders[0].uri.fsPath
			const userSettingPath = path.join(rootPath, "userSetting.json")

			// 检查文件是否存在
			await fs.access(userSettingPath)
			vscode.window.showInformationMessage("存在userSetting.json文件，继续其作为默认配置")
			return userSettingPath
		}
	} catch (error) {
		// 文件不存在，继续使用文件选择对话框
		vscode.window.showInformationMessage(
			"文件不存在，继续使用文件选择对话框，或者在项目根目录中创建userSetting.json文件",
		)
	}

	// 使用文件选择对话框
	const uris = await vscode.window.showOpenDialog({
		filters: { JSON: ["json"] },
		canSelectMany: false,
	})

	if (!uris) {
		return undefined
	}

	return uris[0].fsPath
}
