import * as path from "path";
import {
	IOSDeviceTargets,
	IOS_WATCHAPP_FOLDER,
	IOS_WATCHAPP_EXTENSION_FOLDER,
	IOSNativeTargetProductTypes,
	IOSNativeTargetTypes,
} from "../constants";
import {
	IIOSWatchAppService,
	IIOSNativeTargetService,
	IAddWatchAppFromPathOptions,
	IRemoveWatchAppOptions,
	IProjectData,
} from "../definitions/project";
import { IPlatformData } from "../definitions/platform";
import { IFileSystem } from "../common/declarations";
import { injector } from "../common/yok";
import { MobileProject } from "@nstudio/trapezedev-project";

export class IOSWatchAppService implements IIOSWatchAppService {
	private static WATCH_APP_IDENTIFIER = "watchkitapp";
	private static WACTCH_EXTENSION_IDENTIFIER = "watchkitextension";
	constructor(
		protected $fs: IFileSystem,
		protected $pbxprojDomXcode: IPbxprojDomXcode,
		protected $xcode: IXcode,
		private $iOSNativeTargetService: IIOSNativeTargetService,
		private $logger: ILogger
	) {}

	public async addWatchAppFromPath({
		watchAppFolderPath,
		projectData,
		platformData,
		pbxProjPath,
	}: IAddWatchAppFromPathOptions): Promise<boolean> {
		const targetUuids: string[] = [];
		const targetNames: string[] = [];
		const appPath = path.join(watchAppFolderPath, IOS_WATCHAPP_FOLDER);
		const extensionPath = path.join(
			watchAppFolderPath,
			IOS_WATCHAPP_EXTENSION_FOLDER
		);

		if (!this.$fs.exists(appPath) || !this.$fs.exists(extensionPath)) {
			return false;
		}

		const appFolder = this.$iOSNativeTargetService.getTargetDirectories(
			appPath
		)[0];
		const extensionFolder = this.$iOSNativeTargetService.getTargetDirectories(
			extensionPath
		)[0];

		const project = new this.$xcode.project(pbxProjPath);
		project.parseSync();

		const watchApptarget = this.$iOSNativeTargetService.addTargetToProject(
			appPath,
			appFolder,
			IOSNativeTargetTypes.watchApp,
			project,
			platformData,
			project.getFirstTarget().uuid
		);
		await this.configureTarget(
			appFolder,
			path.join(appPath, appFolder),
			`${projectData.projectIdentifiers.ios}.${IOSWatchAppService.WATCH_APP_IDENTIFIER}`,
			"watchapp.json",
			watchApptarget,
			project,
			projectData,
			platformData
		);
		targetUuids.push(watchApptarget.uuid);
		targetNames.push(appFolder);

		const watchExtensionTarget = this.$iOSNativeTargetService.addTargetToProject(
			extensionPath,
			extensionFolder,
			IOSNativeTargetTypes.watchExtension,
			project,
			platformData,
			watchApptarget.uuid
		);
		await this.configureTarget(
			extensionFolder,
			path.join(extensionPath, extensionFolder),
			`${projectData.projectIdentifiers.ios}.${IOSWatchAppService.WATCH_APP_IDENTIFIER}.${IOSWatchAppService.WACTCH_EXTENSION_IDENTIFIER}`,
			"extension.json",
			watchExtensionTarget,
			project,
			projectData,
			platformData
		);
		targetUuids.push(watchExtensionTarget.uuid);
		targetNames.push(extensionFolder);

		this.$fs.writeFile(
			pbxProjPath,
			project.writeSync({ omitEmptyValues: true })
		);
		this.$iOSNativeTargetService.prepareSigning(
			targetUuids,
			projectData,
			pbxProjPath
		);

		// Apply SPM packages to watch targets if configured
		await this.applySPMPackagesToWatchTargets(
			targetNames,
			projectData,
			platformData
		);

		return true;
	}

	public removeWatchApp({ pbxProjPath }: IRemoveWatchAppOptions): void {
		const project = new this.$xcode.project(pbxProjPath);
		project.parseSync();
		project.removeTargetsByProductType(IOSNativeTargetProductTypes.watchApp);
		project.removeTargetsByProductType(
			IOSNativeTargetProductTypes.watchExtension
		);
		this.$fs.writeFile(
			pbxProjPath,
			project.writeSync({ omitEmptyValues: true })
		);
	}

