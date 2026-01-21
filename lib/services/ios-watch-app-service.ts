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
	IXcodeTargetBuildConfigurationProperty,
} from "../definitions/project";
import { IPlatformData } from "../definitions/platform";
import { IFileSystem } from "../common/declarations";
import { injector } from "../common/yok";
import { MobileProject } from "@nstudio/trapezedev-project";
import { Minimatch } from "minimatch";

const sourceExtensions = [
	'.swift', '.m', '.mm', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'
];
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
const WATCH_APP_IDENTIFIER = "watchkitapp";
const WACTCH_EXTENSION_IDENTIFIER = "watchkitextension";
const CONFIG_FILE_WATCHAPP = "watchapp.json";
const CONFIG_FILE_EXTENSION = "extension.json";
const RESOURCES_TO_IGNORE = [CONFIG_FILE_WATCHAPP, CONFIG_FILE_EXTENSION, 'node_modules'];

export class IOSWatchAppService implements IIOSWatchAppService {

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

		// Check if watchapp exists - it's required
		if (!this.$fs.exists(appPath)) {
			return false;
		}

		const appFolder = this.$iOSNativeTargetService.getTargetDirectories(
			appPath
		)[0];

		const project = new this.$xcode.project(pbxProjPath);
		project.parseSync();

		// Add watch app target but don't auto-add files to prevent "Multiple commands produce" error
		const watchApptarget = this.addTargetWithoutFiles(
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
			`${projectData.projectIdentifiers.ios}.${WATCH_APP_IDENTIFIER}`,
			"watchapp.json",
			watchApptarget,
			project,
			projectData,
			platformData,
			pbxProjPath
		);
		targetUuids.push(watchApptarget.uuid);
		targetNames.push(appFolder);

