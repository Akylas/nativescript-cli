interface IAppFilesHashes {
	appFilesHashes: IStringDictionary;
}

interface IPrepareInfo extends IAddedNativePlatform, IAppFilesHashes {
	time: string;
	bundle: boolean;
	release: boolean;
	projectFileHash: string;
	changesRequireBuild: boolean;
	changesRequireBuildTime: string;
	iOSProvisioningProfileUUID?: string;
}

interface IProjectChangesInfo extends IAddedNativePlatform {
	appFilesChanged: boolean;
	appResourcesChanged: boolean;
	modulesChanged: boolean;
	configChanged: boolean;
	packageChanged: boolean;
	nativeChanged: boolean;
	bundleChanged: boolean;
	signingChanged: boolean;

	readonly hasChanges: boolean;
	readonly changesRequireBuild: boolean;
	readonly changesRequirePrepare: boolean;
}

/**
 * Describes interface for controlling checking node_modules for native changes.
 */
interface ISkipNativeCheckOptional {
	/**
	 * Designates node_modules should not be checked for native changes.
	 */
	skipModulesNativeCheck?: boolean;
}

interface IProjectChangesOptions extends IAppFilesUpdaterOptions, IProvision, ITeamIdentifier, ISkipNativeCheckOptional {
	nativePlatformStatus?: "1" | "2" | "3";
}

interface ICheckForChangesOptions extends IPlatform, IProjectDataComposition {
	projectChangesOptions: IProjectChangesOptions;
}

interface IProjectChangesService {
	checkForChanges(checkForChangesOpts: ICheckForChangesOptions): Promise<IProjectChangesInfo>;
	getPrepareInfo(platform: string, projectData: IProjectData): IPrepareInfo;
	savePrepareInfo(platform: string, projectData: IProjectData): void;
	getPrepareInfoFilePath(platform: string, projectData: IProjectData): string;
	setNativePlatformStatus(platform: string, projectData: IProjectData, nativePlatformStatus: IAddedNativePlatform): void;
	currentChanges: IProjectChangesInfo;
}

/**
 * NativePlatformStatus.requiresPlatformAdd | NativePlatformStatus.requiresPrepare | NativePlatformStatus.alreadyPrepared
 */
interface IAddedNativePlatform {
	nativePlatformStatus: "1" | "2" | "3";
}
