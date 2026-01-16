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

		// Check if watchapp exists - it's required
		if (!this.$fs.exists(appPath)) {
			return false;
		}

		// Extension is optional (Xcode 14+ supports single target)
		const hasExtension = this.$fs.exists(extensionPath);

		const appFolder = this.$iOSNativeTargetService.getTargetDirectories(
			appPath
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

		// Add extension target only if it exists (optional for Xcode 14+)
		if (hasExtension) {
			const extensionFolder = this.$iOSNativeTargetService.getTargetDirectories(
				extensionPath
			)[0];

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
		} else {
			this.$logger.trace(
				"No watch extension found - using single target mode (Xcode 14+)"
			);
		}

		this.$fs.writeFile(
			pbxProjPath,
			project.writeSync({ omitEmptyValues: true })
		);
		this.$iOSNativeTargetService.prepareSigning(
			targetUuids,
			projectData,
			pbxProjPath
		);

		// Add resources to watch targets (fonts, assets, files, etc.)
		await this.addWatchAppResources(
			watchAppFolderPath,
			targetUuids,
			targetNames,
			project,
			platformData,
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

	/**
	 * Add resources from the watch app folder to the watch targets
	 */
	private async addWatchAppResources(
		watchAppFolderPath: string,
		targetUuids: string[],
		targetNames: string[],
		project: IXcode.project,
		platformData: IPlatformData,
		pbxProjPath: string
	): Promise<void> {
		try {
			// Resource directories to scan
			const resourceDirs = [
				IOS_WATCHAPP_FOLDER,
				IOS_WATCHAPP_EXTENSION_FOLDER,
			];

			for (let i = 0; i < resourceDirs.length && i < targetUuids.length; i++) {
				const resourceDir = resourceDirs[i];
				const resourcePath = path.join(watchAppFolderPath, resourceDir);

				if (!this.$fs.exists(resourcePath)) {
					continue;
				}

				const targetUuid = targetUuids[i];
				const targetName = targetNames[i];

				// Scan for resource files (fonts, assets, images, etc.)
				this.addResourcesFromDirectory(
					resourcePath,
					targetUuid,
					targetName,
					project,
					platformData
				);
			}

			// Write changes if any resources were added
			this.$fs.writeFile(
				pbxProjPath,
				project.writeSync({ omitEmptyValues: true })
			);

			this.$logger.trace("Watch app resources added successfully");
		} catch (err) {
			this.$logger.warn(`Error adding watch app resources: ${err.message}`);
		}
	}

	/**
	 * Recursively add resources from a directory to a target
	 */
	private addResourcesFromDirectory(
		dirPath: string,
		targetUuid: string,
		targetName: string,
		project: IXcode.project,
		platformData: IPlatformData
	): void {
		const resourceExtensions = [
			'.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf',  // Images
			'.ttf', '.otf', '.woff', '.woff2',                 // Fonts
			'.xcassets',                                        // Asset catalogs
			'.storyboard', '.xib',                             // Interface files
			'.strings', '.stringsdict',                        // Localization
			'.json', '.xml', '.plist',                         // Data files
			'.m4a', '.mp3', '.wav', '.caf',                    // Audio
			'.mp4', '.mov',                                     // Video
			'.bundle',                                          // Resource bundles
		];

		const items = this.$fs.readDirectory(dirPath);

		for (const item of items) {
			// Skip hidden files and certain directories
			if (item.startsWith('.') || item === 'node_modules') {
				continue;
			}

			const itemPath = path.join(dirPath, item);
			const stats = this.$fs.getFsStats(itemPath);
			const relativePath = path.relative(platformData.projectRoot, itemPath);

			if (stats.isDirectory()) {
				// Special handling for .xcassets, .bundle, and other resource bundles
				if (item.endsWith('.xcassets') || item.endsWith('.bundle')) {
					this.$logger.trace(`Adding resource bundle: ${relativePath}`);
					(project as any).addResourceFile(relativePath, { target: targetUuid });
				} else {
					// Recursively scan subdirectories
					this.addResourcesFromDirectory(
						itemPath,
						targetUuid,
						targetName,
						project,
						platformData
					);
				}
			} else {
				// Check if file is a resource by extension
				const ext = path.extname(item).toLowerCase();
				if (resourceExtensions.includes(ext)) {
					this.$logger.trace(`Adding resource file: ${relativePath}`);
					(project as any).addResourceFile(relativePath, { target: targetUuid });
				}
			}
		}
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

		// Handle custom resources
		if (config.resources && Array.isArray(config.resources)) {
			this.$logger.trace(
				`Processing ${config.resources.length} custom resource(s) for watch target: ${targetName}`
			);
			for (const resourcePath of config.resources) {
				this.addCustomResource(
					resourcePath,
					target.uuid,
					targetName,
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
	 * Add custom resource (file or folder) to watch app target
	 */
	private addCustomResource(
		resourcePath: string,
		targetUuid: string,
		targetName: string,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData
	): void {
		// Resolve path relative to project directory
		const resolvedPath = path.resolve(projectData.projectDir, resourcePath);

		if (!this.$fs.exists(resolvedPath)) {
			this.$logger.warn(
				`Custom resource not found, skipping: ${resourcePath}`
			);
			return;
		}

		const relativePath = path.relative(platformData.projectRoot, resolvedPath);
		const stats = this.$fs.getFsStats(resolvedPath);

		if (stats.isDirectory()) {
			// Add entire directory as a resource
			this.$logger.trace(
				`Adding custom resource directory: ${relativePath}`
			);
			this.addAllFilesFromDirectory(
				resolvedPath,
				targetUuid,
				project,
				platformData
			);
		} else {
			// Add single file as a resource
			this.$logger.trace(`Adding custom resource file: ${relativePath}`);
			(project as any).addResourceFile(relativePath, { target: targetUuid });
		}
	}

	/**
	 * Add all files from a directory (non-recursively) as resources
	 */
	private addAllFilesFromDirectory(
		dirPath: string,
		targetUuid: string,
		project: IXcode.project,
		platformData: IPlatformData
	): void {
		const items = this.$fs.readDirectory(dirPath);

		for (const item of items) {
			// Skip hidden files
			if (item.startsWith('.')) {
				continue;
			}

			const itemPath = path.join(dirPath, item);
			const stats = this.$fs.getFsStats(itemPath);
			const relativePath = path.relative(platformData.projectRoot, itemPath);

			if (stats.isDirectory()) {
				// For directories, add them as bundles (e.g., .xcassets, .bundle)
				this.$logger.trace(`Adding resource bundle: ${relativePath}`);
				(project as any).addResourceFile(relativePath, { target: targetUuid });
			} else {
				// Add individual files
				this.$logger.trace(`Adding resource file: ${relativePath}`);
				(project as any).addResourceFile(relativePath, { target: targetUuid });
			}
		}
	}

	/**
	 * Add module dependency to watch app target (e.g., "Data" module from xcframework or folder)
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

		if (!modulePath || !this.$fs.exists(modulePath)) {
			this.$logger.warn(`Module path not found, skipping module: ${modulePath}`);
			return;
		}

		const relativePath = path.relative(platformData.projectRoot, modulePath);
		const stats = this.$fs.getFsStats(modulePath);

		// Check if it's a framework/xcframework or a folder-based module
		const isFramework = modulePath.endsWith('.framework') || modulePath.endsWith('.xcframework');
		const isFolder = stats.isDirectory() && !isFramework;

		if (isFramework) {
			// Handle compiled frameworks (xcframework, framework)
			this.addCompiledFramework(moduleDef, relativePath, targetName, target, project);
		} else if (isFolder) {
			// Handle folder-based modules with Info.plist (non-compiled)
			await this.addFolderModule(moduleDef, modulePath, relativePath, targetName, target, project, projectData, platformData);
		} else {
			this.$logger.warn(`Unknown module type for: ${modulePath}`);
		}

		// Add header search paths for module (works for both types)
		if (moduleDef.headerSearchPaths && Array.isArray(moduleDef.headerSearchPaths)) {
			for (const headerPath of moduleDef.headerSearchPaths) {
				const resolvedPath = path.resolve(projectData.projectDir, headerPath);
				const relPath = path.relative(platformData.projectRoot, resolvedPath);
				project.addToHeaderSearchPaths(relPath, targetName);
				this.$logger.trace(`Added header search path: ${relPath}`);
			}
		}

		// Add other linker flags if specified
		if (moduleDef.linkerFlags && Array.isArray(moduleDef.linkerFlags)) {
			this.addLinkerFlags(moduleDef.linkerFlags, targetName, project);
		}
	}

	/**
	 * Add compiled framework (xcframework, framework) to target
	 */
	private addCompiledFramework(
		moduleDef: any,
		relativePath: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project
	): void {
		const moduleName = moduleDef.name;

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

		this.$logger.trace(`Added compiled framework ${moduleName} at ${relativePath}`);
	}

	/**
	 * Add folder-based module (with Info.plist) to target as Xcode module
	 */
	private async addFolderModule(
		moduleDef: any,
		modulePath: string,
		relativePath: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData
	): Promise<void> {
		const moduleName = moduleDef.name || path.basename(modulePath);

		// Check for Info.plist
		const infoPlistPath = path.join(modulePath, 'Info.plist');
		if (!this.$fs.exists(infoPlistPath)) {
			this.$logger.warn(`No Info.plist found in module folder: ${modulePath}`);
		}

		// Add the folder to the project as a group
		const files = this.$fs.readDirectory(modulePath)
			.filter((fileName) => !fileName.startsWith("."))
			.map((fileName) => path.join(modulePath, fileName));

		if (files.length > 0) {
			project.addPbxGroup(files, moduleName, modulePath, null, {
				isMain: false,
				target: target.uuid,
				filesRelativeToProject: true,
			});
		}

		// Add as a module by setting up header search paths
		project.addToHeaderSearchPaths(relativePath, targetName);

		// Set module map if specified or create default module configuration
		if (moduleDef.moduleMap) {
			const moduleMapPath = path.resolve(projectData.projectDir, moduleDef.moduleMap);
			const relativeModuleMapPath = path.relative(platformData.projectRoot, moduleMapPath);
			
			project.addBuildProperty(
				"MODULEMAP_FILE",
				`"${relativeModuleMapPath}"`,
				null,
				targetName
			);
			this.$logger.trace(`Added module map: ${relativeModuleMapPath}`);
		}

		// Enable modules for this target if not already enabled
		project.addBuildProperty(
			"CLANG_ENABLE_MODULES",
			"YES",
			null,
			targetName
		);

		this.$logger.trace(`Added folder-based module ${moduleName} at ${relativePath}`);
	}

	/**
	 * Add linker flags to a target's build settings
	 */
	private addLinkerFlags(
		flags: string[],
		targetName: string,
		project: IXcode.project
	): void {
		for (const flag of flags) {
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