		const extensionPath = path.join(
			watchAppFolderPath,
			IOS_WATCHAPP_EXTENSION_FOLDER
		);
		// Extension is optional (Xcode 14+ supports single target)
		if (this.$fs.exists(extensionPath)) {
			const extensionFolder = this.$iOSNativeTargetService.getTargetDirectories(
				extensionPath
			)[0];

			// Add extension target but don't auto-add files to prevent "Multiple commands produce" error
			const watchExtensionTarget = this.addTargetWithoutFiles(
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
				`${projectData.projectIdentifiers.ios}.${WATCH_APP_IDENTIFIER}.${WACTCH_EXTENSION_IDENTIFIER}`,
				"extension.json",
				watchExtensionTarget,
				project,
				projectData,
				platformData,
				pbxProjPath
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

		// Add SPM packages (file needs to be saved first)
		const watchSPMPackages = this.getWatchSPMPackages(platformData);

		await this.applySPMPackagesToWatchTargets(
			[projectData.projectName],
			platformData,
			projectData.projectDir,
			watchSPMPackages
		);


		this.$iOSNativeTargetService.prepareSigning(
			targetUuids,
			projectData,
			pbxProjPath
		);

		return true;
	}

	/**
	 * Add target to project without automatically adding files
	 * This prevents the "Multiple commands produce" error
	 */
	private addTargetWithoutFiles(
		targetRootPath: string,
		targetFolder: string,
		targetType: string,
		project: IXcode.project,
		platformData: IPlatformData,
		parentTarget?: string
	): IXcode.target {
		const targetPath = path.join(targetRootPath, targetFolder);
		const targetRelativePath = path.relative(
			platformData.projectRoot,
			targetPath
		);
		
		const target = project.addTarget(
			targetFolder,
			targetType,
			targetRelativePath,
			parentTarget
		);
		
		// Add build phases
		project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
		project.addBuildPhase(
			[],
			"PBXResourcesBuildPhase",
			"Resources",
			target.uuid
		);
		project.addBuildPhase(
			[],
			"PBXFrameworksBuildPhase",
			"Frameworks",
			target.uuid
		);

		// Add group without files to avoid duplication
		project.addPbxGroup([], targetFolder, targetPath, null, {
			isMain: true,
			target: target.uuid,
			filesRelativeToProject: true,
		});
		
		project.addToHeaderSearchPaths(
			targetPath,
			target.pbxNativeTarget.productName
		);
		
		return target;
	}

	/**
	 * Add source files from the watch app folder to the watch targets
	 */
	private async addWatchAppSourceFiles(
		watchAppFolderPath: string,
		targetUuids: string[],
		project: IXcode.project,
		platformData: IPlatformData,
		excludePatterns?: string[]
	): Promise<void> {
		try {
			// Source directories to scan
			const sourceDirs = [
				IOS_WATCHAPP_FOLDER,
				IOS_WATCHAPP_EXTENSION_FOLDER,
			];

			for (let i = 0; i < sourceDirs.length && i < targetUuids.length; i++) {
				const sourceDir = sourceDirs[i];
				const sourcePath = path.join(watchAppFolderPath, sourceDir);

				if (!this.$fs.exists(sourcePath)) {
					continue;
				}

				const targetUuid = targetUuids[i];

				// Scan for source files (swift, h, m, mm, cpp, c)
				this.addSourceFilesFromDirectory(
					sourcePath,
					targetUuid,
					project,
					platformData,
					excludePatterns
				);
			}

			this.$logger.trace("Watch app source files added successfully");
		} catch (err) {
			this.$logger.warn(`Error adding watch app source files: ${err.message}`);
		}
	}

	/**
	 * Recursively add source files from a directory to a target
	 */
	private addSourceFilesFromDirectory(
		dirPath: string,
		targetUuid: string,
		project: IXcode.project,
		platformData: IPlatformData,
		excludePatterns?: string[]
	): void {

		const items = this.$fs.readDirectory(dirPath);

		for (const item of items) {
			// Skip hidden files, config files, and certain directories
			if (item.startsWith('.') || item === 'node_modules' || 
			    item.endsWith('.json') || item.endsWith('.plist')) {
				continue;
			}

			const itemPath = path.join(dirPath, item);
			const stats = this.$fs.getFsStats(itemPath);
			const relativePath = path.relative(platformData.projectRoot, itemPath);

			// Check if file/directory should be excluded based on patterns
			if (excludePatterns && this.shouldExclude(relativePath, excludePatterns)) {
				this.$logger.trace(`Excluding from src: ${relativePath}`);
				continue;
			}

			if (stats.isDirectory()) {
				// Recursively scan subdirectories for source files
				this.addSourceFilesFromDirectory(
					itemPath,
					targetUuid,
					project,
					platformData,
					excludePatterns
				);
			} else {
				// Check if file is a source file by extension
				const ext = path.extname(item).toLowerCase();
				if (sourceExtensions.includes(ext)) {
					this.$logger.trace(`Adding source file: ${relativePath}`);
					// Add source file to the target
					(project as any).addSourceFile(relativePath, null, targetUuid);
				}
			}
		}
	}

	/**
	 * Add resources from the watch app folder to the watch targets
	 */
	private async addWatchAppResources(
		watchAppFolderPath: string,
		targetUuids: string[],
		project: IXcode.project,
		platformData: IPlatformData,
		excludePatterns?: string[]
	): Promise<void> {
		try {
			if (!this.$fs.exists(watchAppFolderPath)) {
				return;
			}
			for (let i = 0; i < targetUuids.length; i++) {
				const targetUuid = targetUuids[i];
				// Scan for resource files (fonts, assets, images, etc.)
				this.addResourcesFromDirectory(
					watchAppFolderPath,
					targetUuid,
					project,
					platformData,
					excludePatterns
				);
			}

			this.$logger.trace("Watch app resources added successfully");
		} catch (err) {
			this.$logger.warn(`Error adding watch app resources: ${err.message}`);
		}
	}

	/**
	 * Recursively add resources from a directory to a target
	 * Requirement 6: Exclude watchapp.json and extension.json config files
	 */
	private addResourcesFromDirectory(
		dirPath: string,
		targetUuid: string,
		project: IXcode.project,
		platformData: IPlatformData,
		excludePatterns?: string[]
	): void {

		const items = this.$fs.readDirectory(dirPath);

		for (const item of items) {
			// Skip hidden files and excluded files/directories
			if (item.startsWith('.') || RESOURCES_TO_IGNORE.indexOf(item) !== -1) {
				continue;
			}

			const itemPath = path.join(dirPath, item);
			const stats = this.$fs.getFsStats(itemPath);
			const relativePath = path.relative(platformData.projectRoot, itemPath);

			// Check if file/directory should be excluded based on patterns
			if (excludePatterns && this.shouldExclude(relativePath, excludePatterns)) {
				this.$logger.trace(`Excluding from resources: ${relativePath}`);
				continue;
			}

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
						project,
						platformData,
						excludePatterns
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
		platformData: IPlatformData,
		pbxProjPath: string
	) {
		const configPath = path.join(
			targetPath,
			configurationFileName
		);

		const config = this.$fs.exists(configPath) ? this.$fs.readJson(configPath): null;

		const identifierParts = identifier.split(".");
		identifierParts.pop();
		const wkAppBundleIdentifier = identifierParts.join(".");

		// Build configuration properties
		const buildConfigProperties: IXcodeTargetBuildConfigurationProperty[] = [
			{ name: "PRODUCT_BUNDLE_IDENTIFIER", value: identifier },
			{ name: "SDKROOT", value: "watchos" },
			{ name: "TARGETED_DEVICE_FAMILY", value: IOSDeviceTargets.watchos },
			{ name: "WATCHOS_DEPLOYMENT_TARGET", value: 5.2 },
			{ name: "WK_APP_BUNDLE_IDENTIFIER", value: wkAppBundleIdentifier },
		];

		// Handle custom Info.plist path
		if (config?.infoPlistPath) {
			const infoPlistPath = path.resolve(path.dirname(configPath), config.infoPlistPath);
			if (this.$fs.exists(infoPlistPath)) {
				// Copy to target location or set the path
				const destInfoPlistPath = path.join(targetPath, 'Info.plist');
				if (infoPlistPath !== destInfoPlistPath) {
					this.$fs.copyFile(infoPlistPath, destInfoPlistPath);
					this.$logger.trace(`Copied custom Info.plist from ${infoPlistPath} to ${destInfoPlistPath}`);
				}
				const relativeInfoPlistPath = path.relative(platformData.projectRoot, destInfoPlistPath);
				buildConfigProperties.push({
					name: "INFOPLIST_FILE",
					value: `"${relativeInfoPlistPath}"`
				});
			} else {
				this.$logger.warn(`Custom Info.plist not found at: ${infoPlistPath}`);
			}
		}

		// Handle custom xcprivacy file path
		if (config?.xcprivacyPath) {
			const xcprivacyPath = path.resolve(path.dirname(configPath), config.xcprivacyPath);
			if (this.$fs.exists(xcprivacyPath)) {
				// Copy to target location
				const destXcprivacyPath = path.join(targetPath, 'PrivacyInfo.xcprivacy');
				if (xcprivacyPath !== destXcprivacyPath) {
					this.$fs.copyFile(xcprivacyPath, destXcprivacyPath);
					this.$logger.trace(`Copied custom xcprivacy from ${xcprivacyPath} to ${destXcprivacyPath}`);
				}
				// Add as resource file
				const relativeXcprivacyPath = path.relative(platformData.projectRoot, destXcprivacyPath);
				(project as any).addResourceFile(relativeXcprivacyPath, { target: target.uuid });
			} else {
				this.$logger.warn(`Custom xcprivacy file not found at: ${xcprivacyPath}`);
			}
		}

		this.$iOSNativeTargetService.setXcodeTargetBuildConfigurationProperties(
			buildConfigProperties,
			targetName,
			project
		);

		this.$iOSNativeTargetService.setConfigurationsFromJsonFile(
			configPath,
			target.uuid,
			targetName,
			project
		);
		project.addToHeaderSearchPaths(
			targetPath,
			target.pbxNativeTarget.productName
		);

		// Get exclude patterns for resources and src
		const resourcesExclude = config?.resourcesExclude || [];
		const srcExclude = config?.srcExclude || [];

		// Add source files to watch targets (swift, h, cpp, etc.)
		if (config?.importSourcesFromWatchFolder !== false) {
			await this.addWatchAppSourceFiles(
				path.dirname(configPath),
				[target.uuid],
				project,
				platformData,
				srcExclude
			);
		}

		// Add resources to watch targets (fonts, assets, files, etc.)
		if (config?.importResourcesFromWatchFolder !== false) {
			await this.addWatchAppResources(
				path.dirname(configPath),
				[target.uuid],
				project,
				platformData,
				resourcesExclude
			);
		}


		if (config) {
			// Process additional configurations
			await this.processWatchAppConfiguration(
				config,
				configPath,
				targetName,
				target,
				project,
				projectData,
				platformData,
				pbxProjPath
			);
		}
	}

	/**
	 * Process additional watch app configurations including modules and workspace targets
	 */
	private async processWatchAppConfiguration(
		config: Record<string, any>,
		configPath: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData,
		pbxProjPath: string
	): Promise<void> {
		this.$logger.trace(`processWatchAppConfiguration ${JSON.stringify(config)}`);

		let basedir: string | undefined;
		if (config.basedir) {
			basedir = path.resolve(path.dirname(configPath), config.basedir);
			if (!this.$fs.exists(basedir)) {
				this.$logger.warn(`Basedir not found, using config directory: ${basedir}`);
				basedir = path.dirname(configPath);
			}
		} else {
			basedir = path.dirname(configPath);
		}

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
					platformData,
					basedir
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
					project,
					projectData,
					platformData,
					basedir
				);
			}
		}

