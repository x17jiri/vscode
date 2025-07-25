/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contains all MCP command IDs used in the workbench.
 */
export const enum McpCommandIds {
	AddConfiguration = 'workbench.mcp.addConfiguration',
	Browse = 'workbench.mcp.browseServers',
	ShowInstalled = 'workbench.mcp.showInstalledServers',
	BrowseResources = 'workbench.mcp.browseResources',
	ConfigureSamplingModels = 'workbench.mcp.configureSamplingModels',
	EditStoredInput = 'workbench.mcp.editStoredInput',
	InstallFromActivation = 'workbench.mcp.installFromActivation',
	ListServer = 'workbench.mcp.listServer',
	RemoveStoredInput = 'workbench.mcp.removeStoredInput',
	ResetCachedTools = 'workbench.mcp.resetCachedTools',
	ResetTrust = 'workbench.mcp.resetTrust',
	RestartServer = 'workbench.mcp.restartServer',
	ServerOptions = 'workbench.mcp.serverOptions',
	ShowConfiguration = 'workbench.mcp.showConfiguration',
	ShowOutput = 'workbench.mcp.showOutput',
	StartPromptForServer = 'workbench.mcp.startPromptForServer',
	StartServer = 'workbench.mcp.startServer',
	StopServer = 'workbench.mcp.stopServer',
}