	public hasWatchApp(
		platformData: IPlatformData,
		projectData: IProjectData
	): boolean {
		const watchAppPath = path.join(
			projectData.getAppResourcesDirectoryPath(),
			platformData.normalizedPlatformName,
			IOS_WATCHAPP_FOLDER
		);

		return this.$fs.exists(watchAppPath);
	}

	private async configureTarget(
		targetName: string,
		targetPath: string,
		identifier: string,
		configurationFileName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData
	) {
		const targetConfigurationJsonPath = path.join(
			targetPath,
			configurationFileName
		);

		const identifierParts = identifier.split(".");
		identifierParts.pop();
		const wkAppBundleIdentifier = identifierParts.join(".");

		this.$iOSNativeTargetService.setXcodeTargetBuildConfigurationProperties(
			[
				{ name: "PRODUCT_BUNDLE_IDENTIFIER", value: identifier },
				{ name: "SDKROOT", value: "watchos" },
				{ name: "TARGETED_DEVICE_FAMILY", value: IOSDeviceTargets.watchos },
				{ name: "WATCHOS_DEPLOYMENT_TARGET", value: 5.2 },
				{ name: "WK_APP_BUNDLE_IDENTIFIER", value: wkAppBundleIdentifier },
			],
			targetName,
			project
		);

		this.$iOSNativeTargetService.setConfigurationsFromJsonFile(
			targetConfigurationJsonPath,
			target.uuid,
			targetName,
			project
		);
		project.addToHeaderSearchPaths(
			targetPath,
			target.pbxNativeTarget.productName
		);

		// Process additional configurations for watch apps
		await this.processWatchAppConfiguration(
			targetConfigurationJsonPath,
			targetName,
			target,
			project,
			projectData,
			platformData
		);
	}

	/**
	 * Process additional watch app configurations including modules and workspace targets
	 */
	private async processWatchAppConfiguration(
		configPath: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData
	): Promise<void> {
		if (!this.$fs.exists(configPath)) {
			return;
		}

		const config = this.$fs.readJson(configPath) || {};

		// Handle module dependencies (e.g., "Data" module from xcframework)
		if (config.modules && Array.isArray(config.modules)) {
			this.$logger.trace(
				`Processing ${config.modules.length} module(s) for watch target: ${targetName}`
			);
			for (const moduleDef of config.modules) {
				await this.addModuleDependency(
					moduleDef,
					targetName,
					target,
					project,
					projectData,
					platformData
				);
			}
		}

		// Handle existing workspace target references
		if (config.workspaceTarget) {
			this.$logger.trace(
				`Configuring workspace target reference: ${config.workspaceTarget} for ${targetName}`
			);
			this.linkWorkspaceTarget(
				config.workspaceTarget,
				targetName,
				target,
				project,
				platformData
			);
		}
	}

	/**
	 * Add module dependency to watch app target (e.g., "Data" module from xcframework)
	 */
	private async addModuleDependency(
		moduleDef: any,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData
	): Promise<void> {
		const moduleName = moduleDef.name;
		const modulePath = moduleDef.path
			? path.resolve(projectData.projectDir, moduleDef.path)
			: null;

		this.$logger.trace(`Adding module dependency: ${moduleName} to ${targetName}`);

		// Add framework if path is provided
		if (modulePath && this.$fs.exists(modulePath)) {
			const relativePath = path.relative(platformData.projectRoot, modulePath);
			
			// Add to frameworks build phase
			project.addFramework(relativePath, {
				target: target.uuid,
				customFramework: true,
				embed: moduleDef.embed !== false, // Default to true
			});

			// Add framework search paths
			const frameworkDir = path.dirname(relativePath);
			project.addBuildProperty(
				"FRAMEWORK_SEARCH_PATHS",
				`"$(inherited)" "${frameworkDir}"`,
				null,
				targetName
			);

			this.$logger.trace(`Added framework ${moduleName} at ${relativePath}`);
		}

		// Add header search paths for module
		if (moduleDef.headerSearchPaths && Array.isArray(moduleDef.headerSearchPaths)) {
			for (const headerPath of moduleDef.headerSearchPaths) {
				const resolvedPath = path.resolve(projectData.projectDir, headerPath);
				const relativePath = path.relative(platformData.projectRoot, resolvedPath);
				project.addToHeaderSearchPaths(relativePath, targetName);
				this.$logger.trace(`Added header search path: ${relativePath}`);
			}
		}

		// Add other linker flags if specified
		if (moduleDef.linkerFlags && Array.isArray(moduleDef.linkerFlags)) {
			for (const flag of moduleDef.linkerFlags) {
				// Use addBuildProperty with target name (productName) to set OTHER_LDFLAGS
				const currentFlags = this.getBuildProperty("OTHER_LDFLAGS", targetName, project);
				const flagsArray = currentFlags 
					? (Array.isArray(currentFlags) ? currentFlags : [currentFlags])
					: ['"$(inherited)"'];
				
				if (!flagsArray.includes(flag)) {
					flagsArray.push(flag);
				}
				
				project.addBuildProperty("OTHER_LDFLAGS", flagsArray, null, targetName);
				this.$logger.trace(`Added linker flag: ${flag}`);
			}
		}
	}