		// Handle custom source files
		if (config.src && Array.isArray(config.src)) {
			this.$logger.trace(
				`Processing ${config.src.length} custom source file(s) for watch target: ${targetName}`
			);
			for (const srcPath of config.src) {
				this.addCustomSourceFile(
					srcPath,
					target.uuid,
					targetName,
					project,
					projectData,
					platformData,
					basedir
				);
			}
		}
		// to be able to add SPM the file needs to be saved
		this.$fs.writeFile(
			pbxProjPath,
			project.writeSync({ omitEmptyValues: true })
		);
		if (config.SPMPackages && Array.isArray(config.SPMPackages)) {
			await this.applySPMPackagesToWatchTargets(
				[projectData.projectName],
				platformData,
				basedir,
				config.SPMPackages
			);
		}
	}

	/**
	 * Add custom resource (file or folder) to watch app target
	 * Requirement 7: Recursively add files when resources array contains folders
	 */
	private addCustomResource(
		resourcePath: string,
		targetUuid: string,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData,
		basedir?: string
	): void {
		const resolvedPath = this.resolvePathWithBasedir(resourcePath, basedir, projectData.projectDir);

		if (!this.$fs.exists(resolvedPath)) {
			this.$logger.warn(
				`Custom resource not found, skipping: ${resourcePath}`
			);
			return;
		}

		const relativePath = path.relative(platformData.projectRoot, resolvedPath);
		const stats = this.$fs.getFsStats(resolvedPath);

		if (stats.isDirectory()) {
			this.$logger.trace(
				`Recursively adding files from resource directory: ${resourcePath}`
			);
			this.addAllFilesRecursively(
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
	 * Add custom source file (file or folder) to watch app target
	 */
	private addCustomSourceFile(
		srcPath: string,
		targetUuid: string,
		targetName: string,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData,
		basedir?: string
	): void {
		const resolvedPath = this.resolvePathWithBasedir(srcPath, basedir, projectData.projectDir);

		if (!this.$fs.exists(resolvedPath)) {
			this.$logger.warn(
				`Custom source file/folder not found, skipping: ${srcPath}`
			);
			return;
		}

		const relativePath = path.relative(platformData.projectRoot, resolvedPath);
		const stats = this.$fs.getFsStats(resolvedPath);

		if (stats.isDirectory()) {
			// Add all source files from directory
			this.$logger.trace(
				`Adding custom source directory: ${relativePath}`
			);
			this.addAllSourceFilesFromDirectory(
				resolvedPath,
				targetUuid,
				project,
				platformData
			);
		} else {
			// Add single source file
			this.$logger.trace(`Adding custom source file: ${relativePath}`);
			(project as any).addSourceFile(relativePath, null, targetUuid);
		}
	}

	/**
	 * Helper method to resolve paths with optional basedir support
	 */
	private resolvePathWithBasedir(
		relativePath: string,
		basedir: string | undefined,
		fallbackDir: string
	): string {
		return basedir
			? path.resolve(basedir, relativePath)
			: path.resolve(fallbackDir, relativePath);
	}

	/**
	 * Add all source files from a directory (non-recursively) to target
	 */
	private addAllSourceFilesFromDirectory(
		dirPath: string,
		targetUuid: string,
		project: IXcode.project,
		platformData: IPlatformData
	): void {
		const sourceExtensions = [
			'.swift', '.m', '.mm', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'
		];

		const items = this.$fs.readDirectory(dirPath);

		for (const item of items) {
			// Skip hidden files
			if (item.startsWith('.')) {
				continue;
			}

			const itemPath = path.join(dirPath, item);
			const stats = this.$fs.getFsStats(itemPath);
			const relativePath = path.relative(platformData.projectRoot, itemPath);

			if (!stats.isDirectory()) {
				// Check if file is a source file by extension
				const ext = path.extname(item).toLowerCase();
				if (sourceExtensions.includes(ext)) {
					this.$logger.trace(`Adding source file: ${relativePath}`);
					(project as any).addSourceFile(relativePath, null, targetUuid);
				}
			}
		}
	}

	/**
	 * Recursively add all files from a directory as resources
	 * Requirement 7: Used for resources array with folders
	 */
	private addAllFilesRecursively(
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
				// Special handling for .xcassets, .bundle - add as bundles, not recursively
				if (item.endsWith('.xcassets') || item.endsWith('.bundle')) {
					this.$logger.trace(`Adding resource bundle: ${relativePath}`);
					(project as any).addResourceFile(relativePath, { target: targetUuid });
				} else {
					// Recursively process subdirectories
					this.addAllFilesRecursively(itemPath, targetUuid, project, platformData);
				}
			} else {
				// Add individual file
				this.$logger.trace(`Adding resource file: ${relativePath}`);
				(project as any).addResourceFile(relativePath, { target: targetUuid });
			}
		}
	}

	/**
	 * Add module dependency to target
	 */
	private async addModuleDependency(
		moduleDef: any,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		projectData: IProjectData,
		platformData: IPlatformData,
		basedir?: string
	): Promise<void> {
		const modulePath = moduleDef.path
			? this.resolvePathWithBasedir(moduleDef.path, basedir, projectData.projectDir)
			: null;

		this.$logger.trace(`Adding module dependency: ${moduleDef} to ${targetName}`);

		if (!modulePath || !this.$fs.exists(modulePath)) {
			this.$logger.warn(`Module path not found, skipping module: ${modulePath}`);
			return;
		}

		const relativePath = path.relative(platformData.projectRoot, modulePath);
		const stats = this.$fs.getFsStats(modulePath);

		// Check if it's a framework/xcframework or a folder-based module
		const isFramework = modulePath.endsWith('.framework') || modulePath.endsWith('.xcframework');
		const isFolder = stats.isDirectory() && !isFramework;

		// Check for Swift Package (has Package.swift and Sources folder)
		const hasPackageSwift = isFolder && this.$fs.exists(path.join(modulePath, 'Package.swift'));
		const hasSourcesDir = hasPackageSwift && this.$fs.exists(path.join(modulePath, 'Sources'));
		const isSwiftPackage = hasPackageSwift && hasSourcesDir;

		if (isFramework) {
			// Handle compiled frameworks (xcframework, framework)
			this.addCompiledFramework(moduleDef, relativePath, targetName, target, project);
		} else if (isSwiftPackage) {
			// Handle Swift Package modules
			await this.addSwiftPackageModule(moduleDef, modulePath, relativePath, targetName, target, project, platformData);
		} else if (isFolder) {
			// Handle folder-based modules
			await this.addFolderModule(moduleDef, modulePath, relativePath, targetName, target, project, projectData, platformData);
		} else {
			this.$logger.warn(`Unknown module type for: ${modulePath}`);
		}

		// Add system framework dependencies if specified
		if (moduleDef.frameworks && Array.isArray(moduleDef.frameworks)) {
			this.$logger.trace(`Adding ${moduleDef.frameworks.length} framework(s) for module ${moduleDef}`);
			for (const framework of moduleDef.frameworks) {
				project.addFramework(framework, { target: target.uuid });
				this.$logger.trace(`Added framework dependency: ${framework}`);
			}
		}

		// Add header search paths for module (works for both types)
		if (moduleDef.headerSearchPaths && Array.isArray(moduleDef.headerSearchPaths)) {
			for (const headerPath of moduleDef.headerSearchPaths) {
				const resolvedPath = this.resolvePathWithBasedir(headerPath, basedir, projectData.projectDir);
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
	 * TODO: Requirement 2, 3, 4 - Create separate module targets for source-based modules
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
		// TODO: Requirement 3 - Create clean hierarchy under watch target name
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
	 * Requirement 5: Add Swift Package module to target
	 * TODO: Requirement 2 - Create separate module targets for Swift Packages
	 */
	private async addSwiftPackageModule(
		moduleDef: any,
		modulePath: string,
		relativePath: string,
		targetName: string,
		target: IXcode.target,
		project: IXcode.project,
		platformData: IPlatformData
	): Promise<void> {
		const moduleName = moduleDef.name || path.basename(modulePath);

		this.$logger.trace(`Adding Swift Package module: ${moduleName}`);

		// Check for Sources directory
		const sourcesPath = path.join(modulePath, 'Sources');
		if (!this.$fs.exists(sourcesPath)) {
			this.$logger.warn(`No Sources directory found in Swift Package: ${modulePath}`);
			return;
		}

		// Add sources directly to watch target
		this.addSourceFilesFromDirectory(
			sourcesPath,
			target.uuid,
			project,
			platformData
		);

		// Add header search paths
		project.addToHeaderSearchPaths(relativePath, targetName);
		const sourcesRelativePath = path.relative(platformData.projectRoot, sourcesPath);
		project.addToHeaderSearchPaths(sourcesRelativePath, targetName);

		this.$logger.trace(`Added Swift Package module ${moduleName} at ${relativePath}`);
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
	 * Check if a path should be excluded based on glob patterns
	 */
	private shouldExclude(filePath: string, excludePatterns: string[]): boolean {
		for (const pattern of excludePatterns) {
			const matcher = new Minimatch(pattern, { dot: true });
			if (matcher.match(filePath)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Apply SPM packages to watch app targets
	 */
	private async applySPMPackagesToWatchTargets(
		targetNames: string[],
		platformData: IPlatformData,
		basedir: string,
		watchSPMPackages: any[]
	): Promise<void> {
		try {
			this.$logger.trace(`applySPMPackagesToWatchTargets ${JSON.stringify(watchSPMPackages)}`);
			if (watchSPMPackages.length === 0) {
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
					pkg.path = path.resolve(basedir, pkg.path);
				}

				this.$logger.trace(`Adding SPM package ${pkg.name} to target ${targetNames}`);
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