	/**
	 * Get build property value for a specific target
	 */
	private getBuildProperty(
		propertyName: string,
		targetName: string,
		project: IXcode.project
	): any {
		// Access the project hash to read build settings
		const projectHash = (project as any).hash;
		if (!projectHash) {
			return null;
		}

		const configurations = projectHash.project.objects.XCBuildConfiguration;
		if (!configurations) {
			return null;
		}

		for (const key in configurations) {
			const config = configurations[key];
			if (config && config.buildSettings && 
				(config.buildSettings.PRODUCT_NAME === targetName || 
				 config.buildSettings.PRODUCT_NAME === `"${targetName}"`)) {
				return config.buildSettings[propertyName];
			}
		}

		return null;
	}

	/**
	 * Link existing workspace target to watch app
	 */
	private linkWorkspaceTarget(
		workspaceTargetName: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		platformData: IPlatformData
	): void {
		this.$logger.trace(
			`Linking workspace target ${workspaceTargetName} to ${targetName}`
		);

		// Find the existing target in the project
		const projectHash = (project as any).hash;
		if (!projectHash) {
			this.$logger.warn("Could not access project hash");
			return;
		}

		const targets = projectHash.project.objects.PBXNativeTarget;
		let existingTargetUuid: string = null;

		for (const uuid in targets) {
			if (targets[uuid] && targets[uuid].name === workspaceTargetName) {
				existingTargetUuid = uuid;
				break;
			}
		}

		if (existingTargetUuid) {
			// Add target dependency using the xcode project method
			try {
				(project as any).addTargetDependency(target.uuid, [existingTargetUuid]);
				this.$logger.trace(
					`Successfully linked workspace target ${workspaceTargetName}`
				);
			} catch (err) {
				this.$logger.warn(
					`Error linking workspace target ${workspaceTargetName}: ${err.message}`
				);
			}
		} else {
			this.$logger.warn(
				`Could not find workspace target: ${workspaceTargetName}`
			);
		}
	}

	/**
	 * Apply SPM packages to watch app targets
	 */
	private async applySPMPackagesToWatchTargets(
		targetNames: string[],
		projectData: IProjectData,
		platformData: IPlatformData
	): Promise<void> {
		try {
			// Check if watch-specific SPM packages are configured
			const watchSPMPackages = this.getWatchSPMPackages(projectData, platformData);

			if (watchSPMPackages.length === 0) {
				this.$logger.trace("No SPM packages configured for watch targets");
				return;
			}

			this.$logger.trace(
				`Applying ${watchSPMPackages.length} SPM package(s) to watch targets`
			);

			const project = new MobileProject(platformData.projectRoot, {
				ios: {
					path: ".",
				},
				enableAndroid: false,
			});
			await project.load();

			if (!project.ios) {
				this.$logger.trace("No iOS project found via trapeze");
				return;
			}

			// Add SPM packages to each watch target
			for (const pkg of watchSPMPackages) {
				if ("path" in pkg) {
					pkg.path = path.resolve(projectData.projectDir, pkg.path);
				}

				this.$logger.trace(`Adding SPM package ${pkg.name} to watch targets`);

				for (const targetName of targetNames) {
					await project.ios.addSPMPackage(targetName, pkg);
				}
			}

			await project.commit();
			this.$logger.trace("Successfully applied SPM packages to watch targets");
		} catch (err) {
			this.$logger.trace("Error applying SPM packages to watch targets:", err);
		}
	}

	/**
	 * Get SPM packages configured for watch app targets
	 */
	private getWatchSPMPackages(
		projectData: IProjectData,
		platformData: IPlatformData
	): IosSPMPackage[] {
		const $projectConfigService = injector.resolve("projectConfigService");
		
		// Check for watch-specific SPM packages in config
		const watchPackages = $projectConfigService.getValue(
			`${platformData.platformNameLowerCase}.watchApp.SPMPackages`,
			[]
		);

		return watchPackages;
	}
}

injector.register("iOSWatchAppService", IOSWatchAppService);
